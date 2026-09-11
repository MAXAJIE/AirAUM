import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { useWorkspace } from "@/hooks/useWorkspace";
import { getDashboard } from "@/lib/dashboard.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Overview | AirClean" },
      { name: "description", content: "Today's turnovers, reviews, maintenance and team activity at a glance." },
      { property: "og:title", content: "Overview | AirClean" },
      { property: "og:description", content: "Your turnover operations at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { orgId, workspace } = useWorkspace();
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", orgId],
    queryFn: () => getDashboard({ data: { orgId: orgId! } }),
    enabled: !!orgId,
  });

  const stats = data
    ? [
        { label: "Due today", value: data.dueToday },
        { label: "Overdue", value: data.overdue },
        { label: "Unassigned", value: data.unassigned },
        { label: "In progress", value: data.inProgress },
        { label: "Waiting on review", value: data.needsReview },
        { label: "Open maintenance", value: data.openMaintenance },
      ]
    : [];

  return (
    <AppShell title="Overview">
      <div className="space-y-6">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            {workspace?.name ?? "Your workspace"}
          </h2>
          <p className="text-sm text-muted-foreground">The next seven days of work.</p>
        </div>

        {isLoading && <Skeleton className="h-32 w-full" />}

        {data && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {stats.map((s) => (
                <Card key={s.label}>
                  <CardContent className="p-5">
                    <p className="text-sm text-muted-foreground">{s.label}</p>
                    <p className="mt-1 font-display text-3xl font-semibold">{s.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Quality</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  <p className="font-display text-3xl font-semibold">
                    {data.avgQcScore === null ? "—" : `${data.avgQcScore}%`}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Average check score across recent turnovers.
                  </p>
                </CardContent>
              </Card>

              {data.staff && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Team & properties</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p>{data.properties} active properties</p>
                    <p>
                      {data.pendingMembers} people waiting for approval{" "}
                      {data.pendingMembers > 0 && (
                        <Button asChild size="sm" variant="link" className="px-1">
                          <Link to="/team">Review</Link>
                        </Button>
                      )}
                    </p>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Jump to</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link to="/tasks">Tasks</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/maintenance">Maintenance</Link>
                  </Button>
                  {data.staff && (
                    <Button asChild size="sm" variant="outline">
                      <Link to="/bookings">Bookings</Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>

            {data.staff && data.activity.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Recent activity</CardTitle>
                </CardHeader>
                <CardContent className="divide-y divide-border p-0">
                  {data.activity.map((a) => (
                    <div key={a.id} className="flex flex-wrap items-center gap-2 px-6 py-3 text-sm">
                      <span className="font-medium">{a.action.replace(/[._]/g, " ")}</span>
                      <span className="text-muted-foreground">{a.entityType}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {new Date(a.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
