import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const PHOTO_BUCKET = "task-photos";

export type TaskListRow = {
  id: string;
  title: string;
  type: string;
  status: string;
  qcStatus: string;
  qcScore: number | null;
  propertyId: string;
  propertyName: string;
  scheduledStart: string;
  dueAt: string;
  assignedTo: string | null;
  assigneeName: string | null;
  overdue: boolean;
};

export const listTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        scope: z.enum(["all", "mine"]).default("all"),
        status: z.string().max(30).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<TaskListRow[]> => {
    const { requireMembership, supabaseAdmin, STAFF_ROLES } = await import("./ops.server");
    const me = await requireMembership(context.userId, data.orgId);
    const staff = STAFF_ROLES.includes(me.role);

    let query = supabaseAdmin
      .from("tasks")
      .select("id, title, type, status, qc_status, qc_score, property_id, scheduled_start, due_at, assigned_to")
      .eq("org_id", data.orgId)
      .order("due_at", { ascending: true })
      .limit(400);

    // Cleaners and technicians only ever see their own work.
    if (!staff || data.scope === "mine") query = query.eq("assigned_to", context.userId);
    if (data.status) query = query.eq("status", data.status as never);

    const { data: rows, error } = await query;
    if (error) throw new Error("Could not load tasks.");

    const { data: props } = await supabaseAdmin
      .from("properties")
      .select("id, name")
      .eq("org_id", data.orgId);
    const propName = new Map((props ?? []).map((p) => [p.id, p.name]));

    const assignees = [...new Set((rows ?? []).map((r) => r.assigned_to).filter((v): v is string => !!v))];
    const { data: profiles } = assignees.length
      ? await supabaseAdmin.from("profiles").select("id, full_name").in("id", assignees)
      : { data: [] };
    const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

    const now = Date.now();
    return (rows ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      type: t.type,
      status: t.status,
      qcStatus: t.qc_status,
      qcScore: t.qc_score === null ? null : Number(t.qc_score),
      propertyId: t.property_id,
      propertyName: propName.get(t.property_id) ?? "Property",
      scheduledStart: t.scheduled_start,
      dueAt: t.due_at,
      assignedTo: t.assigned_to,
      assigneeName: t.assigned_to ? (nameById.get(t.assigned_to) ?? "Team member") : null,
      overdue: new Date(t.due_at).getTime() < now && !["completed", "cancelled"].includes(t.status),
    }));
  });

export const getTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid(), taskId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireMembership, supabaseAdmin, STAFF_ROLES } = await import("./ops.server");
    const me = await requireMembership(context.userId, data.orgId);

    const { data: task } = await supabaseAdmin
      .from("tasks")
      .select("*")
      .eq("id", data.taskId)
      .eq("org_id", data.orgId)
      .maybeSingle();
    if (!task) throw new Error("That task no longer exists.");

    const staff = STAFF_ROLES.includes(me.role);
    const isAssignee = task.assigned_to === context.userId;
    if (!staff && !isAssignee) throw new Error("You do not have access to this task.");

    const { data: property } = await supabaseAdmin
      .from("properties")
      .select("*")
      .eq("id", task.property_id)
      .maybeSingle();

    const { decryptField } = await import("./crypto.server");
    const { data: items } = await supabaseAdmin
      .from("task_items")
      .select("*")
      .eq("task_id", task.id)
      .order("position");

    const { data: photos } = await supabaseAdmin
      .from("photos")
      .select("*")
      .eq("task_id", task.id)
      .order("created_at");

    const signed = await Promise.all(
      (photos ?? []).map(async (p) => {
        const { data: url } = await supabaseAdmin.storage
          .from(PHOTO_BUCKET)
          .createSignedUrl(p.storage_key, 60 * 30);
        return {
          id: p.id,
          room: p.room,
          photoType: p.photo_type,
          aiStatus: p.ai_status,
          aiConfidence: p.ai_confidence === null ? null : Number(p.ai_confidence),
          aiResult: p.ai_result,
          taskItemId: p.task_item_id,
          url: url?.signedUrl ?? null,
          createdAt: p.created_at,
        };
      }),
    );

    let assigneeName: string | null = null;
    if (task.assigned_to) {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", task.assigned_to)
        .maybeSingle();
      assigneeName = prof?.full_name ?? null;
    }

    return {
      id: task.id,
      title: task.title,
      type: task.type,
      status: task.status,
      notes: task.notes,
      qcStatus: task.qc_status,
      qcScore: task.qc_score === null ? null : Number(task.qc_score),
      qcSummary: task.qc_summary,
      scheduledStart: task.scheduled_start,
      dueAt: task.due_at,
      startedAt: task.started_at,
      submittedAt: task.submitted_at,
      completedAt: task.completed_at,
      assignedTo: task.assigned_to,
      assigneeName,
      canEdit: staff,
      isAssignee,
      property: {
        id: property?.id ?? task.property_id,
        name: property?.name ?? "Property",
        unitLabel: property?.unit_label ?? null,
        city: property?.city ?? null,
        // The assigned cleaner needs the address and the door code; nobody else does.
        address: staff || isAssignee ? await decryptField(property?.address_enc ?? null) : null,
        accessCode: staff || isAssignee ? await decryptField(property?.access_code_enc ?? null) : null,
        notes: property?.notes ?? null,
      },
      items: (items ?? []).map((i) => ({
        id: i.id,
        label: i.label,
        room: i.room,
        requiresPhoto: i.requires_photo,
        done: i.done,
        doneAt: i.done_at,
      })),
      photos: signed,
    };
  });

