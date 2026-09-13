import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useWorkspace, isStaff } from "@/hooks/useWorkspace";
import { listTasks, type TaskListRow } from "@/lib/tasks.functions";
import {
  dayKey,
  taskStatusEmoji,
  taskStatusLabel,
  timeLabel,
  weekDays,
} from "@/lib/task-display";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/schedule")({
  head: () => ({
    meta: [
      { title: "Schedule | AirClean" },
      {
        name: "description",
        content: "A week at a glance: every turnover by day, plus how the work is spread across your team.",
      },
      { property: "og:title", content: "Schedule | AirClean" },
      { property: "og:description", content: "Week calendar of turnovers and cleaner workload." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SchedulePage,
});

function SchedulePage() {
  const { orgId, workspace } = useWorkspace();
  const staff = isStaff(workspace?.role);
  const [weekOffset, setWeekOffset] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["tasks", orgId, "all"],
    queryFn: () => listTasks({ data: { orgId: orgId!, scope: "all" } }),
    enabled: !!orgId && staff,
  });

  const days = useMemo(() => {
    const base = new Date();
    base.setDate(base.getDate() + weekOffset * 7);
    return weekDays(base);
  }, [weekOffset]);

  const byDay = useMemo(() => {
    const map = new Map<string, TaskListRow[]>();
    for (const d of days) map.set(dayKey(d), []);
    for (const t of data ?? []) {
      const key = dayKey(t.scheduledStart || t.dueAt);
      const bucket = map.get(key);
      if (bucket) bucket.push(t);
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
    }
    return map;
  }, [data, days]);

  const weekTasks = useMemo(() => [...byDay.values()].flat(), [byDay]);

  const workload = useMemo(() => {
    const counts = new Map<string, { name: string; total: number; done: number }>();
    for (const t of weekTasks) {
      const key = t.assignedTo ?? "unassigned";
      const name = t.assigneeName ?? "Unassigned";
      const row = counts.get(key) ?? { name, total: 0, done: 0 };
      row.total += 1;
      if (t.status === "completed") row.done += 1;
      counts.set(key, row);
    }
    return [...counts.values()].sort((a, b) => b.total - a.total);
  }, [weekTasks]);

  const busiest = workload.reduce((m, r) => Math.max(m, r.total), 0);
  const todayKey = dayKey(new Date());
  const rangeLabel = `${days[0]!.toLocaleDateString([], { day: "numeric", month: "short" })} – ${days[6]!.toLocaleDateString([], { day: "numeric", month: "short" })}`;

  if (!staff) {
    return (
      <AppShell title="Schedule">
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            🔒 The team schedule is for managers and supervisors. Your own jobs live in{" "}
            <Link to="/my-day" className="text-primary underline-offset-4 hover:underline">
              My day
            </Link>
            .
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Schedule">
      <div className="space-y-6">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:justify-between">
          <div className="min-w-0">
            <h2 className="truncate font-display text-2xl font-semibold tracking-tight">
              🗓️ {rangeLabel}
            </h2>
            <p className="text-sm text-muted-foreground">
              {weekTasks.length} job{weekTasks.length === 1 ? "" : "s"} in this week.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="icon" aria-label="Previous week" onClick={() => setWeekOffset((w) => w - 1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setWeekOffset(0)}>
              <CalendarDays className="mr-2 size-4" /> This week
            </Button>
            <Button variant="outline" size="icon" aria-label="Next week" onClick={() => setWeekOffset((w) => w + 1)}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>

        {isLoading && <Skeleton className="h-64 w-full" />}

        {!isLoading && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
            {days.map((d, i) => {
              const key = dayKey(d);
              const items = byDay.get(key) ?? [];
              const isToday = key === todayKey;
              return (
                <Card
                  key={key}
                  className={`animate-rise ${isToday ? "border-primary/60 glow-ring" : ""}`}
                  style={{ animationDelay: `${i * 45}ms` }}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-baseline gap-2 text-sm">
                      <span>{d.toLocaleDateString([], { weekday: "short" })}</span>
                      <span className="text-muted-foreground">{d.getDate()}</span>
                      {isToday && <span className="ml-auto text-xs text-primary">today</span>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 p-4 pt-0">
                    {items.length === 0 && <p className="text-xs text-muted-foreground">😴 Nothing booked</p>}
                    {items.map((t) => (
                      <Link
                        key={t.id}
                        to="/tasks/$taskId"
                        params={{ taskId: t.id }}
                        className="hover-lift block rounded-lg border border-border bg-surface p-2 text-xs"
                      >
                        <p className="font-medium">
                          {taskStatusEmoji(t.status)} {timeLabel(t.dueAt)}
                        </p>
                        <p className="truncate text-muted-foreground">{t.propertyName}</p>
                        <p className="truncate text-muted-foreground">
                          {t.assigneeName ?? "Unassigned"}
                        </p>
                        {t.overdue && (
                          <Badge variant="destructive" className="mt-1">
                            Overdue
                          </Badge>
                        )}
                      </Link>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">👷 Workload this week</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {workload.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing scheduled yet for this week.</p>
            )}
            {workload.map((row) => (
              <div key={row.name} className="space-y-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 truncate font-medium">
                    {row.name === "Unassigned" ? "🕳️ Unassigned" : `🧽 ${row.name}`}
                  </span>
                  <span className="ml-auto shrink-0 text-muted-foreground">
                    {row.done}/{row.total} done
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-700"
                    style={{ width: `${busiest ? (row.total / busiest) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {weekTasks.some((t) => t.status === "unassigned") && (
          <Card className="border-primary/40">
            <CardContent className="flex flex-wrap items-center gap-3 p-5 text-sm">
              <span>
                ⚠️ {weekTasks.filter((t) => t.status === "unassigned").length} job
                {weekTasks.filter((t) => t.status === "unassigned").length === 1 ? "" : "s"} still need someone.
              </span>
              <Button asChild size="sm" className="ml-auto">
                <Link to="/tasks">Assign now</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-muted-foreground">
          {["assigned", "in_progress", "needs_review", "completed"]
            .map((s) => `${taskStatusEmoji(s)} ${taskStatusLabel(s)}`)
            .join(" · ")}
        </p>
      </div>
    </AppShell>
  );
}
