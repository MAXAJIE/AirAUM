import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, MapPin, Sparkles } from "lucide-react";
import { AirCleanLogo } from "@/components/brand";
import { StarPicker } from "@/components/stars";
import { getPropertyReviewTarget, submitPropertyReview } from "@/lib/reviews.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/r/p/$code")({
  head: () => ({
    meta: [
      { title: "Rate this stay | AirClean" },
      {
        name: "description",
        content: "Scan, rate and tell the housekeeping team how this exact unit looked on arrival.",
      },
      { property: "og:title", content: "Rate this stay | AirClean" },
      { property: "og:description", content: "Feedback for this unit — no account needed." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PropertyReview,
});

type Target = Awaited<ReturnType<typeof getPropertyReviewTarget>>;

function PropertyReview() {
  const { code } = useParams({ from: "/r/p/$code" });

  // Public page: the lookup runs from the component because prerender has no
  // session and the code alone identifies the property.
  const [target, setTarget] = useState<Target | undefined>(undefined);
  const [rating, setRating] = useState(0);
  const [cleanliness, setCleanliness] = useState(0);
  const [communication, setCommunication] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    getPropertyReviewTarget({ data: { code } })
      .then((t) => {
        if (alive) setTarget(t);
      })
      .catch(() => {
        if (alive) setTarget(null);
      });
    return () => {
      alive = false;
    };
  }, [code]);

  const send = async () => {
    if (rating < 1) {
      toast.error("Pick a star rating first.");
      return;
    }
    setBusy(true);
    try {
      await submitPropertyReview({
        data: {
          code,
          rating,
          cleanliness: cleanliness || null,
          communication: communication || null,
          customerName: name.trim() || null,
          customerEmail: email.trim() || null,
          comment: comment.trim() || null,
        },
      });
      setDone(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send your review.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="aurora" aria-hidden />
      <header className="relative mx-auto flex max-w-3xl items-center px-4 py-6">
        <AirCleanLogo />
      </header>

      <main className="relative mx-auto max-w-2xl px-4 pb-20">
        {target === undefined && <Skeleton className="h-72 w-full" />}

        {target === null && (
          <Card>
            <CardContent className="p-10 text-center">
              <p className="font-display text-xl font-semibold">This QR code is not active</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Ask your host for the current review code for this unit.
              </p>
            </CardContent>
          </Card>
        )}

        {target && done && (
          <Card className="glow-ring">
            <CardContent className="space-y-3 p-10 text-center">
              <CheckCircle2 className="animate-pop mx-auto size-12 text-success" />
              <p className="font-display text-2xl font-semibold">Thank you</p>
              <p className="text-sm text-muted-foreground">
                {target.orgName} has your feedback for {target.propertyName}.
              </p>
            </CardContent>
          </Card>
        )}

        {target && !done && (
          <Card className="animate-rise">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-display text-2xl">
                <Sparkles className="size-5 text-primary" /> How was {target.propertyName}?
              </CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-2">
                <MapPin className="size-4" />
                {[target.unitLabel, target.city].filter(Boolean).join(" · ") || target.orgName}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Overall</Label>
                <StarPicker value={rating} onChange={setRating} label="Overall rating" />
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Cleanliness</Label>
                  <StarPicker value={cleanliness} onChange={setCleanliness} label="Cleanliness" />
                </div>
                <div className="space-y-2">
                  <Label>Communication</Label>
                  <StarPicker
                    value={communication}
                    onChange={setCommunication}
                    label="Communication"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="comment">Anything the team should fix here?</Label>
                <Textarea
                  id="comment"
                  rows={4}
                  maxLength={2000}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="The shower drained slowly, everything else was spotless…"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Your name (optional)</Label>
                  <Input
                    id="name"
                    value={name}
                    maxLength={80}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email (optional)</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    maxLength={160}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <Button size="lg" className="w-full" disabled={busy} onClick={send}>
                {busy ? "Sending…" : "Send review"}
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
