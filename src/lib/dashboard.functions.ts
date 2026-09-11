import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireMembership, supabaseAdmin, STAFF_ROLES } = await import("./ops.server");
    const me = await requireMembership(context.userId, data.orgId);
    const staff = STAFF_ROLES.includes(me.role);
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 86400000).toISOString();

    let taskQuery = supabaseAdmin
      .from("tasks")
      .select("id, status, qc_status, qc_score, due_at, assigned_to")
      .eq("org_id", data.orgId)
      .lte("due_at", in7)
      .limit(1000);
    if (!staff) taskQuery = taskQuery.eq("assigned_to", context.userId);
    const { data: tasks } = await taskQuery;

    const open = (tasks ?? []).filter((t) => !["completed", "cancelled"].includes(t.status));
    const scores = (tasks ?? [])
      .map((t) => (t.qc_score === null ? null : Number(t.qc_score)))
      .filter((v): v is number => v !== null);

    const { count: propertyCount } = staff
      ? await supabaseAdmin
          .from("properties")
          .select("id", { count: "exact", head: true })
          .eq("org_id", data.orgId)
          .eq("active", true)
      : { count: null };

    const { count: pendingMembers } = staff
      ? await supabaseAdmin
          .from("org_members")
          .select("id", { count: "exact", head: true })
          .eq("org_id", data.orgId)
          .eq("status", "pending")
      : { count: null };

    const { count: openMaintenance } = await supabaseAdmin
      .from("maintenance_requests")
      .select("id", { count: "exact", head: true })
      .eq("org_id", data.orgId)
      .in("status", ["open", "triaged", "assigned"]);

    const { data: recentAudit } = staff
      ? await supabaseAdmin
          .from("audit_logs")
          .select("id, action, entity_type, created_at, reason_codes, confidence")
          .eq("org_id", data.orgId)
          .order("created_at", { ascending: false })
          .limit(12)
      : { data: [] };

    return {
      role: me.role,
      staff,
      unassigned: open.filter((t) => t.status === "unassigned").length,
      inProgress: open.filter((t) => t.status === "in_progress").length,
      needsReview: (tasks ?? []).filter((t) => t.status === "needs_review").length,
      overdue: open.filter((t) => new Date(t.due_at).getTime() < now.getTime()).length,
      dueToday: open.filter((t) => new Date(t.due_at).toDateString() === now.toDateString()).length,
      completed7d: (tasks ?? []).filter((t) => t.status === "completed").length,
      avgQcScore: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) : null,
      properties: propertyCount ?? 0,
      pendingMembers: pendingMembers ?? 0,
      openMaintenance: openMaintenance ?? 0,
      activity: (recentAudit ?? []).map((a) => ({
        id: a.id,
        action: a.action,
        entityType: a.entity_type,
        createdAt: a.created_at,
        reasonCodes: a.reason_codes,
        confidence: a.confidence === null ? null : Number(a.confidence),
      })),
    };
  });

export const listAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireMembership, supabaseAdmin, ADMIN_ROLES } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId, ADMIN_ROLES);

    const { data: rows } = await supabaseAdmin
      .from("audit_logs")
      .select("id, action, entity_type, entity_id, actor_id, actor_type, reason_codes, confidence, metadata, created_at")
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: false })
      .limit(200);

    const actorIds = [...new Set((rows ?? []).map((r) => r.actor_id).filter((v): v is string => !!v))];
    const { data: profiles } = actorIds.length
      ? await supabaseAdmin.from("profiles").select("id, full_name").in("id", actorIds)
      : { data: [] };
    const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

    return (rows ?? []).map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      actor: r.actor_id ? (nameById.get(r.actor_id) ?? "Unknown") : r.actor_type,
      actorType: r.actor_type,
      reasonCodes: r.reason_codes,
      confidence: r.confidence === null ? null : Number(r.confidence),
      metadata: r.metadata,
      createdAt: r.created_at,
    }));
  });

export const listAiDecisions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireMembership, supabaseAdmin, ADMIN_ROLES } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId, ADMIN_ROLES);

    const { data: rows } = await supabaseAdmin
      .from("ai_decisions")
      .select("id, kind, entity_type, entity_id, model, confidence, requires_human_review, accepted, latency_ms, error, created_at")
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: false })
      .limit(120);

    return (rows ?? []).map((r) => ({
      id: r.id,
      kind: r.kind,
      entityType: r.entity_type,
      entityId: r.entity_id,
      model: r.model,
      confidence: r.confidence === null ? null : Number(r.confidence),
      requiresHumanReview: r.requires_human_review,
      accepted: r.accepted,
      latencyMs: r.latency_ms,
      error: r.error,
      createdAt: r.created_at,
    }));
  });
