import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PHOTO_BUCKET, guestDb } from "@/lib/guest-internal";

/**
 * Staff side of the guest stay flow: share links, maintain the amenity list
 * for a property, and work the queue of complaints and low ratings.
 */

const orgInput = z.object({ orgId: z.string().uuid() });

/** Properties with their guest link code. */
export const listGuestProperties = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => orgInput.parse(d))
  .handler(async ({ data, context }) => {
    const { requireMembership, STAFF_ROLES } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId, STAFF_ROLES);

    const db = await guestDb();
    const { data: rows, error } = await db
      .from("properties")
      .select("id, name, city, guest_code, active")
      .eq("org_id", data.orgId)
      .order("name");
    if (error) throw new Error("Could not load properties.");

    return (rows ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      city: p.city,
      guestCode: p.guest_code,
      active: p.active,
    }));
  });

/** The expected inventory for one property. */
export const listAmenities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ orgId: z.string().uuid(), propertyId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireMembership, STAFF_ROLES } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId, STAFF_ROLES);

    const db = await guestDb();
    const { data: rows, error } = await db
      .from("amenity_definitions")
      .select("id, name, expected_qty, unit, sort_order")
      .eq("org_id", data.orgId)
      .eq("property_id", data.propertyId)
      .eq("active", true)
      .order("sort_order")
      .order("name");
    if (error) throw new Error("Could not load the item list.");

    return (rows ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      expectedQty: a.expected_qty,
      unit: a.unit,
      sortOrder: a.sort_order,
    }));
  });

/** Add or update one expected item. */
export const saveAmenity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        propertyId: z.string().uuid(),
        id: z.string().uuid().nullable().default(null),
        name: z.string().min(1).max(120),
        expectedQty: z.number().int().min(0).max(999),
        unit: z.string().max(30).nullable().default(null),
        sortOrder: z.number().int().min(0).max(999).default(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireMembership, ADMIN_ROLES, logAudit } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId, ADMIN_ROLES);

    const db = await guestDb();
    const values = {
      org_id: data.orgId,
      property_id: data.propertyId,
      name: data.name.trim(),
      expected_qty: data.expectedQty,
      unit: data.unit,
      sort_order: data.sortOrder,
      active: true,
      updated_at: new Date().toISOString(),
    };

    const query = data.id
      ? db.from("amenity_definitions").update(values).eq("id", data.id).eq("org_id", data.orgId)
      : db.from("amenity_definitions").insert(values);

    const { error } = await query;
    if (error) throw new Error("Could not save the item.");

    await logAudit({
      orgId: data.orgId,
      actorId: context.userId,
      action: data.id ? "amenity_updated" : "amenity_created",
      entityType: "amenity_definition",
      entityId: data.id,
      metadata: { propertyId: data.propertyId, name: values.name },
    });

    return { ok: true };
  });

/** Retire an item without losing past counts. */
export const removeAmenity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ orgId: z.string().uuid(), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireMembership, ADMIN_ROLES, logAudit } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId, ADMIN_ROLES);

    const db = await guestDb();
    const { error } = await db
      .from("amenity_definitions")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("org_id", data.orgId);
    if (error) throw new Error("Could not remove the item.");

    await logAudit({
      orgId: data.orgId,
      actorId: context.userId,
      action: "amenity_removed",
      entityType: "amenity_definition",
      entityId: data.id,
    });

    return { ok: true };
  });

export type GuestReportView = {
  id: string;
  propertyId: string;
  propertyName: string;
  sessionId: string;
  guestName: string | null;
  rating: number | null;
  notes: string | null;
  complaint: string | null;
  kind: string;
  status: string;
  resolutionNote: string | null;
  createdAt: string;
  photos: string[];
  missingItems: Array<{ name: string; expected: number; found: number }>;
};

