import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  PHOTO_BUCKET,
  complaintThreshold,
  guestDb,
  normaliseGuestCode,
  requireGuestSession,
} from "@/lib/guest-internal";

/**
 * Guest stay portal (no login), ported from Air.
 *
 * None of these functions carry auth middleware — the guest has no account.
 * Security comes from three things instead:
 *   1. the property is found by a short public code that reveals nothing;
 *   2. starting a stay session requires the door access code, which is stored
 *      encrypted and only ever compared server-side;
 *   3. every later call re-resolves the session id and its expiry.
 */

const sessionInput = z.object({ sessionId: z.string().uuid() });

export type GuestPortal = {
  propertyName: string;
  orgName: string;
  city: string | null;
};

/** Public: resolve /g/<code> to the little a guest may see before unlocking. */
export const getGuestPortal = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ code: z.string().min(4).max(40) }).parse(d))
  .handler(async ({ data }): Promise<GuestPortal | null> => {
    const db = await guestDb();
    const { data: property } = await db
      .from("properties")
      .select("id, name, city, org_id, active")
      .eq("guest_code", normaliseGuestCode(data.code))
      .maybeSingle();
    if (!property || !property.active) return null;

    const { data: org } = await db
      .from("organizations")
      .select("name")
      .eq("id", property.org_id)
      .maybeSingle();

    return {
      propertyName: property.name,
      orgName: org?.name ?? "your host",
      city: property.city,
    };
  });

/** Public: exchange the door access code for a stay session. */
export const startGuestSession = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        code: z.string().min(4).max(40),
        accessCode: z.string().min(1).max(120),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const db = await guestDb();
    const { data: property } = await db
      .from("properties")
      .select("id, org_id, name, access_code_enc, active")
      .eq("guest_code", normaliseGuestCode(data.code))
      .maybeSingle();
    if (!property || !property.active) throw new Error("bad_code");

    const { decryptField } = await import("./crypto.server");
    const expected = await decryptField(property.access_code_enc);
    if (!expected) throw new Error("no_access_code");
    if (expected.trim().toLowerCase() !== data.accessCode.trim().toLowerCase()) {
      throw new Error("bad_code");
    }

    const { data: session, error } = await db
      .from("guest_sessions")
      .insert({ org_id: property.org_id, property_id: property.id })
      .select("id, expires_at")
      .single();
    if (error || !session) throw new Error("Could not start your stay session.");

    return {
      sessionId: session.id,
      expiresAt: session.expires_at,
      propertyName: property.name,
    };
  });

export type GuestContext = {
  propertyName: string;
  checkedOut: boolean;
  checkIn: { guestName: string | null; partySize: number | null; checkInAt: string | null };
  amenities: Array<{
    id: string;
    name: string;
    expectedQty: number;
    unit: string | null;
    foundQty: number | null;
  }>;
  reports: Array<{
    id: string;
    rating: number | null;
    notes: string | null;
    complaint: string | null;
    status: string;
    createdAt: string;
  }>;
};

/** Public: everything the stay page renders once the session exists. */
export const getGuestContext = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => sessionInput.parse(d))
  .handler(async ({ data }): Promise<GuestContext> => {
    const session = await requireGuestSession(data.sessionId);
    const db = await guestDb();

    const [{ data: row }, { data: amenities }, { data: checks }, { data: reports }] =
      await Promise.all([
        db
          .from("guest_sessions")
          .select("guest_name, party_size, check_in_at")
          .eq("id", session.sessionId)
          .maybeSingle(),
        db
          .from("amenity_definitions")
          .select("id, name, expected_qty, unit")
          .eq("property_id", session.propertyId)
          .eq("active", true)
          .order("sort_order")
          .order("name"),
        db
          .from("amenity_checks")
          .select("amenity_id, found_qty")
          .eq("session_id", session.sessionId),
        db
          .from("guest_reports")
          .select("id, overall_rating, notes, complaint, status, created_at")
          .eq("session_id", session.sessionId)
          .order("created_at", { ascending: false }),
      ]);

    const found = new Map((checks ?? []).map((c) => [c.amenity_id, c.found_qty]));

    return {
      propertyName: session.propertyName,
      checkedOut: session.checkedOut,
      checkIn: {
        guestName: row?.guest_name ?? null,
        partySize: row?.party_size ?? null,
        checkInAt: row?.check_in_at ?? null,
      },
      amenities: (amenities ?? []).map((a) => ({
        id: a.id,
        name: a.name,
        expectedQty: a.expected_qty,
        unit: a.unit,
        foundQty: found.has(a.id) ? (found.get(a.id) as number) : null,
      })),
      reports: (reports ?? []).map((r) => ({
        id: r.id,
        rating: r.overall_rating,
        notes: r.notes,
        complaint: r.complaint,
        status: r.status,
        createdAt: r.created_at,
      })),
    };
  });

