import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { useWorkspace } from "@/hooks/useWorkspace";
import { listNotifications, markNotificationsRead } from "@/lib/notifications.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications | AirClean" },
      { name: "description", content: "Every reminder and alert sent to you, newest first." },
      { property: "og:title", content: "Notifications | AirClean" },
      { property: "og:description", content: "Reminders and alerts for your turnovers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotificationsPage,
});

/** Small, purely cosmetic emoji per notification template. */
function templateEmoji(template: string | null) {
  const key = (template ?? "").toLowerCase();
  if (key.includes("overdue")) return "⏰";
  if (key.includes("unassigned")) return "🕳️";
  if (key.includes("assign")) return "📌";
  if (key.includes("review")) return "🔎";
  if (key.includes("maintenance")) return "🔧";
  if (key.includes("guest")) return "🧳";
  if (key.includes("invite") || key.includes("join")) return "🤝";
  return "🔔";
}

function NotificationsPage() {
  const { orgId } = useWorkspace();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["notifications", orgId],
    queryFn: () => listNotifications({ data: { orgId: orgId! } }),
    enabled: !!orgId,
  });

  const markAll = useMutation({
    mutationFn: () => markNotificationsRead({ data: { orgId: orgId! } }),
    onSuccess: () => {
      toast.success("All caught up ✅");
      qc.invalidateQueries({ queryKey: ["notifications", orgId] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not update these."),
  });

  const rows = data ?? [];
  const unread = rows.filter((n) => !n.read).length;

  return (
    <AppShell title="Notifications">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-2xl font-semibold tracking-tight">🔔 Your alerts</h2>
            <p className="text-sm text-muted-foreground">
              {unread > 0 ? `${unread} waiting for you.` : "Nothing unread. Nice. ☕"}
            </p>
          </div>
          {unread > 0 && (
            <Button variant="outline" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
              {markAll.isPending ? "Marking…" : "Mark all read"}
            </Button>
          )}
        </div>

        {isLoading && <Skeleton className="h-40 w-full" />}

        {!isLoading && rows.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              🕊️ No notifications yet.
            </CardContent>
          </Card>
        )}

        {rows.map((n, i) => (
          <Card
            key={n.id}
            className={`animate-rise hover-lift ${n.read ? "" : "border-primary/40"}`}
            style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
          >
            <CardContent className="space-y-1 p-4">
              <div className="flex items-start gap-2">
                <span aria-hidden>{templateEmoji(n.template)}</span>
                <p className="min-w-0 flex-1 text-sm font-medium">{n.subject}</p>
                {!n.read && <Badge variant="secondary">New</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">{n.body}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(n.createdAt).toLocaleString()}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