export const createAdhocTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        propertyId: z.string().uuid(),
        type: z.enum(["turnover_clean", "deep_clean", "inspection", "maintenance", "restock"]),
        title: z.string().min(2).max(160),
        scheduledStart: z.string().min(10),
        dueAt: z.string().min(10),
        notes: z.string().max(2000).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireMembership, supabaseAdmin, STAFF_ROLES, logAudit } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId, STAFF_ROLES);
    if (new Date(data.dueAt) <= new Date(data.scheduledStart)) {
      throw new Error("The deadline must be after the start time.");
    }

    const { data: checklist } = await supabaseAdmin
      .from("checklists")
      .select("id")
      .eq("org_id", data.orgId)
      .eq("task_type", data.type)
      .eq("is_default", true)
      .maybeSingle();

    const { data: task, error } = await supabaseAdmin
      .from("tasks")
      .insert({
        org_id: data.orgId,
        property_id: data.propertyId,
        checklist_id: checklist?.id ?? null,
        type: data.type,
        status: "unassigned",
        title: data.title,
        scheduled_start: new Date(data.scheduledStart).toISOString(),
        due_at: new Date(data.dueAt).toISOString(),
        notes: data.notes,
      })
      .select("id")
      .single();
    if (error || !task) throw new Error("Could not create the task.");

    if (checklist) {
      const { data: items } = await supabaseAdmin
        .from("checklist_items")
        .select("label, room, requires_photo, position")
        .eq("checklist_id", checklist.id)
        .order("position");
      if (items?.length) {
        await supabaseAdmin.from("task_items").insert(
          items.map((i) => ({
            org_id: data.orgId,
            task_id: task.id,
            label: i.label,
            room: i.room,
            requires_photo: i.requires_photo,
            position: i.position,
          })),
        );
      }
    }

    await logAudit({
      orgId: data.orgId,
      actorId: context.userId,
      action: "task.created",
      entityType: "task",
      entityId: task.id,
    });
    return { id: task.id };
  });

/**
 * Deterministic shortlist first, AI ranking second.
 * The AI only re-orders the top candidates the backend already approved, and
 * its answer is never applied automatically below the review threshold.
 */