/** Public: the guest confirms who is staying. */
export const saveGuestCheckIn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        sessionId: z.string().uuid(),
        guestName: z.string().min(1).max(120),
        partySize: z.number().int().min(1).max(30),
        contactNumber: z.string().max(40).nullable().default(null),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const session = await requireGuestSession(data.sessionId);
    if (session.checkedOut) throw new Error("This stay is already checked out.");

    const db = await guestDb();
    const { encryptField } = await import("./crypto.server");

    const { error } = await db
      .from("guest_sessions")
      .update({
        guest_name: data.guestName.trim(),
        party_size: data.partySize,
        contact_number_enc: await encryptField(data.contactNumber),
        check_in_at: new Date().toISOString(),
      })
      .eq("id", session.sessionId);
    if (error) throw new Error("Could not save your check-in.");

    const { logAudit } = await import("./ops.server");
    await logAudit({
      orgId: session.orgId,
      actorType: "system",
      action: "guest_checked_in",
      entityType: "guest_session",
      entityId: session.sessionId,
      metadata: { propertyId: session.propertyId, partySize: data.partySize },
    });

    return { ok: true };
  });

/** Public: the guest counts what is actually in the unit. */
export const saveGuestAmenityCheck = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        sessionId: z.string().uuid(),
        entries: z
          .array(
            z.object({
              amenityId: z.string().uuid(),
              foundQty: z.number().int().min(0).max(999),
              note: z.string().max(300).nullable().default(null),
            }),
          )
          .min(1)
          .max(200),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const session = await requireGuestSession(data.sessionId);
    if (session.checkedOut) throw new Error("This stay is already checked out.");

    const db = await guestDb();
    const { data: amenities } = await db
      .from("amenity_definitions")
      .select("id")
      .eq("property_id", session.propertyId)
      .eq("active", true);

    const allowed = new Set((amenities ?? []).map((a) => a.id));
    const rows = data.entries
      .filter((e) => allowed.has(e.amenityId))
      .map((e) => ({
        org_id: session.orgId,
        property_id: session.propertyId,
        amenity_id: e.amenityId,
        session_id: session.sessionId,
        source: "guest" as const,
        found_qty: e.foundQty,
        note: e.note,
      }));
    if (rows.length === 0) throw new Error("Nothing to save.");

    const { error } = await db
      .from("amenity_checks")
      .upsert(rows, { onConflict: "session_id,amenity_id" });
    if (error) throw new Error("Could not save your check.");

    return { saved: rows.length };
  });

/** Public: prepare a direct upload slot for a hygiene photo. */
export const requestGuestPhotoUpload = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        sessionId: z.string().uuid(),
        extension: z.enum(["jpg", "jpeg", "png", "webp"]),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const session = await requireGuestSession(data.sessionId);
    const db = await guestDb();

    const key = `${session.orgId}/guest/${session.sessionId}/${crypto.randomUUID()}.${data.extension}`;
    const { data: signed, error } = await db.storage.from(PHOTO_BUCKET).createSignedUploadUrl(key);
    if (error || !signed) throw new Error("Could not prepare the photo upload.");
    return { key, token: signed.token, path: signed.path };
  });

