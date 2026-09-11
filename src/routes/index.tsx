import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, ShieldCheck, Sparkles, CalendarRange, Camera, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AirClean — Turnover cleaning operations for short-stay hosts" },
      {
        name: "description",
        content:
          "Plan turnovers from your bookings, assign the right cleaner, verify finished work from photos and keep maintenance moving — in one clean workspace.",
      },
      { property: "og:title", content: "AirClean — Turnover cleaning operations" },
      {
        property: "og:description",
        content:
          "Bookings in, spotless turnovers out. Scheduling, assignment, photo quality checks and maintenance for short-stay teams.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: CalendarRange,
    title: "Bookings become schedules",
    body: "Add stays by hand or upload a CSV. Turnover jobs appear automatically with the right window between guests.",
  },
  {
    icon: Sparkles,
    title: "The right person, every time",
    body: "Availability, workload, skills and location decide who can take a job. A suggestion ranks the shortlist; you always confirm.",
  },
  {
    icon: Camera,
    title: "Photo quality checks",
    body: "Cleaners submit a full photo set. It is reviewed as one, scored, and anything unclear goes to a person instead of passing quietly.",
  },
  {
    icon: Wrench,
    title: "Maintenance that gets picked up",
    body: "Report an issue with a photo, get it sorted by severity, assigned, and tracked to done.",
  },
  {
    icon: ShieldCheck,
    title: "Careful with your data",
    body: "Separate workspaces, role-based access, encrypted addresses and door codes, a full activity trail and scheduled backups.",
  },
  {
    icon: CheckCircle2,
    title: "Made to be adjusted",
    body: "Themes, spacing, checklists, quality thresholds and notification channels are all yours to set.",
  },
];

function Landing() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-5">
        <span className="grid size-9 place-items-center rounded-xl bg-primary font-display text-sm font-bold text-primary-foreground">
          OP
        </span>
        <span className="font-display text-lg font-semibold tracking-tight">AirClean</span>
        <div className="ml-auto flex items-center gap-2">
          {signedIn ? (
            <Button asChild>
              <Link to="/dashboard">Open workspace</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost">
                <Link to="/auth">Sign in</Link>
              </Button>
              <Button asChild>
                <Link to="/auth">Get started</Link>
              </Button>
            </>
          )}
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 md:pt-20">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
          <Sparkles className="size-3.5" /> Turnover operations for short-stay teams
        </p>
        <h1 className="max-w-3xl font-display text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
          Every stay ends clean, on time, and checked.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
          AirClean turns your bookings into turnover jobs, puts them with the right cleaner,
          verifies the finished work from photos, and keeps maintenance from slipping through.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to={signedIn ? "/dashboard" : "/auth"}>
              {signedIn ? "Open workspace" : "Create your workspace"}
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/auth">Join your team</Link>
          </Button>
        </div>
      </section>

      <section className="border-t border-border bg-surface py-16">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <Card key={f.title} className="border-border/70">
                <CardContent className="space-y-3 p-6">
                  <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </span>
                  <h2 className="font-display text-lg font-semibold">{f.title}</h2>
                  <p className="text-sm text-muted-foreground">{f.body}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
        <span>© {new Date().getFullYear()} AirClean</span>
        <span className="ml-auto">Built for property managers and their cleaning teams.</span>
      </footer>
    </div>
  );
}