export const suggestAssignee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid(), taskId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireMembership, supabaseAdmin, STAFF_ROLES } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId, STAFF_ROLES);
    const { shortlistCandidates } = await import("./scheduling.server");
    const { candidates, rejected } = await shortlistCandidates(data.orgId, data.taskId);

    const top = candidates.slice(0, 5);
    if (!top.length) {
      return {
        candidates: [],
        rejected,
        ranked: [],
        aiError: "Nobody is currently eligible for this task. Adjust availability, capacity or skills.",
      };
    }

    const { data: task } = await supabaseAdmin
      .from("tasks")
      .select("title, scheduled_start, due_at, type")
      .eq("id", data.taskId)
      .maybeSingle();

    const { callAiJson, AI_MODEL } = await import("./ai.server");
    const payload = {
      task: {
        title: task?.title,
        type: task?.type,
        starts: task?.scheduled_start,
        due: task?.due_at,
      },
      candidates: top.map((c) => ({
        user_id: c.userId,
        quality_score: c.qualityScore,
        reliability: c.reliability,
        cancellations_30d: c.cancellations30d,
        tasks_completed: c.tasksCompleted,
        same_city_as_property: c.sameCity,
        tasks_already_today: c.loadThatDay,
        daily_capacity: c.maxDailyTasks,
        times_cleaned_this_property: c.familiarity,
        skills: c.skills,
      })),
    };

    const result = await callAiJson<{
      ranked: Array<{ user_id: string; rank: number; confidence: number; reasons: string[] }>;
      confidence: number;
      summary: string;
    }>(
      "You rank cleaning staff for a single property turnover. Every candidate has already passed availability, capacity, quality and skill checks — do not re-check those. Rank on quality, reliability, current workload, familiarity with the property and cancellation history. Return JSON only. Never invent a user_id that is not in the input.",
      [{ role: "user", content: [{ type: "input_text", text: JSON.stringify(payload) }] }],
      {
        name: "assignment_ranking",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["ranked", "confidence", "summary"],
          properties: {
            ranked: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["user_id", "rank", "confidence", "reasons"],
                properties: {
                  user_id: { type: "string" },
                  rank: { type: "integer" },
                  confidence: { type: "number" },
                  reasons: { type: "array", items: { type: "string" } },
                },
              },
            },
            confidence: { type: "number" },
            summary: { type: "string" },
          },
        },
      },
    );

    const allowed = new Set(top.map((c) => c.userId));
    let ranked: Array<{ userId: string; rank: number; confidence: number; reasons: string[] }> = [];
    let aiError: string | null = null;

    if (result.ok) {
      // Backend validation: the model may only reorder ids we gave it.
      ranked = result.data.ranked
        .filter((r) => allowed.has(r.user_id))
        .map((r) => ({
          userId: r.user_id,
          rank: r.rank,
          confidence: Math.max(0, Math.min(1, Number(r.confidence) || 0)),
          reasons: (r.reasons ?? []).slice(0, 5).map((s) => String(s).slice(0, 120)),
        }))
        .sort((a, b) => a.rank - b.rank);
    } else {
      aiError = result.message;
    }

    await supabaseAdmin.from("ai_decisions").insert({
      org_id: data.orgId,
      kind: "assignment_ranking",
      entity_type: "task",
      entity_id: data.taskId,
      model: AI_MODEL,
      input: payload as never,
      output: (result.ok ? result.data : null) as never,
      confidence: result.ok ? Math.max(0, Math.min(1, Number(result.data.confidence) || 0)) : null,
      requires_human_review: true,
      latency_ms: result.ok ? result.latencyMs : null,
      error: result.ok ? null : result.message,
    });

    return { candidates: top, rejected, ranked, aiError, summary: result.ok ? result.data.summary : null };
  });

export const assignTaskFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        taskId: z.string().uuid(),
        userId: z.string().uuid(),
        reasonCodes: z.array(z.string().max(40)).max(6).default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireMembership, STAFF_ROLES } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId, STAFF_ROLES);
    // The chosen person must still pass every deterministic check.
    const { shortlistCandidates, assignTask } = await import("./scheduling.server");
    const { candidates } = await shortlistCandidates(data.orgId, data.taskId);
    if (!candidates.some((c) => c.userId === data.userId)) {
      throw new Error("That person is no longer eligible for this task (availability, capacity or skills).");
    }
    await assignTask({
      orgId: data.orgId,
      taskId: data.taskId,
      userId: data.userId,
      actorId: context.userId,
      reasonCodes: data.reasonCodes,
    });
    return { ok: true };
  });

export const startTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid(), taskId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireMembership, supabaseAdmin, logAudit } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId);
    const { data: task } = await supabaseAdmin
      .from("tasks")
      .select("id, assigned_to, status")
      .eq("id", data.taskId)
      .eq("org_id", data.orgId)
      .maybeSingle();
    if (!task || task.assigned_to !== context.userId) throw new Error("This task is not assigned to you.");
    if (task.status !== "assigned") throw new Error("This task cannot be started right now.");

    await supabaseAdmin
      .from("tasks")
      .update({ status: "in_progress", started_at: new Date().toISOString() })
      .eq("id", data.taskId);
    await logAudit({
      orgId: data.orgId,
      actorId: context.userId,
      action: "task.started",
      entityType: "task",
      entityId: data.taskId,
    });
    return { ok: true };
  });