/**
 * Public: the guest rates the stay, and optionally complains.
 *
 * A submission becomes a complaint when there is complaint text or a hygiene
 * photo; a rating below the workspace threshold is flagged as a low rating.
 * Ordinary praise never pages the team.
 */
export const submitGuestReport = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        sessionId: z.string().uuid(),
        overallRating: z.number().int().min(1).max(5).nullable().default(null),
        notes: z.string().max(2000).nullable().default(null),
        complaint: z.string().max(2000).nullable().default(null),
        photoKeys: z.array(z.string().min(5).max(300)).max(6).default([]),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const session = await requireGuestSession(data.sessionId);
    const db = await guestDb();

    const complaint = data.complaint && data.complaint.trim() ? data.complaint.trim() : null;
    const notes = data.notes && data.notes.trim() ? data.notes.trim() : null;
    if (!complaint && !notes && data.overallRating === null) {
      throw new Error("Add a rating, a note or a complaint first.");
    }

    const prefix = `${session.orgId}/guest/${session.sessionId}/`;
    const photoKeys = data.photoKeys.filter((k) => k.startsWith(prefix));

    const [{ data: property }, { data: org }] = await Promise.all([
      db
        .from("properties")
        .select("name, complaint_star_threshold")
        .eq("id", session.propertyId)
        .maybeSingle(),
      db
        .from("organizations")
        .select("complaint_star_threshold")
        .eq("id", session.orgId)
        .maybeSingle(),
    ]);

    const threshold = complaintThreshold(
      property?.complaint_star_threshold,
      org?.complaint_star_threshold,
    );

    const kind: "complaint" | "low_rating" | "feedback" =
      complaint || photoKeys.length > 0
        ? "complaint"
        : data.overallRating !== null && data.overallRating < threshold
          ? "low_rating"
          : "feedback";

    const { data: report, error } = await db
      .from("guest_reports")
      .insert({
        org_id: session.orgId,
        property_id: session.propertyId,
        session_id: session.sessionId,
        overall_rating: data.overallRating,
        notes,
        complaint,
        kind,
        status: kind === "feedback" ? "resolved" : "open",
      })
      .select("id")
      .single();
    if (error || !report) throw new Error("Could not send your feedback.");

    if (photoKeys.length > 0) {
      await db.from("guest_report_photos").insert(
        photoKeys.map((key) => ({
          org_id: session.orgId,
          report_id: report.id,
          storage_key: key,
        })),
      );
    }

    const { logAudit, notifyStaff } = await import("./ops.server");
    await logAudit({
      orgId: session.orgId,
      actorType: "system",
      action: "guest_report_submitted",
      entityType: "guest_report",
      entityId: report.id,
      reasonCodes: [kind],
      metadata: {
        propertyId: session.propertyId,
        rating: data.overallRating,
        photos: photoKeys.length,
      },
    });

    if (kind !== "feedback") {
      await notifyStaff(
        session.orgId,
        kind === "complaint" ? "guest_complaint" : "guest_low_rating",
        {
          property: property?.name ?? session.propertyName,
          rating: data.overallRating === null ? "no" : String(data.overallRating),
          detail: complaint ?? notes ?? "No details given.",
        },
      );
    }

    return { id: report.id, kind };
  });

/** Public: the guest closes the stay. */
export const checkoutGuestSession = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => sessionInput.parse(d))
  .handler(async ({ data }) => {
    const session = await requireGuestSession(data.sessionId);
    if (session.checkedOut) return { ok: true };

    const db = await guestDb();
    const { error } = await db
      .from("guest_sessions")
      .update({ checked_out_at: new Date().toISOString() })
      .eq("id", session.sessionId);
    if (error) throw new Error("Could not check you out.");

    const { logAudit } = await import("./ops.server");
    await logAudit({
      orgId: session.orgId,
      actorType: "system",
      action: "guest_checked_out",
      entityType: "guest_session",
      entityId: session.sessionId,
      metadata: { propertyId: session.propertyId },
    });

    return { ok: true };
  });
