import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { guestDb, normaliseGuestCode } from "@/lib/guest-internal";
import type { Database } from "@/integrations/supabase/types";

/**
 * Customer reviews.
 *
 * Guests leave feedback through a public link (/r/<workspace-slug>), so the
 * lookup and submit functions carry no auth middleware and write server-side
 * after validating the payload themselves. Everything a manager does with a
 * review is gated on workspace membership.
 */

export type CustomerReview = {
  id: string;
  rating: number;
  cleanliness: number | null;
  communication: number | null;
  customerName: string | null;
  comment: string | null;
  status: "new" | "published" | "archived";
  reply: string | null;
  propertyId: string | null;
  propertyName: string | null;
  createdAt: string;
};

/** One row of the "which property is struggling" breakdown. */
export type PropertyReviewStat = {
  propertyId: string | null;
  propertyName: string;
  total: number;
  average: number;
  detractors: number;
  lastReviewAt: string | null;
};

/** Public: resolve a workspace review link to the names a guest should see. */
export const getReviewTarget = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ slug: z.string().min(1).max(60) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("./ops.server");
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("id, name, slug")
      .eq("slug", data.slug.trim().toLowerCase())
      .maybeSingle();
    if (!org) return null;

    const { data: properties } = await supabaseAdmin
      .from("properties")
      .select("id, name")
      .eq("org_id", org.id)
      .order("name", { ascending: true })
      .limit(200);

    return {
      orgName: org.name,
      slug: org.slug,
      properties: (properties ?? []).map((p) => ({ id: p.id, name: p.name })),
    };
  });

/** Public: a guest submits a review. */
export const submitReview = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        slug: z.string().min(1).max(60),
        propertyId: z.string().uuid().nullable().default(null),
        rating: z.number().int().min(1).max(5),
        cleanliness: z.number().int().min(1).max(5).nullable().default(null),
        communication: z.number().int().min(1).max(5).nullable().default(null),
        customerName: z.string().max(80).nullable().default(null),
        customerEmail: z.string().email().max(160).nullable().default(null),
        comment: z.string().max(2000).nullable().default(null),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin, notifyStaff } = await import("./ops.server");

    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("id, name")
      .eq("slug", data.slug.trim().toLowerCase())
      .maybeSingle();
    if (!org) throw new Error("That review link is not valid.");

    // A property id from the form must belong to this workspace.
    let propertyId: string | null = null;
    if (data.propertyId) {
      const { data: property } = await supabaseAdmin
        .from("properties")
        .select("id")
        .eq("id", data.propertyId)
        .eq("org_id", org.id)
        .maybeSingle();
      propertyId = property?.id ?? null;
    }

    const { error } = await supabaseAdmin.from("customer_reviews").insert({
      org_id: org.id,
      property_id: propertyId,
      rating: data.rating,
      cleanliness: data.cleanliness,
      communication: data.communication,
      customer_name: data.customerName,
      customer_email: data.customerEmail,
      comment: data.comment,
      source: "public_link",
    });
    if (error) throw new Error("Could not save your review. Please try again.");

    await notifyStaff(org.id, "review_received", {
      rating: String(data.rating),
      guest: data.customerName ?? "A guest",
      org: org.name,
    });

    return { ok: true };
  });

/** Public: published reviews shown on the landing page. */
export const listShowcaseReviews = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("./ops.server");
  const { data: rows } = await supabaseAdmin
    .from("customer_reviews")
    .select("id, rating, comment, customer_name, created_at")
    .eq("status", "published")
    .not("comment", "is", null)
    .order("created_at", { ascending: false })
    .limit(6);

  return (rows ?? []).map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    // Only a first name is ever shown publicly.
    name: (r.customer_name ?? "Guest").split(" ")[0] ?? "Guest",
    createdAt: r.created_at,
  }));
});

export const listReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireMembership, supabaseAdmin } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId);

    const { data: rows } = await supabaseAdmin
      .from("customer_reviews")
      .select(
        "id, rating, cleanliness, communication, customer_name, comment, status, reply, property_id, created_at",
      )
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: false })
      .limit(200);

    const propertyIds = [
      ...new Set((rows ?? []).map((r) => r.property_id).filter(Boolean)),
    ] as string[];
    const { data: properties } = propertyIds.length
      ? await supabaseAdmin.from("properties").select("id, name").in("id", propertyIds)
      : { data: [] };
    const nameById = new Map((properties ?? []).map((p) => [p.id, p.name]));

    const reviews: CustomerReview[] = (rows ?? []).map((r) => ({
      id: r.id,
      rating: r.rating,
      cleanliness: r.cleanliness,
      communication: r.communication,
      customerName: r.customer_name,
      comment: r.comment,
      status: r.status as CustomerReview["status"],
      reply: r.reply,
      propertyId: r.property_id,
      propertyName: r.property_id ? (nameById.get(r.property_id) ?? null) : null,
      createdAt: r.created_at,
    }));

    const scored = reviews.filter((r) => r.status !== "archived");
    const average = scored.length
      ? scored.reduce((sum, r) => sum + r.rating, 0) / scored.length
      : 0;

    // Grouped per property so a single bad unit is visible instead of being
    // averaged away across the whole workspace.
    const groups = new Map<string, CustomerReview[]>();
    for (const r of scored) {
      const key = r.propertyId ?? "unassigned";
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    const byProperty: PropertyReviewStat[] = [...groups.entries()]
      .map(([key, list]) => ({
        propertyId: key === "unassigned" ? null : key,
        propertyName:
          key === "unassigned" ? "Not linked to a property" : (list[0]?.propertyName ?? "Property"),
        total: list.length,
        average: list.reduce((sum, r) => sum + r.rating, 0) / list.length,
        detractors: list.filter((r) => r.rating <= 2).length,
        lastReviewAt: list[0]?.createdAt ?? null,
      }))
      .sort((a, b) => a.average - b.average);

    return {
      reviews,
      byProperty,
      stats: {
        total: scored.length,
        average,
        promoters: scored.filter((r) => r.rating >= 4).length,
        detractors: scored.filter((r) => r.rating <= 2).length,
      },
    };
  });