export const toggleTaskItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ orgId: z.string().uuid(), itemId: z.string().uuid(), done: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireMembership, supabaseAdmin } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId);

    const { data: item } = await supabaseAdmin
      .from("task_items")
      .select("id, task_id")
      .eq("id", data.itemId)
      .eq("org_id", data.orgId)
      .maybeSingle();
    if (!item) throw new Error("That checklist line no longer exists.");

    const { data: task } = await supabaseAdmin
      .from("tasks")
      .select("assigned_to, status")
      .eq("id", item.task_id)
      .maybeSingle();
    if (!task || task.assigned_to !== context.userId) throw new Error("This task is not assigned to you.");
    if (!["assigned", "in_progress", "needs_review"].includes(task.status)) {
      throw new Error("This task can no longer be edited.");
    }

    await supabaseAdmin
      .from("task_items")
      .update({ done: data.done, done_at: data.done ? new Date().toISOString() : null })
      .eq("id", data.itemId);
    return { ok: true };
  });

export const createPhotoUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        taskId: z.string().uuid(),
        extension: z.enum(["jpg", "jpeg", "png", "webp"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireMembership, supabaseAdmin } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId);
    const { data: task } = await supabaseAdmin
      .from("tasks")
      .select("id, assigned_to, status")
      .eq("id", data.taskId)
      .eq("org_id", data.orgId)
      .maybeSingle();
    if (!task || task.assigned_to !== context.userId) throw new Error("This task is not assigned to you.");
    if (!["assigned", "in_progress", "needs_review"].includes(task.status)) {
      throw new Error("Photos can no longer be added to this task.");
    }

    const key = `${data.orgId}/${data.taskId}/${crypto.randomUUID()}.${data.extension}`;
    const { data: signed, error } = await supabaseAdmin.storage
      .from(PHOTO_BUCKET)
      .createSignedUploadUrl(key);
    if (error || !signed) throw new Error("Could not prepare the photo upload.");
    return { key, token: signed.token, path: signed.path };
  });

export const registerPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        taskId: z.string().uuid(),
        storageKey: z.string().min(5).max(300),
        room: z.string().min(1).max(40),
        photoType: z.enum(["after", "before", "issue"]).default("after"),
        taskItemId: z.string().uuid().nullable().default(null),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireMembership, supabaseAdmin } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId);
    if (!data.storageKey.startsWith(`${data.orgId}/${data.taskId}/`)) {
      throw new Error("That photo does not belong to this task.");
    }
    const { data: task } = await supabaseAdmin
      .from("tasks")
      .select("assigned_to")
      .eq("id", data.taskId)
      .eq("org_id", data.orgId)
      .maybeSingle();
    if (!task || task.assigned_to !== context.userId) throw new Error("This task is not assigned to you.");

    const { data: photo, error } = await supabaseAdmin
      .from("photos")
      .insert({
        org_id: data.orgId,
        task_id: data.taskId,
        task_item_id: data.taskItemId,
        storage_key: data.storageKey,
        room: data.room,
        photo_type: data.photoType,
        uploaded_by: context.userId,
      })
      .select("id")
      .single();
    if (error || !photo) throw new Error("Could not save the photo.");
    return { id: photo.id };
  });

export const deletePhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid(), photoId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireMembership, supabaseAdmin } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId);
    const { data: photo } = await supabaseAdmin
      .from("photos")
      .select("id, storage_key, uploaded_by, task_id")
      .eq("id", data.photoId)
      .eq("org_id", data.orgId)
      .maybeSingle();
    if (!photo || photo.uploaded_by !== context.userId) throw new Error("You cannot remove that photo.");
    await supabaseAdmin.storage.from(PHOTO_BUCKET).remove([photo.storage_key]);
    await supabaseAdmin.from("photos").delete().eq("id", data.photoId);
    return { ok: true };
  });

/**
 * Submitting runs the AI photo check over the whole set at once.
 * The outcome is compared against the workspace thresholds:
 *   >= auto threshold  -> completed
 *   >= review threshold -> queued for a human
 *   below              -> queued for a human, no automatic action
 */
