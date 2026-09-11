import { supabaseAdmin, logAudit, queueNotification } from "./ops.server";
import type { Database } from "@/integrations/supabase/types";

type Booking = Database["public"]["Tables"]["bookings"]["Row"];

/**
 * Combines a date (YYYY-MM-DD) and a time (HH:MM:SS) in the workspace timezone
 * into an ISO instant. Timezone offsets are resolved with Intl so DST is handled.
 */
export function zonedIso(date: string, time: string, timeZone: string): string {
  const [h = "0", m = "0", s = "0"] = time.split(":");
  const naive = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
    Number(h),
    Number(m),
    Number(s),
  );
  // Offset of that wall-clock moment in the target zone.
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(new Date(naive)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts["year"]),
    Number(parts["month"]) - 1,
    Number(parts["day"]),
    Number(parts["hour"] === "24" ? "0" : parts["hour"]),
    Number(parts["minute"]),
    Number(parts["second"]),
  );
  return new Date(naive - (asUtc - naive)).toISOString();
}

/**
 * Creates (idempotently) the turnover cleaning task for a booking.
 * The database has a unique index on (booking_id, type) so a repeated import
 * never produces duplicate work.
 */
export async function ensureTurnoverTask(orgId: string, booking: Booking, timezone: string, actorId: string | null) {
  const { data: property } = await supabaseAdmin
    .from("properties")
    .select("name, unit_label, turnover_minutes")
    .eq("id", booking.property_id)
    .maybeSingle();

  const { data: checklist } = await supabaseAdmin
    .from("checklists")
    .select("id")
    .eq("org_id", orgId)
    .eq("task_type", "turnover_clean")
    .eq("is_default", true)
    .maybeSingle();

  const start = zonedIso(booking.check_out, booking.check_out_time, timezone);
  const due = zonedIso(booking.check_out, booking.next_check_in_time, timezone);
  const label = property ? `${property.name}${property.unit_label ? ` ${property.unit_label}` : ""}` : "Property";

  // Idempotent: one turnover task per booking. If it already exists we only
  // refresh the timing so a re-imported booking never duplicates work.
  const { data: existing } = await supabaseAdmin
    .from("tasks")
    .select("id, status")
    .eq("booking_id", booking.id)
    .eq("type", "turnover_clean")
    .maybeSingle();

  if (existing) {
    if (existing.status === "unassigned" || existing.status === "assigned") {
      await supabaseAdmin.from("tasks").update({ scheduled_start: start, due_at: due }).eq("id", existing.id);
    }
    return existing.id;
  }

  const { data: task, error } = await supabaseAdmin
    .from("tasks")
    .insert({
      org_id: orgId,
      property_id: booking.property_id,
      booking_id: booking.id,
      checklist_id: checklist?.id ?? null,
      type: "turnover_clean",
      status: "unassigned",
      title: `Turnover clean — ${label}`,
      scheduled_start: start,
      due_at: due,
    })
    .select("id")
    .single();

  if (error || !task) return null;

  if (checklist) {
    const { data: items } = await supabaseAdmin
      .from("checklist_items")
      .select("label, room, requires_photo, position")
      .eq("checklist_id", checklist.id)
      .order("position");
    if (items?.length) {
      await supabaseAdmin.from("task_items").insert(
        items.map((i) => ({
          org_id: orgId,
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
    orgId,
    actorId,
    actorType: actorId ? "user" : "system",
    action: "task.created_from_booking",
    entityType: "task",
    entityId: task.id,
    reasonCodes: ["booking_checkout"],
    metadata: { bookingId: booking.id },
  });

  return task.id;
}

export type Candidate = {
  userId: string;
  name: string;
  qualityScore: number;
  reliability: number;
  cancellations30d: number;
  tasksCompleted: number;
  skills: string[];
  baseCity: string | null;
  sameCity: boolean;
  loadThatDay: number;
  maxDailyTasks: number;
  familiarity: number;
  score: number;
};

/**
 * DETERMINISTIC filtering happens here, in the backend — never in the model.
 * Only candidates that survive availability, capacity, quality and skill
 * checks are ever shown to the AI ranker.
 */
export async function shortlistCandidates(
  orgId: string,
  taskId: string,
  opts: { minQuality?: number; requiredSkills?: string[] } = {},
): Promise<{ candidates: Candidate[]; rejected: Array<{ userId: string; reason: string }> }> {
  const { data: task } = await supabaseAdmin
    .from("tasks")
    .select("id, property_id, scheduled_start, due_at, type")
    .eq("id", taskId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!task) throw new Error("That task no longer exists.");

  const { data: property } = await supabaseAdmin
    .from("properties")
    .select("city")
    .eq("id", task.property_id)
    .maybeSingle();

  const { data: cleaners } = await supabaseAdmin
    .from("cleaner_profiles")
    .select("*")
    .eq("org_id", orgId)
    .eq("active", true);

  const userIds = (cleaners ?? []).map((c) => c.user_id);
  if (!userIds.length) return { candidates: [], rejected: [] };

  const { data: members } = await supabaseAdmin
    .from("org_members")
    .select("user_id, role, status")
    .eq("org_id", orgId)
    .in("user_id", userIds);
  const activeMembers = new Set(
    (members ?? []).filter((m) => m.status === "active" && (m.role === "cleaner" || m.role === "technician")).map((m) => m.user_id),
  );

  const { data: profiles } = await supabaseAdmin.from("profiles").select("id, full_name").in("id", userIds);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  const start = new Date(task.scheduled_start);
  const due = new Date(task.due_at);
  const weekday = start.getUTCDay();
  const dayStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())).toISOString();
  const dayEnd = new Date(new Date(dayStart).getTime() + 86400000).toISOString();

  const { data: rules } = await supabaseAdmin
    .from("availability_rules")
    .select("user_id, weekday, start_time, end_time")
    .eq("org_id", orgId)
    .in("user_id", userIds);

  const { data: offs } = await supabaseAdmin
    .from("time_off")
    .select("user_id, starts_at, ends_at")
    .eq("org_id", orgId)
    .in("user_id", userIds);

  const { data: sameDayTasks } = await supabaseAdmin
    .from("tasks")
    .select("id, assigned_to, scheduled_start, due_at, property_id, status")
    .eq("org_id", orgId)
    .gte("scheduled_start", dayStart)
    .lt("scheduled_start", dayEnd)
    .not("assigned_to", "is", null)
    .neq("status", "cancelled");

  const { data: history } = await supabaseAdmin
    .from("tasks")
    .select("assigned_to")
    .eq("org_id", orgId)
    .eq("property_id", task.property_id)
    .eq("status", "completed")
    .not("assigned_to", "is", null)
    .limit(200);

  const familiarityByUser = new Map<string, number>();
  for (const h of history ?? []) {
    if (h.assigned_to) familiarityByUser.set(h.assigned_to, (familiarityByUser.get(h.assigned_to) ?? 0) + 1);
  }

  const rejected: Array<{ userId: string; reason: string }> = [];
  const candidates: Candidate[] = [];
  const minQuality = opts.minQuality ?? 3;
  const required = opts.requiredSkills ?? [];

  for (const c of cleaners ?? []) {
    const name = nameById.get(c.user_id) ?? "Team member";

    if (!activeMembers.has(c.user_id)) {
      rejected.push({ userId: c.user_id, reason: "not_active_member" });
      continue;
    }

    // 1. Availability — weekly rules (if any) plus approved time off.
    const userRules = (rules ?? []).filter((r) => r.user_id === c.user_id);
    if (userRules.length) {
      const minutes = start.getUTCHours() * 60 + start.getUTCMinutes();
      const fits = userRules.some((r) => {
        if (r.weekday !== weekday) return false;
        const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
        return minutes >= toMin(r.start_time) && minutes <= toMin(r.end_time);
      });
      if (!fits) {
        rejected.push({ userId: c.user_id, reason: "outside_working_hours" });
        continue;
      }
    }
    const onLeave = (offs ?? []).some(
      (o) => o.user_id === c.user_id && new Date(o.starts_at) < due && new Date(o.ends_at) > start,
    );
    if (onLeave) {
      rejected.push({ userId: c.user_id, reason: "time_off" });
      continue;
    }

    // 2. Can they physically get there in time (no overlapping task)?
    const mine = (sameDayTasks ?? []).filter((t) => t.assigned_to === c.user_id && t.id !== task.id);
    const overlaps = mine.some((t) => new Date(t.scheduled_start) < due && new Date(t.due_at) > start);
    if (overlaps) {
      rejected.push({ userId: c.user_id, reason: "schedule_conflict" });
      continue;
    }
    if (mine.length >= c.max_daily_tasks) {
      rejected.push({ userId: c.user_id, reason: "daily_capacity_reached" });
      continue;
    }

    // 3. Quality threshold.
    if (Number(c.quality_score) < minQuality) {
      rejected.push({ userId: c.user_id, reason: "below_quality_threshold" });
      continue;
    }

    // 4. Required skills.
    if (required.length && !required.every((s) => c.skills.includes(s))) {
      rejected.push({ userId: c.user_id, reason: "missing_required_skill" });
      continue;
    }

    const sameCity = Boolean(property?.city && c.base_city && property.city.toLowerCase() === c.base_city.toLowerCase());
    const familiarity = familiarityByUser.get(c.user_id) ?? 0;
    const score =
      Number(c.quality_score) * 8 +
      Number(c.reliability) * 20 +
      (sameCity ? 12 : 0) +
      Math.min(familiarity, 10) * 1.5 -
      mine.length * 6 -
      c.cancellations_30d * 4;

    candidates.push({
      userId: c.user_id,
      name,
      qualityScore: Number(c.quality_score),
      reliability: Number(c.reliability),
      cancellations30d: c.cancellations_30d,
      tasksCompleted: c.tasks_completed,
      skills: c.skills,
      baseCity: c.base_city,
      sameCity,
      loadThatDay: mine.length,
      maxDailyTasks: c.max_daily_tasks,
      familiarity,
      score: Math.round(score * 100) / 100,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return { candidates, rejected };
}

export async function assignTask(input: {
  orgId: string;
  taskId: string;
  userId: string;
  actorId: string | null;
  actorType?: "user" | "ai" | "system";
  reasonCodes?: string[];
  confidence?: number | null;
}) {
  const { data: task } = await supabaseAdmin
    .from("tasks")
    .select("id, title, due_at, assigned_to, property_id, org_id")
    .eq("id", input.taskId)
    .eq("org_id", input.orgId)
    .maybeSingle();
  if (!task) throw new Error("That task no longer exists.");

  const { error } = await supabaseAdmin
    .from("tasks")
    .update({
      assigned_to: input.userId,
      assigned_at: new Date().toISOString(),
      status: "assigned",
    })
    .eq("id", input.taskId);
  if (error) throw new Error("Could not assign the task.");

  const { data: property } = await supabaseAdmin
    .from("properties")
    .select("name")
    .eq("id", task.property_id)
    .maybeSingle();

  await queueNotification({
    orgId: input.orgId,
    userId: input.userId,
    template: task.assigned_to ? "task_reassigned" : "task_assigned",
    data: {
      title: task.title,
      property: property?.name ?? "a property",
      due: new Date(task.due_at).toLocaleString(),
      reason: (input.reasonCodes ?? []).join(", "),
    },
  });

  await logAudit({
    orgId: input.orgId,
    actorId: input.actorId,
    actorType: input.actorType ?? "user",
    action: task.assigned_to ? "task.reassigned" : "task.assigned",
    entityType: "task",
    entityId: input.taskId,
    reasonCodes: input.reasonCodes ?? [],
    confidence: input.confidence ?? null,
    metadata: { to: input.userId, previous: task.assigned_to },
  });
}
