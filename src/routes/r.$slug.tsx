import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Sparkles } from "lucide-react";
import { AirCleanLogo } from "@/components/brand";
import { StarPicker } from "@/components/stars";
import { getReviewTarget, submitReview } from "@/lib/reviews.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/r/$slug")({
  head: () => ({
    meta: [
      { title: "Rate your stay | AirClean" },
      { name: "description", content: "Tell your host how clean and comfortable your stay was." },
      { property: "og:title", content: "Rate your stay | AirClean" },
      { property: "og:description", content: "Leave a quick review — no account needed." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PublicReview,
});

type Target = Awaited<ReturnType<typeof getReviewTarget>>;

function PublicReview() {
  const { slug } = useParams({ from: "/r/$slug" });

  // The page is public, so the lookup runs from the component rather than a
  // loader — prerender has no session and needs none here.
  const [target, setTarget] = useState<Target | undefined>(undefined);
  const [rating, setRating] = useState(0);
  const [cleanliness, setCleanliness] = useState(0);
  const [communication, setCommunication] = useState(0);
  const [propertyId, setPropertyId] = useState("none");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    getReviewTarget({ data: { slug } })
      .then((t) => {
        if (alive) setTarget(t);
      })
      .catch(() => {
        if (alive) setTarget(null);
      });
    return () => {
      alive = false;
    };
  }, [slug]);

  const send = async () => {
    if (rating < 1) {
      toast.error("Pick a star rating first.");
      return;
    }
    setBusy(true);
    try {
      await submitReview({
        data: {
          slug,
          propertyId: propertyId === "none" ? null : propertyId,
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
              <p className="font-display text-xl font-semibold">This review link is not valid</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Check the link with your host — it may have changed.
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
                {target.orgName} has your feedback. It helps their cleaning team a lot.
              </p>
            </CardContent>
          </Card>
        )}

        {target && !done && (
          <Card className="animate-rise">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-display text-2xl">
                <Sparkles className="size-5 text-primary" /> How was your stay?
              </CardTitle>
              <CardDescription>
                A minute of feedback for {target.orgName}. No account needed.
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

              {target.properties.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="property">Which place did you stay in?</Label>
                  <Select value={propertyId} onValueChange={setPropertyId}>
                    <SelectTrigger id="property">
                      <SelectValue placeholder="Choose a property" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">I would rather not say</SelectItem>
                      {target.properties.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="comment">Anything you want the team to know?</Label>
                <Textarea
                  id="comment"
                  rows={4}
                  maxLength={2000}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="The flat was spotless and the towels smelled great…"
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
