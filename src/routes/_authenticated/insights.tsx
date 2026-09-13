import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/app-shell";
import { useWorkspace } from "@/hooks/useWorkspace";
import { getInsights } from "@/lib/insights.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/insights")({
  head: () => ({
    meta: [
      { title: "Insights | AirClean" },
      {
        name: "description",
        content: "Turnovers per week, cleaning quality trend and your team leaderboard.",
      },
      { property: "og:title", content: "Insights | AirClean" },
      {
        property: "og:description",
        content: "Eight weeks of turnovers, quality and team performance in one view.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InsightsPage,
});

const MEDALS = ["🥇", "🥈", "🥉"];

function shortWeek(week: string) {
  const d = new Date(`${week}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return week;
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

function InsightsPage() {
  const { orgId } = useWorkspace();
  const { data, isLoading, error } = useQuery({
    queryKey: ["insights", orgId],
    queryFn: () => getInsights({ data: { orgId: orgId! } }),
    enabled: !!orgId,
  });

  const chartData = (data?.weeks ?? []).map((w) => ({ ...w, label: shortWeek(w.week) }));
  const hasQuality = chartData.some((w) => w.quality !== null);

  const cards = data
    ? [
        { label: "Jobs in 8 weeks", value: String(data.totals.tasks), emoji: "🗂️" },
        { label: "Finished", value: String(data.totals.completed), emoji: "✅" },
        { label: "Completion rate", value: `${data.totals.completionRate}%`, emoji: "📈" },
        {
          label: "Photo quality",
          value: data.totals.quality === null ? "—" : `${data.totals.quality}%`,
          emoji: "✨",
        },
        {
          label: "Guest rating",
          value: data.totals.guestAverage === null ? "—" : `${data.totals.guestAverage}★`,
          emoji: "💬",
        },
      ]
    : [];

  return (
    <AppShell title="Insights">
      <div className="space-y-6">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            📊 Last eight weeks
          </h2>
          <p className="text-sm text-muted-foreground">
            How much work went through, how clean it came out, and who carried it.
          </p>
        </div>

        {isLoading && <Skeleton className="h-40 w-full" />}
        {error && (
          <Card>
            <CardContent className="p-6 text-sm text-destructive">
              {(error as Error).message}
            </CardContent>
          </Card>
        )}

        {data && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cards.map((c, i) => (
                <Card
                  key={c.label}
                  className="animate-rise hover-lift"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <CardContent className="p-5">
                    <p className="text-sm text-muted-foreground">
                      <span aria-hidden>{c.emoji}</span> {c.label}
                    </p>
                    <p className="mt-1 font-display text-3xl font-semibold">{c.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="animate-rise">
              <CardHeader>
                <CardTitle className="text-base">🧺 Turnovers per week</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--border)"
                        vertical={false}
                      />
                      <XAxis dataKey="label" fontSize={12} stroke="var(--muted-foreground)" />
                      <YAxis allowDecimals={false} fontSize={12} stroke="var(--muted-foreground)" />
                      <Tooltip
                        contentStyle={{
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          color: "var(--card-foreground)",
                        }}
                      />
                      <Bar
                        dataKey="total"
                        name="Scheduled"
                        radius={[6, 6, 0, 0]}
                        fill="var(--muted-foreground)"
                        opacity={0.35}
                      />
                      <Bar
                        dataKey="completed"
                        name="Finished"
                        radius={[6, 6, 0, 0]}
                        fill="var(--primary)"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="animate-rise">
              <CardHeader>
                <CardTitle className="text-base">✨ Quality trend</CardTitle>
              </CardHeader>
              <CardContent>
                {hasQuality ? (
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--border)"
                          vertical={false}
                        />
                        <XAxis dataKey="label" fontSize={12} stroke="var(--muted-foreground)" />
                        <YAxis domain={[0, 100]} fontSize={12} stroke="var(--muted-foreground)" />
                        <Tooltip
                          contentStyle={{
                            background: "var(--card)",
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                            color: "var(--card-foreground)",
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="quality"
                          name="Quality %"
                          stroke="var(--primary)"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                          connectNulls
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No photo checks scored yet — the line appears once jobs get reviewed. 🔎
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="animate-rise">
              <CardHeader>
                <CardTitle className="text-base">🏅 Team leaderboard</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.cleaners.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Nobody has finished a job in this window yet. 🌱
                  </p>
                )}
                {data.cleaners.map((c, i) => (
                  <div
                    key={c.userId}
                    className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm hover-lift"
                  >
                    <span aria-hidden className="w-6 text-center">
                      {MEDALS[i] ?? `${i + 1}.`}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                    <Badge variant="secondary">{c.completed} done</Badge>
                    {c.quality !== null && <Badge variant="outline">✨ {c.quality}%</Badge>}
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
