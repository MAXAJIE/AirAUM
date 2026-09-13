import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Guest-flow internals.
 *
 * They live outside `guest.functions.ts` because the server-function splitter
 * strips module-scope siblings from that file, which would leave the handlers
 * referencing missing helpers at runtime.
 *
 * The tables added by `20260913000000_guest_stay_and_amenities.sql` are not in
 * the generated Supabase types yet, so this module declares the slice of the
 * schema the guest flow uses and exposes an admin client typed against it.
 * Regenerating `src/integrations/supabase/types.ts` later does not break this.
 */

type Timestamp = string;

type GuestSessionRow = {
  id: string;
  org_id: string;
  property_id: string;
  guest_name: string | null;
  party_size: number | null;
  contact_number_enc: string | null;
  check_in_at: Timestamp | null;
  checked_out_at: Timestamp | null;
  expires_at: Timestamp;
  created_at: Timestamp;
};

type AmenityDefinitionRow = {
  id: string;
  org_id: string;
  property_id: string;
  name: string;
  expected_qty: number;
  unit: string | null;
  sort_order: number;
  active: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
};

type AmenityCheckRow = {
  id: string;
  org_id: string;
  property_id: string;
  amenity_id: string;
  session_id: string | null;
  task_id: string | null;
  source: "guest" | "cleaner";
  found_qty: number;
  note: string | null;
  checked_by: string | null;
  created_at: Timestamp;
};

type GuestReportRow = {
  id: string;
  org_id: string;
  property_id: string;
  session_id: string;
  overall_rating: number | null;
  notes: string | null;
  complaint: string | null;
  kind: "feedback" | "low_rating" | "complaint";
  status: "open" | "resolved" | "dismissed";
  resolution_note: string | null;
  resolved_by: string | null;
  resolved_at: Timestamp | null;
  created_at: Timestamp;
};

type GuestReportPhotoRow = {
  id: string;
  org_id: string;
  report_id: string;
  storage_key: string;
  created_at: Timestamp;
};

type PropertyRow = {
  id: string;
  org_id: string;
  name: string;
  unit_label: string | null;
  city: string | null;
  address_enc: string | null;
  access_code_enc: string | null;
  bedrooms: number;
  bathrooms: number;
  notes: string | null;
  turnover_minutes: number;
  guest_code: string;
  review_code: string;
  complaint_star_threshold: number | null;
  active: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
};

type CustomerReviewRow = {
  id: string;
  org_id: string;
  property_id: string | null;
  rating: number;
  cleanliness: number | null;
  communication: number | null;
  customer_name: string | null;
  customer_email: string | null;
  comment: string | null;
  source: string;
  status: "new" | "published" | "archived";
  reply: string | null;
  created_at: Timestamp;
};

type OrganizationRow = {
  id: string;
  name: string;
  complaint_star_threshold: number;
};

type Table<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export type GuestDatabase = {
  public: {
    Tables: {
      organizations: Table<OrganizationRow>;
      properties: Table<PropertyRow>;
      customer_reviews: Table<CustomerReviewRow>;
      guest_sessions: Table<GuestSessionRow>;
      amenity_definitions: Table<AmenityDefinitionRow>;
      amenity_checks: Table<AmenityCheckRow>;
      guest_reports: Table<GuestReportRow>;
      guest_report_photos: Table<GuestReportPhotoRow>;
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

export type GuestDb = SupabaseClient<GuestDatabase, "public">;

export const PHOTO_BUCKET = "task-photos";

/** Service-role client typed against the guest-flow tables. */
export async function guestDb(): Promise<GuestDb> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as GuestDb;
}

export type GuestSessionContext = {
  sessionId: string;
  orgId: string;
  propertyId: string;
  propertyName: string;
  checkedOut: boolean;
};

/**
 * A stay session is the guest's only credential: an unguessable id with a hard
 * expiry. Every guest write re-resolves it here instead of trusting the client.
 */
export async function requireGuestSession(sessionId: string): Promise<GuestSessionContext> {
  const db = await guestDb();
  const { data, error } = await db
    .from("guest_sessions")
    .select("id, org_id, property_id, expires_at, checked_out_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (error) throw new Error("Could not check your stay session.");
  if (!data) throw new Error("session_invalid");
  if (new Date(data.expires_at).getTime() < Date.now()) throw new Error("session_expired");

  const { data: property } = await db
    .from("properties")
    .select("id, name, active")
    .eq("id", data.property_id)
    .maybeSingle();
  if (!property || !property.active) throw new Error("session_invalid");

  return {
    sessionId: data.id,
    orgId: data.org_id,
    propertyId: data.property_id,
    propertyName: property.name,
    checkedOut: !!data.checked_out_at,
  };
}

/** Normalises the code that appears in the /g/<code> URL. */
export function normaliseGuestCode(code: string): string {
  return code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** The star rating below which guest feedback counts as a low rating. */
export function complaintThreshold(
  propertyThreshold: number | null | undefined,
  orgThreshold: number | null | undefined,
): number {
  return propertyThreshold ?? orgThreshold ?? 4;
}
