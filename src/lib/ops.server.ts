import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

export type Role = Database["public"]["Enums"]["app_role"];
export type Db = SupabaseClient<Database>;

export const STAFF_ROLES: Role[] = ["owner", "manager", "supervisor"];
export const ADMIN_ROLES: Role[] = ["owner", "manager"];

export type Membership = { orgId: string; userId: string; role: Role };

/**
 * Server-side authorisation gate. Every server function that touches org data
 * calls this first — a route guard in the browser is not a security boundary.
 */
export async function requireMembership(
  userId: string,
  orgId: string,
  allowed?: Role[],
): Promise<Membership> {
  const { data, error } = await supabaseAdmin
    .from("org_members")
    .select("role, status")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error("Could not verify your access to this workspace.");
  if (!data || data.status !== "active") throw new Error("You do not have access to this workspace.");
  if (allowed && !allowed.includes(data.role)) {
    throw new Error("Your role does not allow this action.");
  }
  return { orgId, userId, role: data.role };
}

export async function logAudit(entry: {
  orgId: string;
  actorId?: string | null;
  actorType?: "user" | "ai" | "system";
  action: string;
  entityType: string;
  entityId?: string | null;
  reasonCodes?: string[];
  confidence?: number | null;
  metadata?: Record<string, unknown>;
}) {
  await supabaseAdmin.from("audit_logs").insert({
    org_id: entry.orgId,
    actor_id: entry.actorId ?? null,
    actor_type: entry.actorType ?? "user",
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    reason_codes: entry.reasonCodes ?? [],
    confidence: entry.confidence ?? null,
    metadata: (entry.metadata ?? {}) as never,
  });
}

export type NotificationTemplate =
  | "task_assigned"
  | "task_reassigned"
  | "task_needs_review"
  | "task_completed"
  | "task_overdue"
  | "maintenance_reported"
  | "maintenance_urgent"
  | "member_pending"
  | "member_approved"
  | "member_joined_with_code"
  | "review_received"
  | "guest_complaint"
  | "guest_low_rating";

const TEMPLATES: Record<NotificationTemplate, (d: Record<string, string>) => { subject: string; body: string }> = {
  task_assigned: (d) => ({
    subject: `New task: ${d["title"] ?? "Cleaning"} at ${d["property"] ?? "a property"}`,
    body: `You have been assigned "${d["title"]}" at ${d["property"]}, due ${d["due"]}.`,
  }),
  task_reassigned: (d) => ({
    subject: `Task reassigned: ${d["title"]}`,
    body: `"${d["title"]}" at ${d["property"]} has been reassigned. Reason: ${d["reason"] ?? "schedule change"}.`,
  }),
  task_needs_review: (d) => ({
    subject: `Quality review needed: ${d["property"]}`,
    body: `The photo check for "${d["title"]}" at ${d["property"]} scored ${d["score"]} and needs a human review. ${d["summary"] ?? ""}`,
  }),
  task_completed: (d) => ({
    subject: `Task completed: ${d["property"]}`,
    body: `"${d["title"]}" at ${d["property"]} passed the quality check and is guest-ready.`,
  }),
  task_overdue: (d) => ({
    subject: `Overdue: ${d["title"]} at ${d["property"]}`,
    body: `"${d["title"]}" at ${d["property"]} was due ${d["due"]} and is still not finished.`,
  }),
  maintenance_reported: (d) => ({
    subject: `Maintenance reported at ${d["property"]}`,
    body: `${d["summary"] ?? d["description"]} (category ${d["category"] ?? "unclassified"}, severity ${d["severity"] ?? "unknown"}).`,
  }),
  maintenance_urgent: (d) => ({
    subject: `URGENT maintenance at ${d["property"]}`,
    body: `${d["summary"] ?? d["description"]} — flagged ${d["severity"]}. Needs immediate attention.`,
  }),
  member_pending: (d) => ({
    subject: `${d["name"]} asked to join ${d["org"]}`,
    body: `${d["name"]} (${d["email"]}) is waiting for approval to join ${d["org"]}.`,
  }),
  member_joined_with_code: (d) => ({
    subject: `${d["name"]} joined ${d["org"]}`,
    body: `${d["name"]} (${d["email"]}) joined ${d["org"]} with an invitation code as ${d["role"]}.`,
  }),
  guest_complaint: (d) => ({
    subject: `Guest complaint at ${d["property"] ?? "a property"}`,
    body: `${d["detail"] ?? "A guest reported a problem."} (rating ${d["rating"] ?? "no"}). Open Guests to resolve it.`,
  }),
  guest_low_rating: (d) => ({
    subject: `Low guest rating at ${d["property"] ?? "a property"} (${d["rating"] ?? "?"} stars)`,
    body: `${d["detail"] ?? "A guest left a low rating."} Open Guests to review.`,
  }),
  review_received: (d) => ({
    subject: `New ${d["rating"]}-star guest review`,
    body: `${d["guest"]} left a ${d["rating"]}-star review for ${d["org"]}. Open Reviews to read and reply.`,
  }),
  member_approved: (d) => ({
    subject: `You are now part of ${d["org"]}`,
    body: `Your request to join ${d["org"]} was approved. Your role is ${d["role"]}.`,
  }),
};

/**
 * Queues a notification on every channel the recipient is reachable on.
 * Nothing is dispatched here — the queue is drained by
 * `src/lib/notifications.functions.ts` so a provider outage never blocks an
 * operational action.
 */
export async function queueNotification(input: {
  orgId: string;
  userId: string | null;
  template: NotificationTemplate;
  data: Record<string, string>;
  channels?: Database["public"]["Enums"]["notify_channel"][];
}) {
  const rendered = TEMPLATES[input.template](input.data);
  let email: string | null = null;
  let phone: string | null = null;

  if (input.userId) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email, phone_enc")
      .eq("id", input.userId)
      .maybeSingle();
    email = profile?.email ?? null;
    if (profile?.phone_enc) {
      const { decryptField } = await import("./crypto.server");
      phone = await decryptField(profile.phone_enc);
    }
  }

  const channels = input.channels ?? ["in_app", "email", "whatsapp"];
  const rows = channels
    .filter((c) => c === "in_app" || (c === "email" && email) || (c === "whatsapp" && phone))
    .map((channel) => ({
      org_id: input.orgId,
      user_id: input.userId,
      channel,
      template: input.template,
      subject: rendered.subject,
      body: rendered.body,
      payload: input.data as never,
      to_address: channel === "email" ? email : channel === "whatsapp" ? phone : null,
    }));

  if (rows.length) await supabaseAdmin.from("notifications").insert(rows);
}

export async function notifyStaff(
  orgId: string,
  template: NotificationTemplate,
  data: Record<string, string>,
) {
  const { data: staff } = await supabaseAdmin
    .from("org_members")
    .select("user_id, role")
    .eq("org_id", orgId)
    .eq("status", "active")
    .in("role", STAFF_ROLES);

  for (const member of staff ?? []) {
    await queueNotification({ orgId, userId: member.user_id, template, data });
  }
}

export { supabaseAdmin };