export const submitTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ orgId: z.string().uuid(), taskId: z.string().uuid(), notes: z.string().max(1000).nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireMembership, supabaseAdmin, logAudit, notifyStaff, queueNotification } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId);

    const { data: task } = await supabaseAdmin
      .from("tasks")
      .select("id, assigned_to, status, title, property_id")
      .eq("id", data.taskId)
      .eq("org_id", data.orgId)
      .maybeSingle();
    if (!task || task.assigned_to !== context.userId) throw new Error("This task is not assigned to you.");
    if (!["in_progress", "assigned", "needs_review"].includes(task.status)) {
      throw new Error("This task has already been submitted.");
    }

    const { data: items } = await supabaseAdmin
      .from("task_items")
      .select("id, label, room, requires_photo, done")
      .eq("task_id", task.id);
    const unfinished = (items ?? []).filter((i) => !i.done);
    if (unfinished.length) {
      throw new Error(`${unfinished.length} checklist item(s) are still open.`);
    }

    const { data: photos } = await supabaseAdmin
      .from("photos")
      .select("id, storage_key, room")
      .eq("task_id", task.id);
    if (!photos?.length) throw new Error("Add at least one photo before submitting.");

    await supabaseAdmin
      .from("tasks")
      .update({ status: "submitted", submitted_at: new Date().toISOString(), notes: data.notes })
      .eq("id", task.id);

    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("qc_auto_threshold, qc_review_threshold")
      .eq("id", data.orgId)
      .maybeSingle();
    const autoAt = Number(org?.qc_auto_threshold ?? 0.9);
    const reviewAt = Number(org?.qc_review_threshold ?? 0.7);

    const { data: property } = await supabaseAdmin
      .from("properties")
      .select("name")
      .eq("id", task.property_id)
      .maybeSingle();

    // Signed URLs let the model look at the actual images, never at filenames.
    const signedPhotos = await Promise.all(
      photos.map(async (p) => {
        const { data: url } = await supabaseAdmin.storage.from(PHOTO_BUCKET).createSignedUrl(p.storage_key, 900);
        return { id: p.id, room: p.room, url: url?.signedUrl ?? null };
      }),
    );
    const usable = signedPhotos.filter((p) => p.url);

    const { callAiJson, AI_MODEL } = await import("./ai.server");
    const content: Array<{ type: "input_text"; text: string } | { type: "input_image"; image_url: string }> = [
      {
        type: "input_text",
        text: `Property: ${property?.name ?? "unknown"}. Checklist: ${(items ?? [])
          .map((i) => `${i.room}: ${i.label}`)
          .join("; ")}. Photos are labelled in order: ${usable.map((p, i) => `#${i + 1} ${p.room}`).join(", ")}.`,
      },
      ...usable.map((p) => ({ type: "input_image" as const, image_url: p.url! })),
    ];

    const result = await callAiJson<{
      overall_status: "pass" | "needs_review" | "fail";
      score: number;
      confidence: number;
      summary: string;
      reason_codes: string[];
      rooms: Array<{ room: string; status: string; issues: string[]; confidence: number }>;
    }>(
      "You grade short-stay turnover cleaning from the submitted photographs. Judge only what is visible in the images — never from file names or captions. Look for: unmade or stained bedding, dirty bathroom fixtures, hair, dust, bins not emptied, clutter, missing towels or amenities, visible damage. Be conservative: if an image is blurry, dark or does not show the area, lower your confidence rather than guessing. Return JSON only.",
      [{ role: "user", content }],
      {
        name: "photo_quality_check",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["overall_status", "score", "confidence", "summary", "reason_codes", "rooms"],
          properties: {
            overall_status: { type: "string", enum: ["pass", "needs_review", "fail"] },
            score: { type: "number" },
            confidence: { type: "number" },
            summary: { type: "string" },
            reason_codes: { type: "array", items: { type: "string" } },
            rooms: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["room", "status", "issues", "confidence"],
                properties: {
                  room: { type: "string" },
                  status: { type: "string", enum: ["pass", "needs_review", "fail"] },
                  issues: { type: "array", items: { type: "string" } },
                  confidence: { type: "number" },
                },
              },
            },
          },
        },
      },
    );

    const clamp = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

    let qcStatus: "pass" | "needs_review" | "fail" = "needs_review";
    let score: number | null = null;
    let summary = "Sent for human review.";
    let confidence: number | null = null;
    let reasonCodes: string[] = ["ai_unavailable"];

    if (result.ok) {
      confidence = clamp(result.data.confidence);
      score = clamp(result.data.score);
      summary = String(result.data.summary ?? "").slice(0, 800);
      reasonCodes = (result.data.reason_codes ?? []).slice(0, 8).map((c) => String(c).slice(0, 40));

      // Deterministic policy — the model does not decide this.
      if (confidence >= autoAt && result.data.overall_status === "pass") qcStatus = "pass";
      else if (confidence >= reviewAt) qcStatus = result.data.overall_status === "fail" ? "fail" : "needs_review";
      else qcStatus = "needs_review";
    } else {
      summary = result.message;
    }

    const finalStatus = qcStatus === "pass" ? "completed" : "needs_review";

    await supabaseAdmin
      .from("tasks")
      .update({
        status: finalStatus,
        qc_status: qcStatus,
        qc_score: score,
        qc_summary: summary,
        completed_at: finalStatus === "completed" ? new Date().toISOString() : null,
      })
      .eq("id", task.id);

    await supabaseAdmin
      .from("photos")
      .update({
        ai_status: result.ok ? (qcStatus === "pass" ? "pass" : qcStatus === "fail" ? "fail" : "needs_review") : "error",
        ai_confidence: confidence,
        ai_result: (result.ok ? result.data : null) as never,
      })
      .eq("task_id", task.id);

    await supabaseAdmin.from("ai_decisions").insert({
      org_id: data.orgId,
      kind: "photo_quality_check",
      entity_type: "task",
      entity_id: task.id,
      model: AI_MODEL,
      input: { photos: usable.length, rooms: usable.map((p) => p.room) } as never,
      output: (result.ok ? result.data : null) as never,
      confidence,
      requires_human_review: qcStatus !== "pass",
      latency_ms: result.ok ? result.latencyMs : null,
      error: result.ok ? null : result.message,
    });

    await logAudit({
      orgId: data.orgId,
      actorId: context.userId,
      actorType: "user",
      action: "task.submitted",
      entityType: "task",
      entityId: task.id,
      reasonCodes,
      confidence,
      metadata: { qcStatus, score, aiOk: result.ok },
    });

    if (finalStatus === "completed") {
      
      await queueNotification({
        orgId: data.orgId,
        userId: context.userId,
        template: "task_completed",
        data: { title: task.title, property: property?.name ?? "the property" },
        channels: ["in_app"],
      });
      await notifyStaff(data.orgId, "task_completed", {
        title: task.title,
        property: property?.name ?? "the property",
      });
    } else {
      await notifyStaff(data.orgId, "task_needs_review", {
        title: task.title,
        property: property?.name ?? "the property",
        score: score === null ? "n/a" : `${Math.round(score * 100)}%`,
        summary,
      });
    }

    return { qcStatus, score, summary, aiError: result.ok ? null : result.message };
  });

