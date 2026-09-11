import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useWorkspace, isStaff } from "@/hooks/useWorkspace";
import { listTasks } from "@/lib/tasks.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/tasks/")({
  head: () => ({
    meta: [
      { title: "Tasks | AirClean" },
      { name: "description", content: "Every turnover, deep clean and inspection with its status and deadline." },
      { property: "og:title", content: "Tasks | AirClean" },
      { property: "og:description", content: "Turnover jobs, deadlines and quality status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TasksPage,
});

const STATUS_LABEL: Record<string, string> = {
  unassigned: "Unassigned",
  assigned: "Assigned",
  in_progress: "In progress",
  submitted: "Submitted",
  needs_review: "Needs review",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function statusTone(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "completed") return "secondary";
  if (status === "needs_review") return "destructive";
  if (status === "in_progress" || status === "submitted") return "default";
  return "outline";
}

function TasksPage() {
  const { orgId, workspace } = useWorkspace();
  const staff = isStaff(workspace?.role);
  const [scope, setScope] = useState<"all" | "mine">(staff ? "all" : "mine");
  const [status, setStatus] = useState<string>("open");

  const { data, isLoading } = useQuery({
    queryKey: ["tasks", orgId, scope],
    queryFn: () => listTasks({ data: { orgId: orgId!, scope } }),
    enabled: !!orgId,
  });

  const rows = (data ?? []).filter((t) => {
    if (status === "all") return true;
    if (status === "open") return !["completed", "cancelled"].includes(t.status);
    return t.status === status;
  });

  return (
    <AppShell title="Tasks">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {staff && (
            <Select value={scope} onValueChange={(v) => setScope(v as "all" | "mine")}>
              <SelectTrigger className="w-40" aria-label="Scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Whole team</SelectItem>
                <SelectItem value="mine">Assigned to me</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44" aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open work</SelectItem>
              <SelectItem value="all">Everything</SelectItem>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {staff && (
            <Button asChild className="ml-auto" size="sm">
              <Link to="/bookings">Add work from bookings</Link>
            </Button>
          )}
        </div>

        {isLoading && <Skeleton className="h-40 w-full" />}

        {!isLoading && rows.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Nothing here yet. Turnover jobs appear as soon as bookings are added.
            </CardContent>
          </Card>
        )}

        <div className="grid gap-3">
          {rows.map((t) => (
            <Link key={t.id} to="/tasks/$taskId" params={{ taskId: t.id }} className="block">
              <Card className="transition-colors hover:border-primary/50">
                <CardContent className="flex flex-wrap items-center gap-3 p-5">
                  <div className="min-w-48 flex-1">
                    <p className="font-medium">{t.title}</p>
                    <p className="text-sm text-muted-foreground">{t.propertyName}</p>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Due {new Date(t.dueAt).toLocaleString()}
                  </div>
                  {t.assigneeName && <Badge variant="outline">{t.assigneeName}</Badge>}
                  {t.overdue && <Badge variant="destructive">Overdue</Badge>}
                  <Badge variant={statusTone(t.status)}>{STATUS_LABEL[t.status] ?? t.status}</Badge>
                  {t.qcScore !== null && <Badge variant="secondary">{Math.round(t.qcScore * 100)}%</Badge>}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
