import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const PHOTO_BUCKET = "task-photos";

export const listMaintenance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ orgId: z.string().uuid(), status: z.string().max(20).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireMembership, supabaseAdmin, STAFF_ROLES } = await import("./ops.server");
    const me = await requireMembership(context.userId, data.orgId);
    const staff = STAFF_ROLES.includes(me.role);

    let query = supabaseAdmin
      .from("maintenance_requests")
      .select("*")
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: false })
      .limit(300);
    if (!staff) query = query.or(`reported_by.eq.${context.userId},assigned_to.eq.${context.userId}`);
    if (data.status) query = query.eq("status", data.status as never);

    const { data: rows, error } = await query;
    if (error) throw new Error("Could not load maintenance requests.");

    const { data: props } = await supabaseAdmin.from("properties").select("id, name").eq("org_id", data.orgId);
    const propName = new Map((props ?? []).map((p) => [p.id, p.name]));

    return Promise.all(
      (rows ?? []).map(async (r) => {
        let photoUrl: string | null = null;
        if (r.photo_key) {
          const { data: signed } = await supabaseAdmin.storage
            .from(PHOTO_BUCKET)
            .createSignedUrl(r.photo_key, 1800);
          photoUrl = signed?.signedUrl ?? null;
        }
        return {
          id: r.id,
          propertyId: r.property_id,
          propertyName: propName.get(r.property_id) ?? "Property",
          description: r.description,
          category: r.category,
          severity: r.severity,
          status: r.status,
          aiSummary: r.ai_summary,
          aiConfidence: r.ai_confidence === null ? null : Number(r.ai_confidence),
          requiresHumanReview: r.requires_human_review,
          assignedTo: r.assigned_to,
          taskId: r.task_id,
          photoUrl,
          createdAt: r.created_at,
          resolvedAt: r.resolved_at,
          canEdit: staff,
        };
      }),
    );
  });

/**
 * Anyone in the workspace can report an issue. The AI classifies it, but the
 * result is only trusted above the workspace threshold — otherwise the request
 * is flagged for a human to triage.
 */
export const reportMaintenance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        propertyId: z.string().uuid(),
        taskId: z.string().uuid().nullable().default(null),
        description: z.string().min(5).max(2000),
        photoKey: z.string().max(300).nullable().default(null),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireMembership, supabaseAdmin, logAudit, notifyStaff } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId);
    if (data.photoKey && !data.photoKey.startsWith(`${data.orgId}/`)) {
      throw new Error("That photo does not belong to this workspace.");
    }

    const { data: request, error } = await supabaseAdmin
      .from("maintenance_requests")
      .insert({
        org_id: data.orgId,
        property_id: data.propertyId,
        task_id: data.taskId,
        reported_by: context.userId,
        description: data.description,
        photo_key: data.photoKey,
        status: "open",
        requires_human_review: true,
      })
      .select("id")
      .single();
    if (error || !request) throw new Error("Could not save the maintenance request.");

    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("qc_auto_threshold, qc_review_threshold")
      .eq("id", data.orgId)
      .maybeSingle();
    const autoAt = Number(org?.qc_auto_threshold ?? 0.9);

    const content: Array<{ type: "input_text"; text: string } | { type: "input_image"; image_url: string }> = [
      { type: "input_text", text: data.description },
    ];
    if (data.photoKey) {
      const { data: signed } = await supabaseAdmin.storage.from(PHOTO_BUCKET).createSignedUrl(data.photoKey, 900);
      if (signed?.signedUrl) content.push({ type: "input_image", image_url: signed.signedUrl });
    }

    const { callAiJson, AI_MODEL } = await import("./ai.server");
    const result = await callAiJson<{
      category: string;
      severity: "low" | "medium" | "high" | "critical";
      confidence: number;
      summary: string;
      reason_codes: string[];
    }>(
      "You triage maintenance issues reported at short-stay rental properties. Choose one category from: plumbing, electrical, appliance, hvac, furniture, structural, pest, safety, other. Severity is critical only when the property is unsafe or unrentable right now. Be conservative and lower your confidence when the report is vague. Return JSON only.",
      [{ role: "user", content }],
      {
        name: "maintenance_triage",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["category", "severity", "confidence", "summary", "reason_codes"],
          properties: {
            category: {
              type: "string",
              enum: [
                "plumbing",
                "electrical",
                "appliance",
                "hvac",
                "furniture",
                "structural",
                "pest",
                "safety",
                "other",
              ],
            },
            severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
            confidence: { type: "number" },
            summary: { type: "string" },
            reason_codes: { type: "array", items: { type: "string" } },
          },
        },
      },
    );

    let confidence: number | null = null;
    let summary: string | null = null;
    let category: string | null = null;
    let severity: "low" | "medium" | "high" | "critical" | null = null;
    let requiresReview = true;

    if (result.ok) {
      confidence = Math.max(0, Math.min(1, Number(result.data.confidence) || 0));
      summary = String(result.data.summary ?? "").slice(0, 600);
      category = result.data.category;
      severity = result.data.severity;
      requiresReview = confidence < autoAt;
    }

    await supabaseAdmin
      .from("maintenance_requests")
      .update({
        category,
        severity,
        ai_summary: summary ?? (result.ok ? null : result.message),
        ai_confidence: confidence,
        requires_human_review: requiresReview,
        status: requiresReview ? "open" : "triaged",
      })
      .eq("id", request.id);

    await supabaseAdmin.from("ai_decisions").insert({
      org_id: data.orgId,
      kind: "maintenance_triage",
      entity_type: "maintenance_request",
      entity_id: request.id,
      model: AI_MODEL,
      input: { description: data.description, hasPhoto: !!data.photoKey } as never,
      output: (result.ok ? result.data : null) as never,
      confidence,
      requires_human_review: requiresReview,
      latency_ms: result.ok ? result.latencyMs : null,
      error: result.ok ? null : result.message,
    });

    const { data: property } = await supabaseAdmin
      .from("properties")
      .select("name")
      .eq("id", data.propertyId)
      .maybeSingle();

    await notifyStaff(
      data.orgId,
      severity === "critical" || severity === "high" ? "maintenance_urgent" : "maintenance_reported",
      {
        property: property?.name ?? "a property",
        description: data.description.slice(0, 200),
        summary: summary ?? data.description.slice(0, 200),
        category: category ?? "unclassified",
        severity: severity ?? "unknown",
      },
    );

    await logAudit({
      orgId: data.orgId,
      actorId: context.userId,
      action: "maintenance.reported",
      entityType: "maintenance_request",
      entityId: request.id,
      confidence,
      reasonCodes: result.ok ? result.data.reason_codes.slice(0, 6) : ["ai_unavailable"],
    });

    return { id: request.id, category, severity, summary, requiresReview, aiError: result.ok ? null : result.message };
  });