export const updateReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        reviewId: z.string().uuid(),
        status: z.enum(["new", "published", "archived"]).optional(),
        reply: z.string().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireMembership, supabaseAdmin, ADMIN_ROLES, logAudit } =
      await import("./ops.server");
    await requireMembership(context.userId, data.orgId, ADMIN_ROLES);

    const patch: Database["public"]["Tables"]["customer_reviews"]["Update"] = {};
    if (data.status) patch["status"] = data.status;
    if (data.reply !== undefined) {
      patch["reply"] = data.reply;
      patch["replied_by"] = context.userId;
      patch["replied_at"] = new Date().toISOString();
    }
    if (Object.keys(patch).length === 0) return { ok: true };

    const { error } = await supabaseAdmin
      .from("customer_reviews")
      .update(patch)
      .eq("id", data.reviewId)
      .eq("org_id", data.orgId);
    if (error) throw new Error("Could not update that review.");

    await logAudit({
      orgId: data.orgId,
      actorId: context.userId,
      action: "review.updated",
      entityType: "customer_review",
      entityId: data.reviewId,
      metadata: { status: data.status ?? null, replied: data.reply !== undefined },
    });
    return { ok: true };
  });

/* ------------------------------------------------------------------ *
 * Per-property review QR (/r/p/<code>)
 *
 * The workspace-wide link blends every unit into one stream and relies on the
 * guest picking the right property. A printed QR in the unit carries that
 * property's own code, so the review is attributed on arrival and the reviews
 * screen can show which property is slipping.
 * ------------------------------------------------------------------ */

/** Public: resolve a property review code to what the guest should see. */
export const getPropertyReviewTarget = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ code: z.string().min(4).max(40) }).parse(d))
  .handler(async ({ data }) => {
    const db = await guestDb();
    const { data: property } = await db
      .from("properties")
      .select("id, org_id, name, unit_label, city, active")
      .eq("review_code", normaliseGuestCode(data.code))
      .maybeSingle();
    if (!property || !property.active) return null;

    const { data: org } = await db
      .from("organizations")
      .select("id, name")
      .eq("id", property.org_id)
      .maybeSingle();
    if (!org) return null;

    return {
      orgName: org.name,
      propertyId: property.id,
      propertyName: property.name,
      unitLabel: property.unit_label,
      city: property.city,
    };
  });

/** Public: a guest submits a review from a property QR. */
export const submitPropertyReview = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        code: z.string().min(4).max(40),
        rating: z.number().int().min(1).max(5),
        cleanliness: z.number().int().min(1).max(5).nullable().default(null),
        communication: z.number().int().min(1).max(5).nullable().default(null),
        customerName: z.string().max(80).nullable().default(null),
        customerEmail: z.string().email().max(160).nullable().default(null),
        comment: z.string().max(2000).nullable().default(null),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { notifyStaff } = await import("./ops.server");
    const db = await guestDb();

    const { data: property } = await db
      .from("properties")
      .select("id, org_id, name, active")
      .eq("review_code", normaliseGuestCode(data.code))
      .maybeSingle();
    if (!property || !property.active) throw new Error("That review code is not valid.");

    const { data: org } = await db
      .from("organizations")
      .select("id, name, complaint_star_threshold")
      .eq("id", property.org_id)
      .maybeSingle();
    if (!org) throw new Error("That review code is not valid.");

    const { error } = await db.from("customer_reviews").insert({
      org_id: property.org_id,
      property_id: property.id,
      rating: data.rating,
      cleanliness: data.cleanliness,
      communication: data.communication,
      customer_name: data.customerName,
      customer_email: data.customerEmail,
      comment: data.comment,
      source: "property_qr",
    });
    if (error) throw new Error("Could not save your review. Please try again.");

    // A weak score from a known unit is worth paging staff about; the property
    // name is in the message so nobody has to guess which one it was.
    const threshold = org.complaint_star_threshold ?? 4;
    if (data.rating < threshold) {
      await notifyStaff(property.org_id, "guest_low_rating", {
        property: property.name,
        rating: String(data.rating),
        detail: data.comment ?? "No comment left.",
      });
    } else {
      await notifyStaff(property.org_id, "review_received", {
        rating: String(data.rating),
        guest: data.customerName ?? "A guest",
        org: org.name,
      });
    }

    return { ok: true };
  });

export type PropertyReviewLink = {
  id: string;
  name: string;
  unitLabel: string | null;
  city: string | null;
  active: boolean;
  reviewCode: string;
};

/** Staff: every property with its own review code, for printing QR codes. */
export const listPropertyReviewLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<PropertyReviewLink[]> => {
    const { requireMembership, STAFF_ROLES } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId, STAFF_ROLES);

    const db = await guestDb();
    const { data: rows, error } = await db
      .from("properties")
      .select("id, name, unit_label, city, active, review_code")
      .eq("org_id", data.orgId)
      .order("name");
    if (error) throw new Error("Could not load the property review links.");

    return (rows ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      unitLabel: p.unit_label,
      city: p.city,
      active: p.active,
      reviewCode: p.review_code,
    }));
  });
