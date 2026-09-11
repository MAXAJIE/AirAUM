import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const bookingBase = z.object({
  propertyId: z.string().uuid(),
  guestName: z.string().max(120).nullable(),
  guests: z.number().int().min(1).max(40),
  externalRef: z.string().max(120).nullable(),
  source: z.enum(["manual", "csv", "airbnb", "booking_com", "agoda", "direct", "other"]),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOutTime: z.string().regex(/^\d{2}:\d{2}$/),
  nextCheckInTime: z.string().regex(/^\d{2}:\d{2}$/),
});

export const listBookings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireMembership, supabaseAdmin, STAFF_ROLES } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId, STAFF_ROLES);

    const { data: rows } = await supabaseAdmin
      .from("bookings")
      .select("*")
      .eq("org_id", data.orgId)
      .order("check_out", { ascending: false })
      .limit(300);

    const { data: props } = await supabaseAdmin
      .from("properties")
      .select("id, name, unit_label")
      .eq("org_id", data.orgId);
    const byId = new Map((props ?? []).map((p) => [p.id, p]));

    return (rows ?? []).map((b) => ({
      id: b.id,
      propertyId: b.property_id,
      propertyName: byId.get(b.property_id)?.name ?? "Unknown property",
      unitLabel: byId.get(b.property_id)?.unit_label ?? null,
      guestName: b.guest_name,
      guests: b.guests,
      source: b.source,
      externalRef: b.external_ref,
      checkIn: b.check_in,
      checkOut: b.check_out,
      checkOutTime: b.check_out_time.slice(0, 5),
      nextCheckInTime: b.next_check_in_time.slice(0, 5),
      cancelled: b.cancelled,
    }));
  });

export const saveBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => bookingBase.extend({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireMembership, supabaseAdmin, STAFF_ROLES } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId, STAFF_ROLES);
    if (data.checkOut < data.checkIn) throw new Error("Check-out cannot be before check-in.");

    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("timezone")
      .eq("id", data.orgId)
      .maybeSingle();

    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .insert({
        org_id: data.orgId,
        property_id: data.propertyId,
        guest_name: data.guestName,
        guests: data.guests,
        external_ref: data.externalRef,
        source: data.source,
        check_in: data.checkIn,
        check_out: data.checkOut,
        check_out_time: `${data.checkOutTime}:00`,
        next_check_in_time: `${data.nextCheckInTime}:00`,
      })
      .select("*")
      .single();
    if (error || !booking) throw new Error("Could not save the booking. It may already exist.");

    const { ensureTurnoverTask } = await import("./scheduling.server");
    const taskId = await ensureTurnoverTask(data.orgId, booking, org?.timezone ?? "UTC", context.userId);
    return { id: booking.id, taskId };
  });

export const cancelBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireMembership, supabaseAdmin, STAFF_ROLES, logAudit } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId, STAFF_ROLES);

    await supabaseAdmin.from("bookings").update({ cancelled: true }).eq("id", data.id).eq("org_id", data.orgId);
    await supabaseAdmin
      .from("tasks")
      .update({ status: "cancelled" })
      .eq("booking_id", data.id)
      .in("status", ["unassigned", "assigned"]);
    await logAudit({
      orgId: data.orgId,
      actorId: context.userId,
      action: "booking.cancelled",
      entityType: "booking",
      entityId: data.id,
    });
    return { ok: true };
  });