export const updateMaintenance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        id: z.string().uuid(),
        status: z.enum(["open", "triaged", "assigned", "resolved", "dismissed"]),
        severity: z.enum(["low", "medium", "high", "critical"]).nullable().default(null),
        category: z.string().max(40).nullable().default(null),
        assignedTo: z.string().uuid().nullable().default(null),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireMembership, supabaseAdmin, STAFF_ROLES, logAudit, queueNotification } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId, STAFF_ROLES);

    if (data.assignedTo) {
      const { data: member } = await supabaseAdmin
        .from("org_members")
        .select("user_id")
        .eq("org_id", data.orgId)
        .eq("user_id", data.assignedTo)
        .eq("status", "active")
        .maybeSingle();
      if (!member) throw new Error("That person is not an active member of this workspace.");
    }

    const { error } = await supabaseAdmin
      .from("maintenance_requests")
      .update({
        status: data.status,
        severity: data.severity,
        category: data.category,
        assigned_to: data.assignedTo,
        requires_human_review: false,
        resolved_at: data.status === "resolved" ? new Date().toISOString() : null,
      })
      .eq("id", data.id)
      .eq("org_id", data.orgId);
    if (error) throw new Error("Could not update the request.");

    if (data.assignedTo) {
      const { data: req } = await supabaseAdmin
        .from("maintenance_requests")
        .select("description, property_id")
        .eq("id", data.id)
        .maybeSingle();
      const { data: property } = req
        ? await supabaseAdmin.from("properties").select("name").eq("id", req.property_id).maybeSingle()
        : { data: null };
      await queueNotification({
        orgId: data.orgId,
        userId: data.assignedTo,
        template: "maintenance_reported",
        data: {
          property: property?.name ?? "a property",
          description: req?.description?.slice(0, 200) ?? "",
          summary: req?.description?.slice(0, 200) ?? "",
          category: data.category ?? "unclassified",
          severity: data.severity ?? "unknown",
        },
      });
    }

    await logAudit({
      orgId: data.orgId,
      actorId: context.userId,
      action: "maintenance.updated",
      entityType: "maintenance_request",
      entityId: data.id,
      reasonCodes: ["human_override"],
      metadata: { status: data.status, severity: data.severity },
    });
    return { ok: true };
  });