/** Human override — always available, and always the final word. */
export const reviewTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        taskId: z.string().uuid(),
        decision: z.enum(["approve", "reject"]),
        note: z.string().max(600).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireMembership, supabaseAdmin, STAFF_ROLES, logAudit, queueNotification } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId, STAFF_ROLES);

    const { data: task } = await supabaseAdmin
      .from("tasks")
      .select("id, assigned_to, title, property_id, qc_score")
      .eq("id", data.taskId)
      .eq("org_id", data.orgId)
      .maybeSingle();
    if (!task) throw new Error("That task no longer exists.");

    const approve = data.decision === "approve";
    await supabaseAdmin
      .from("tasks")
      .update({
        status: approve ? "completed" : "in_progress",
        qc_status: approve ? "pass" : "fail",
        qc_summary: data.note,
        completed_at: approve ? new Date().toISOString() : null,
      })
      .eq("id", task.id);

    if (task.assigned_to) {
      const { data: cleaner } = await supabaseAdmin
        .from("cleaner_profiles")
        .select("id, quality_score, tasks_completed")
        .eq("org_id", data.orgId)
        .eq("user_id", task.assigned_to)
        .maybeSingle();
      if (cleaner) {
        // Simple rolling quality signal, kept transparent and tunable.
        const current = Number(cleaner.quality_score);
        const next = Math.max(1, Math.min(5, current + (approve ? 0.05 : -0.35)));
        await supabaseAdmin
          .from("cleaner_profiles")
          .update({
            quality_score: Math.round(next * 100) / 100,
            tasks_completed: cleaner.tasks_completed + (approve ? 1 : 0),
          })
          .eq("id", cleaner.id);
      }

      const { data: property } = await supabaseAdmin
        .from("properties")
        .select("name")
        .eq("id", task.property_id)
        .maybeSingle();
      await queueNotification({
        orgId: data.orgId,
        userId: task.assigned_to,
        template: approve ? "task_completed" : "task_needs_review",
        data: {
          title: task.title,
          property: property?.name ?? "the property",
          score: task.qc_score === null ? "n/a" : `${Math.round(Number(task.qc_score) * 100)}%`,
          summary: data.note ?? "",
        },
      });
    }

    await logAudit({
      orgId: data.orgId,
      actorId: context.userId,
      action: approve ? "task.review_approved" : "task.review_rejected",
      entityType: "task",
      entityId: task.id,
      reasonCodes: ["human_override"],
      metadata: { note: data.note },
    });
    return { ok: true };
  });