/** Splits a CSV line honouring quoted fields. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

export const importBookingsCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ orgId: z.string().uuid(), csv: z.string().min(1).max(600_000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireMembership, supabaseAdmin, STAFF_ROLES, logAudit } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId, STAFF_ROLES);

    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("timezone")
      .eq("id", data.orgId)
      .maybeSingle();
    const { data: props } = await supabaseAdmin
      .from("properties")
      .select("id, name, unit_label")
      .eq("org_id", data.orgId);

    const propKey = new Map<string, string>();
    for (const p of props ?? []) {
      propKey.set(p.name.trim().toLowerCase(), p.id);
      if (p.unit_label) propKey.set(`${p.name} ${p.unit_label}`.trim().toLowerCase(), p.id);
    }

    const lines = data.csv.split(/\r?\n/).filter((l) => l.trim().length);
    if (lines.length < 2) throw new Error("The file has no rows under the header.");
    const header = splitCsvLine(lines[0]!).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
    const idx = (names: string[]) => names.map((n) => header.indexOf(n)).find((i) => i >= 0) ?? -1;

    const iProp = idx(["property", "property_name", "listing"]);
    const iIn = idx(["check_in", "checkin", "start_date", "arrival"]);
    const iOut = idx(["check_out", "checkout", "end_date", "departure"]);
    const iGuest = idx(["guest", "guest_name", "name"]);
    const iGuests = idx(["guests", "pax", "adults"]);
    const iRef = idx(["reference", "confirmation_code", "external_ref", "id"]);
    const iOutTime = idx(["check_out_time", "checkout_time"]);
    const iInTime = idx(["next_check_in_time", "check_in_time", "checkin_time"]);

    if (iProp < 0 || iIn < 0 || iOut < 0) {
      throw new Error("The file needs at least Property, Check-in and Check-out columns.");
    }

    const errors: string[] = [];
    let imported = 0;
    let tasksCreated = 0;
    let skipped = 0;

    const normDate = (v: string): string | null => {
      const s = v.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
      if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
      const parsed = new Date(s);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
    };
    const normTime = (v: string | undefined, fallback: string) => {
      const m = (v ?? "").trim().match(/^(\d{1,2}):(\d{2})/);
      return m ? `${m[1]!.padStart(2, "0")}:${m[2]}:00` : fallback;
    };

    const { ensureTurnoverTask } = await import("./scheduling.server");

    for (let r = 1; r < lines.length; r++) {
      const cells = splitCsvLine(lines[r]!);
      const propName = (cells[iProp] ?? "").trim().toLowerCase();
      const propertyId = propKey.get(propName);
      if (!propertyId) {
        errors.push(`Row ${r + 1}: no property named "${cells[iProp] ?? ""}"`);
        continue;
      }
      const checkIn = normDate(cells[iIn] ?? "");
      const checkOut = normDate(cells[iOut] ?? "");
      if (!checkIn || !checkOut) {
        errors.push(`Row ${r + 1}: could not read the dates`);
        continue;
      }

      const { data: booking, error } = await supabaseAdmin
        .from("bookings")
        .insert({
          org_id: data.orgId,
          property_id: propertyId,
          guest_name: iGuest >= 0 ? (cells[iGuest] || null) : null,
          guests: iGuests >= 0 ? Math.max(1, Number(cells[iGuests]) || 1) : 1,
          external_ref: iRef >= 0 ? (cells[iRef] || null) : null,
          source: "csv" as const,
          check_in: checkIn,
          check_out: checkOut,
          check_out_time: normTime(iOutTime >= 0 ? cells[iOutTime] : undefined, "11:00:00"),
          next_check_in_time: normTime(iInTime >= 0 ? cells[iInTime] : undefined, "15:00:00"),
        })
        .select("*")
        .maybeSingle();

      if (error || !booking) {
        // 23505 = the same stay is already in the system; re-importing a file
        // is safe and simply skips rows that are already there.
        if (error?.code === "23505") {
          skipped++;
          continue;
        }
        errors.push(`Row ${r + 1}: ${error?.message ?? "could not be saved"}`);
        continue;
      }
      imported++;
      const taskId = await ensureTurnoverTask(data.orgId, booking, org?.timezone ?? "UTC", context.userId);
      if (taskId) tasksCreated++;
    }

    await logAudit({
      orgId: data.orgId,
      actorId: context.userId,
      action: "bookings.csv_imported",
      entityType: "booking",
      metadata: { imported, tasksCreated, skipped, failed: errors.length },
    });

    return { imported, tasksCreated, skipped, errors: errors.slice(0, 25) };
  });