/** The complaint / low-rating queue, with photos and inventory gaps. */
export const listGuestReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        status: z.enum(["open", "resolved", "dismissed", "all"]).default("open"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<GuestReportView[]> => {
    const { requireMembership, STAFF_ROLES } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId, STAFF_ROLES);

    const db = await guestDb();
    let query = db
      .from("guest_reports")
      .select(
        "id, property_id, session_id, overall_rating, notes, complaint, kind, status, resolution_note, created_at",
      )
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status !== "all") query = query.eq("status", data.status);

    const { data: reports, error } = await query;
    if (error) throw new Error("Could not load guest reports.");
    if (!reports || reports.length === 0) return [];

    const propertyIds = [...new Set(reports.map((r) => r.property_id))];
    const sessionIds = [...new Set(reports.map((r) => r.session_id))];
    const reportIds = reports.map((r) => r.id);

    const [
      { data: properties },
      { data: sessions },
      { data: photos },
      { data: checks },
      { data: amenities },
    ] = await Promise.all([
      db.from("properties").select("id, name").in("id", propertyIds),
      db.from("guest_sessions").select("id, guest_name").in("id", sessionIds),
      db.from("guest_report_photos").select("report_id, storage_key").in("report_id", reportIds),
      db
        .from("amenity_checks")
        .select("session_id, amenity_id, found_qty")
        .in("session_id", sessionIds),
      db
        .from("amenity_definitions")
        .select("id, name, expected_qty")
        .in("property_id", propertyIds),
    ]);

    const propertyName = new Map((properties ?? []).map((p) => [p.id, p.name]));
    const guestName = new Map((sessions ?? []).map((s) => [s.id, s.guest_name]));
    const amenity = new Map((amenities ?? []).map((a) => [a.id, a]));

    const photosByReport = new Map<string, string[]>();
    for (const row of photos ?? []) {
      const { data: signed } = await db.storage
        .from(PHOTO_BUCKET)
        .createSignedUrl(row.storage_key, 60 * 30);
      if (!signed?.signedUrl) continue;
      const list = photosByReport.get(row.report_id) ?? [];
      list.push(signed.signedUrl);
      photosByReport.set(row.report_id, list);
    }

    const gapsBySession = new Map<
      string,
      Array<{ name: string; expected: number; found: number }>
    >();
    for (const check of checks ?? []) {
      const def = amenity.get(check.amenity_id);
      if (!def || check.found_qty >= def.expected_qty) continue;
      const list = gapsBySession.get(check.session_id ?? "") ?? [];
      list.push({ name: def.name, expected: def.expected_qty, found: check.found_qty });
      gapsBySession.set(check.session_id ?? "", list);
    }

    return reports.map((r) => ({
      id: r.id,
      propertyId: r.property_id,
      propertyName: propertyName.get(r.property_id) ?? "Property",
      sessionId: r.session_id,
      guestName: guestName.get(r.session_id) ?? null,
      rating: r.overall_rating,
      notes: r.notes,
      complaint: r.complaint,
      kind: r.kind,
      status: r.status,
      resolutionNote: r.resolution_note,
      createdAt: r.created_at,
      photos: photosByReport.get(r.id) ?? [],
      missingItems: gapsBySession.get(r.session_id) ?? [],
    }));
  });

/** Close a complaint or dismiss it, with a note for the audit trail. */
export const resolveGuestReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        id: z.string().uuid(),
        status: z.enum(["resolved", "dismissed"]),
        resolutionNote: z.string().max(1000).nullable().default(null),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireMembership, STAFF_ROLES, logAudit } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId, STAFF_ROLES);

    const db = await guestDb();
    const { error } = await db
      .from("guest_reports")
      .update({
        status: data.status,
        resolution_note: data.resolutionNote,
        resolved_by: context.userId,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("org_id", data.orgId);
    if (error) throw new Error("Could not update the report.");

    await logAudit({
      orgId: data.orgId,
      actorId: context.userId,
      action: `guest_report_${data.status}`,
      entityType: "guest_report",
      entityId: data.id,
      metadata: { note: data.resolutionNote ?? "" },
    });

    return { ok: true };
  });
