import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  Archive,
  Copy,
  MessageSquareQuote,
  Printer,
  QrCode as QrIcon,
  Star,
  TrendingUp,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Stars } from "@/components/stars";
import { useWorkspace, isAdmin } from "@/hooks/useWorkspace";
import { listPropertyReviewLinks, listReviews, updateReview } from "@/lib/reviews.functions";
import { QrCode } from "@/components/qr-code";
import { printQrPoster } from "@/lib/qr-poster";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/reviews")({
  head: () => ({
    meta: [
      { title: "Reviews | AirClean" },
      { name: "description", content: "Guest ratings and written feedback for your properties." },
      { property: "og:title", content: "Reviews | AirClean" },
      { property: "og:description", content: "Collect, answer and publish guest reviews." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReviewsPage,
});

type Filter = "all" | "new" | "published" | "archived";

function ReviewsPage() {
  const { orgId, workspace } = useWorkspace();
  const admin = isAdmin(workspace?.role);
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const links = useQuery({
    queryKey: ["property-review-links", orgId],
    queryFn: () => listPropertyReviewLinks({ data: { orgId: orgId! } }),
    enabled: !!orgId,
  });

  const reviews = useQuery({
    queryKey: ["reviews", orgId],
    queryFn: () => listReviews({ data: { orgId: orgId! } }),
    enabled: !!orgId,
  });

  const mutate = useMutation({
    mutationFn: (input: {
      reviewId: string;
      status?: "new" | "published" | "archived";
      reply?: string | null;
    }) => updateReview({ data: { orgId: orgId!, ...input } }),
    onSuccess: () => {
      toast.success("Review updated.");
      void qc.invalidateQueries({ queryKey: ["reviews", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stats = reviews.data?.stats;
  const list = (reviews.data?.reviews ?? []).filter((r) => filter === "all" || r.status === filter);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const activeLinks = (links.data ?? []).filter((p) => p.active);

  return (
    <AppShell title="Reviews">
      <div className="space-y-6">
        <Card className="glow-ring overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <QrIcon className="size-4" /> A review QR per property
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Print each unit&apos;s code and leave it in the flat. Every review that arrives is
              tied to that property, so you can see exactly which one keeps slipping.
            </p>

            {links.isLoading && <Skeleton className="h-40 w-full" />}

            {!links.isLoading && activeLinks.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Add a property first — each one gets its own code automatically.
              </p>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              {activeLinks.map((p) => {
                const url = `${origin}/r/p/${p.reviewCode}`;
                const subtitle = [p.unitLabel, p.city].filter(Boolean).join(" · ");
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-4 rounded-xl border border-border p-4"
                  >
                    <QrCode value={url} size={120} alt={`Review QR for ${p.name}`} />
                    <div className="min-w-0 space-y-2">
                      <p className="truncate font-medium">{p.name}</p>
                      {subtitle && (
                        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
                      )}
                      <code className="block truncate rounded-md bg-muted px-2 py-1 font-mono text-xs">
                        /r/p/{p.reviewCode}
                      </code>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            void navigator.clipboard.writeText(url);
                            toast.success("Link copied.");
                          }}
                        >
                          <Copy className="mr-2 size-4" /> Copy
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            void printQrPoster({
                              title: `How was ${p.name}?`,
                              subtitle: "Scan to rate your stay — no account needed.",
                              url,
                            })
                          }
                        >
                          <Printer className="mr-2 size-4" /> Print
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile
            icon={Star}
            label="Average rating"
            value={stats ? stats.average.toFixed(1) : "—"}
            hint={stats ? `${stats.total} reviews` : ""}
          />
          <StatTile
            icon={TrendingUp}
            label="4 stars and up"
            value={stats ? String(stats.promoters) : "—"}
            hint="Happy guests"
          />
          <StatTile
            icon={MessageSquareQuote}
            label="Needs attention"
            value={stats ? String(stats.detractors) : "—"}
            hint="2 stars or less"
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rating by property</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {reviews.isLoading && <Skeleton className="h-24 w-full" />}
            {!reviews.isLoading && (reviews.data?.byProperty ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">
                No reviews yet. The weakest property shows up at the top once they arrive.
              </p>
            )}
            {(reviews.data?.byProperty ?? []).map((p) => (
              <div
                key={p.propertyId ?? "unassigned"}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-4 py-3"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{p.propertyName}</span>
                <Stars value={Math.round(p.average)} />
                <span className="text-sm font-medium">{p.average.toFixed(1)}</span>
                <span className="text-xs text-muted-foreground">{p.total} reviews</span>
                {p.detractors > 0 && <Badge variant="destructive">{p.detractors} unhappy</Badge>}
              </div>
            ))}
          </CardContent>
        </Card>

        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="new">New</TabsTrigger>
            <TabsTrigger value="published">Published</TabsTrigger>
            <TabsTrigger value="archived">Archived</TabsTrigger>
          </TabsList>
        </Tabs>

        {reviews.isLoading && <Skeleton className="h-40 w-full" />}

        {!reviews.isLoading && list.length === 0 && (
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              No reviews here yet. Share your review link after the next checkout.
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4">
          {list.map((r) => (
            <Card key={r.id} className="hover-lift">
              <CardContent className="space-y-3 p-6">
                <div className="flex flex-wrap items-center gap-3">
                  <Stars value={r.rating} />
                  <span className="font-medium">{r.customerName ?? "Anonymous guest"}</span>
                  {r.propertyName && <Badge variant="outline">{r.propertyName}</Badge>}
                  <Badge variant={r.status === "published" ? "secondary" : "outline"}>
                    {r.status}
                  </Badge>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </span>
                </div>

                {r.comment && <p className="text-sm text-muted-foreground">{r.comment}</p>}

                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                  {r.cleanliness != null && <span>Cleanliness {r.cleanliness}/5</span>}
                  {r.communication != null && <span>Communication {r.communication}/5</span>}
                </div>

                {r.reply && (
                  <p className="rounded-lg bg-muted/50 p-3 text-sm">
                    <span className="font-medium">Your reply: </span>
                    {r.reply}
                  </p>
                )}

                {admin && (
                  <div className="space-y-2 border-t border-border pt-3">
                    <Textarea
                      rows={2}
                      placeholder="Reply to this guest…"
                      value={drafts[r.id] ?? r.reply ?? ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          mutate.mutate({
                            reviewId: r.id,
                            reply: (drafts[r.id] ?? r.reply ?? "").trim() || null,
                          })
                        }
                      >
                        Save reply
                      </Button>
                      {r.status !== "published" && (
                        <Button
                          size="sm"
                          onClick={() => mutate.mutate({ reviewId: r.id, status: "published" })}
                        >
                          Publish
                        </Button>
                      )}
                      {r.status !== "archived" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => mutate.mutate({ reviewId: r.id, status: "archived" })}
                        >
                          <Archive className="mr-2 size-4" /> Archive
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Star;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card className="hover-lift">
      <CardContent className="flex items-center gap-4 p-6">
        <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="font-display text-2xl font-semibold">{value}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
