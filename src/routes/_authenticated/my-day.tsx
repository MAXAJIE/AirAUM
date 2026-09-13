import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { ArrowRight, Play } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { useWorkspace } from "@/hooks/useWorkspace";
import { listTasks, startTask, type TaskListRow } from "@/lib/tasks.functions";
import { dayKey, taskStatusEmoji, taskStatusLabel, taskStatusTone, timeLabel } from "@/lib/task-display";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/my-day")({
  head: () => ({
    meta: [
      { title: "My day | AirClean" },
      { name: "description", content: "Your jobs for today, in order, with one tap to start." },
      { property: "og:title", content: "My day | AirClean" },
      { property: "og:description", content: "A phone-friendly list of your cleaning jobs for today." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyDayPage,
});

const DONE = ["completed", "cancelled"];

function MyDayPage() {
  const { orgId, session } = useWorkspace();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["tasks", orgId, "mine"],
    queryFn: () => listTasks({ data: { orgId: orgId!, scope: "mine" } }),
    enabled: !!orgId,
  });

  const start = useMutation({
    mutationFn: (taskId: string) => startTask({ data: { orgId: orgId!, taskId } }),
    onSuccess: () => {
      toast.success("Job started 🧹 Good luck!");
      qc.invalidateQueries({ queryKey: ["tasks", orgId, "mine"] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not start this job."),
  });

  const todayKey = dayKey(new Date());
  const rows = data ?? [];

  const today = useMemo(
    () =>
      rows
        .filter((t) => dayKey(t.scheduledStart || t.dueAt) === todayKey && !DONE.includes(t.status))
        .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()),
    [rows, todayKey],
  );

  const later = useMemo(
    () =>
      rows
        .filter(
          (t) =>
            !DONE.includes(t.status) &&
            dayKey(t.scheduledStart || t.dueAt) !== todayKey &&
            new Date(t.dueAt).getTime() > Date.now(),
        )
        .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
        .slice(0, 5),
    [rows, todayKey],
  );

  const doneToday = rows.filter(
    (t) => t.status === "completed" && dayKey(t.scheduledStart || t.dueAt) === todayKey,
  ).length;
  const total = today.length + doneToday;
  const progress = total ? Math.round((doneToday / total) * 100) : 0;
  const firstName = (session?.fullName ?? "there").split(" ")[0];

  return (
    <AppShell title="My day">
      <div className="mx-auto max-w-2xl space-y-5">
        <Card className="animate-rise overflow-hidden">
          <CardContent className="space-y-3 p-5">
            <p className="font-display text-xl font-semibold tracking-tight">
              👋 Hi {firstName}
            </p>
            <p className="text-sm text-muted-foreground">
              {total === 0
                ? "No jobs on your plate today. Enjoy the quiet. ☕"
                : `${doneToday} of ${total} done today.`}
            </p>
            <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>
            {progress === 100 && total > 0 && (
              <p className="animate-pop text-sm font-medium text-primary">🎉 All clear for today!</p>
            )}
          </CardContent>
        </Card>

        {isLoading && <Skeleton className="h-40 w-full" />}

        {!isLoading && (
          <section className="space-y-3">
            <h2 className="font-display text-lg font-semibold">🧹 Today</h2>
            {today.length === 0 && (
              <Card>
                <CardContent className="p-6 text-center text-sm text-muted-foreground">
                  Nothing left for today. ✨
                </CardContent>
              </Card>
            )}
            {today.map((t, i) => (
              <JobCard
                key={t.id}
                task={t}
                index={i}
                onStart={() => start.mutate(t.id)}
                starting={start.isPending && start.variables === t.id}
              />
            ))}
          </section>
        )}

        {later.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-display text-lg font-semibold">📅 Coming up</h2>
            {later.map((t) => (
              <Link key={t.id} to="/tasks/$taskId" params={{ taskId: t.id }} className="block">
                <Card className="hover-lift">
                  <CardContent className="flex items-center gap-3 p-4 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      {taskStatusEmoji(t.status)} {t.propertyName}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {new Date(t.dueAt).toLocaleDateString([], { day: "numeric", month: "short" })}{" "}
                      {timeLabel(t.dueAt)}
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </section>
        )}
      </div>
    </AppShell>
  );
}

function JobCard({
  task,
  index,
  onStart,
  starting,
}: {
  task: TaskListRow;
  index: number;
  onStart: () => void;
  starting: boolean;
}) {
  return (
    <Card
      className={`animate-rise hover-lift ${task.overdue ? "border-destructive/60" : ""}`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <CardContent className="space-y-3 p-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-semibold">{task.propertyName}</p>
            <p className="truncate text-sm text-muted-foreground">{task.title}</p>
          </div>
          <Badge variant={taskStatusTone(task.status)} className="shrink-0">
            {taskStatusEmoji(task.status)} {taskStatusLabel(task.status)}
          </Badge>
        </div>

        <p className="text-sm text-muted-foreground">
          ⏰ Due {timeLabel(task.dueAt)}
          {task.overdue && <span className="ml-2 font-medium text-destructive">Overdue</span>}
        </p>

        <div className="flex flex-wrap gap-2">
          {task.status === "assigned" && (
            <Button size="lg" className="flex-1" onClick={onStart} disabled={starting}>
              <Play className="mr-2 size-4" /> {starting ? "Starting…" : "Start job"}
            </Button>
          )}
          <Button asChild size="lg" variant={task.status === "assigned" ? "outline" : "default"} className="flex-1">
            <Link to="/tasks/$taskId" params={{ taskId: task.id }}>
              Open <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
