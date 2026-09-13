import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Monday-start key for a date, computed on the server in UTC to stay stable. */
function weekStart(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const day = (d.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return monday.toISOString().slice(0, 10);
}

export type InsightsWeek = {
  week: string;
  total: number;
  completed: number;
  quality: number | null;
};

export type CleanerStat = {
  userId: string;
  name: string;
  completed: number;
  quality: number | null;
};

/**
 * Read-only manager insights over the last 8 weeks. Everything is aggregated
 * in memory from rows the caller is already allowed to see — no new tables.
 */
export const getInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireMembership, supabaseAdmin, STAFF_ROLES } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId, STAFF_ROLES);

    const since = new Date(Date.now() - 56 * 86400000);
    const sinceIso = since.toISOString();

    const { data: tasks } = await supabaseAdmin
      .from("tasks")
      .select("id, status, qc_score, due_at, assigned_to")
      .eq("org_id", data.orgId)
      .gte("due_at", sinceIso)
      .limit(2000);

    const rows = tasks ?? [];

    // Weekly buckets, oldest first, with empty weeks kept so the chart has no gaps.
    const buckets = new Map<string, { total: number; completed: number; scores: number[] }>();
    for (let i = 7; i >= 0; i -= 1) {
      const d = new Date(Date.now() - i * 7 * 86400000).toISOString();
      buckets.set(weekStart(d), { total: 0, completed: 0, scores: [] });
    }
    for (const t of rows) {
      const key = weekStart(t.due_at);
      const bucket = buckets.get(key);
      if (!bucket) continue;
      bucket.total += 1;
      if (t.status === "completed") bucket.completed += 1;
      if (t.qc_score !== null) bucket.scores.push(Number(t.qc_score));
    }

    const weeks: InsightsWeek[] = [...buckets.entries()].map(([week, b]) => ({
      week,
      total: b.total,
      completed: b.completed,
      quality: b.scores.length
        ? Math.round((b.scores.reduce((a, c) => a + c, 0) / b.scores.length) * 100)
        : null,
    }));

    // Leaderboard: completed jobs per cleaner, with their average quality.
    const perUser = new Map<string, { completed: number; scores: number[] }>();
    for (const t of rows) {
      if (!t.assigned_to || t.status !== "completed") continue;
      const entry = perUser.get(t.assigned_to) ?? { completed: 0, scores: [] };
      entry.completed += 1;
      if (t.qc_score !== null) entry.scores.push(Number(t.qc_score));
      perUser.set(t.assigned_to, entry);
    }

    const userIds = [...perUser.keys()];
    const { data: profiles } = userIds.length
      ? await supabaseAdmin.from("profiles").select("id, full_name").in("id", userIds)
      : { data: [] };
    const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

    const cleaners: CleanerStat[] = userIds
      .map((userId) => {
        const entry = perUser.get(userId)!;
        return {
          userId,
          name: nameById.get(userId) ?? "Team member",
          completed: entry.completed,
          quality: entry.scores.length
            ? Math.round((entry.scores.reduce((a, c) => a + c, 0) / entry.scores.length) * 100)
            : null,
        };
      })
      .sort((a, b) => b.completed - a.completed)
      .slice(0, 8);

    const { data: reviews } = await supabaseAdmin
      .from("customer_reviews")
      .select("rating, status, created_at")
      .eq("org_id", data.orgId)
      .gte("created_at", sinceIso)
      .limit(500);

    const scored = (reviews ?? []).filter((r) => r.status !== "archived");
    const guestAverage = scored.length
      ? Math.round((scored.reduce((sum, r) => sum + Number(r.rating), 0) / scored.length) * 10) / 10
      : null;

    const completedTotal = rows.filter((t) => t.status === "completed").length;
    const allScores = rows.filter((t) => t.qc_score !== null).map((t) => Number(t.qc_score));

    return {
      weeks,
      cleaners,
      totals: {
        tasks: rows.length,
        completed: completedTotal,
        completionRate: rows.length ? Math.round((completedTotal / rows.length) * 100) : 0,
        quality: allScores.length
          ? Math.round((allScores.reduce((a, c) => a + c, 0) / allScores.length) * 100)
          : null,
        guestAverage,
        guestReviews: scored.length,
      },
    };
  });
