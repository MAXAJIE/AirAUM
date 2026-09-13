import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import {
  checkoutGuestSession,
  getGuestContext,
  getGuestPortal,
  requestGuestPhotoUpload,
  saveGuestAmenityCheck,
  saveGuestCheckIn,
  startGuestSession,
  submitGuestReport,
} from "@/lib/guest.functions";

/**
 * Guest stay page — no account needed.
 *
 * The link identifies the property; the door access code proves the guest is
 * actually staying there. The resulting session id lives in localStorage so a
 * refresh does not lose the stay.
 */
export const Route = createFileRoute("/g/$code")({
  head: () => ({
    meta: [
      { title: "Your stay | AirClean" },
      {
        name: "description",
        content:
          "Check in, confirm the items in your unit and tell your host about anything that is not right.",
      },
      { property: "og:title", content: "Your stay | AirClean" },
      { property: "og:description", content: "Check in and report anything that needs attention." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GuestStayPage,
});

const storageKey = (code: string) => `airclean.guest.${code.toUpperCase()}`;

function GuestStayPage() {
  const { code } = Route.useParams();
  const qc = useQueryClient();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [accessCode, setAccessCode] = useState("");

  useEffect(() => {
    try {
      setSessionId(window.localStorage.getItem(storageKey(code)));
    } catch {
      setSessionId(null);
    }
  }, [code]);

  const portal = useQuery({
    queryKey: ["guest-portal", code],
    queryFn: () => getGuestPortal({ data: { code } }),
  });

  const context = useQuery({
    queryKey: ["guest-context", sessionId],
    queryFn: () => getGuestContext({ data: { sessionId: sessionId! } }),
    enabled: !!sessionId,
    retry: false,
  });

  // A stale or expired session should drop the guest back to the code form.
  useEffect(() => {
    if (!context.error) return;
    const message = context.error instanceof Error ? context.error.message : "";
    if (message.includes("session_")) {
      try {
        window.localStorage.removeItem(storageKey(code));
      } catch {
        /* storage unavailable */
      }
      setSessionId(null);
      toast.error("Your stay link expired. Enter the access code again.");
    }
  }, [context.error, code]);

  const unlock = useMutation({
    mutationFn: () => startGuestSession({ data: { code, accessCode } }),
    onSuccess: (result) => {
      try {
        window.localStorage.setItem(storageKey(code), result.sessionId);
      } catch {
        /* storage unavailable */
      }
      setSessionId(result.sessionId);
      setAccessCode("");
    },
    onError: (error: Error) =>
      toast.error(
        error.message === "bad_code"
          ? "That access code does not match this place."
          : "We could not open your stay. Please ask your host.",
      ),
  });

  if (portal.isLoading) {
    return <Centered>Loading your stay…</Centered>;
  }

  if (!portal.data) {
    return <Centered>This stay link is not valid. Please check the link from your host.</Centered>;
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-xl space-y-6">
        <header className="space-y-1 text-center">
          <p className="text-sm text-muted-foreground">{portal.data.orgName}</p>
          <h1 className="text-2xl font-semibold text-foreground">{portal.data.propertyName}</h1>
          {portal.data.city ? (
            <p className="text-sm text-muted-foreground">{portal.data.city}</p>
          ) : null}
        </header>

        {!sessionId ? (
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="space-y-2">
                <Label htmlFor="access-code">Access code</Label>
                <Input
                  id="access-code"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder="The code your host gave you"
                  autoComplete="one-time-code"
                />
              </div>
              <Button
                className="w-full"
                disabled={!accessCode.trim() || unlock.isPending}
                onClick={() => unlock.mutate()}
              >
                {unlock.isPending ? "Checking…" : "Open my stay"}
              </Button>
            </CardContent>
          </Card>
        ) : context.isLoading || !context.data ? (
          <Centered>Loading…</Centered>
        ) : (
          <>
            <CheckInCard
              sessionId={sessionId}
              data={context.data}
              onSaved={() => qc.invalidateQueries({ queryKey: ["guest-context", sessionId] })}
            />
            <AmenityCard
              sessionId={sessionId}
              data={context.data}
              onSaved={() => qc.invalidateQueries({ queryKey: ["guest-context", sessionId] })}
            />
            <FeedbackCard
              sessionId={sessionId}
              onSaved={() => qc.invalidateQueries({ queryKey: ["guest-context", sessionId] })}
            />
            <CheckoutCard
              sessionId={sessionId}
              data={context.data}
              onSaved={() => qc.invalidateQueries({ queryKey: ["guest-context", sessionId] })}
            />
          </>
        )}
      </div>
    </div>
  );
}

type GuestData = Awaited<ReturnType<typeof getGuestContext>>;

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <p className="max-w-sm text-center text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

function CheckInCard({
  sessionId,
  data,
  onSaved,
}: {
  sessionId: string;
  data: GuestData;
  onSaved: () => void;
}) {
  const [guestName, setGuestName] = useState(data.checkIn.guestName ?? "");
  const [partySize, setPartySize] = useState(String(data.checkIn.partySize ?? 1));
  const [contact, setContact] = useState("");

  const save = useMutation({
    mutationFn: () =>
      saveGuestCheckIn({
        data: {
          sessionId,
          guestName: guestName.trim(),
          partySize: Math.max(1, Math.min(30, Number(partySize) || 1)),
          contactNumber: contact.trim() ? contact.trim() : null,
        },
      }),
    onSuccess: () => {
      toast.success("Checked in. Have a great stay.");
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Check in</h2>
          {data.checkIn.checkInAt ? <Badge variant="secondary">Done</Badge> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="guest-name">Your name</Label>
          <Input id="guest-name" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="party-size">Guests</Label>
            <Input
              id="party-size"
              type="number"
              min={1}
              max={30}
              value={partySize}
              onChange={(e) => setPartySize(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact">Phone (optional)</Label>
            <Input id="contact" value={contact} onChange={(e) => setContact(e.target.value)} />
          </div>
        </div>
        <Button
          className="w-full"
          disabled={!guestName.trim() || save.isPending || data.checkedOut}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Saving…" : data.checkIn.checkInAt ? "Update check-in" : "Check in"}
        </Button>
      </CardContent>
    </Card>
  );
}

function AmenityCard({
  sessionId,
  data,
  onSaved,
}: {
  sessionId: string;
  data: GuestData;
  onSaved: () => void;
}) {
  const [counts, setCounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(data.amenities.map((a) => [a.id, String(a.foundQty ?? a.expectedQty)])),
  );

  const save = useMutation({
    mutationFn: () =>
      saveGuestAmenityCheck({
        data: {
          sessionId,
          entries: data.amenities.map((a) => ({
            amenityId: a.id,
            foundQty: Math.max(0, Math.min(999, Number(counts[a.id] ?? 0) || 0)),
            note: null,
          })),
        },
      }),
    onSuccess: () => {
      toast.success("Thanks — your host has the counts.");
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (data.amenities.length === 0) return null;

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div>
          <h2 className="text-lg font-medium">What is in the unit</h2>
          <p className="text-sm text-muted-foreground">
            Tell us how many of each item you actually found.
          </p>
        </div>
        <ul className="space-y-3">
          {data.amenities.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3">
              <span className="text-sm">
                {a.name}
                <span className="ml-2 text-muted-foreground">
                  expected {a.expectedQty}
                  {a.unit ? ` ${a.unit}` : ""}
                </span>
              </span>
              <Input
                type="number"
                min={0}
                max={999}
                className="w-24"
                value={counts[a.id] ?? ""}
                onChange={(e) => setCounts((prev) => ({ ...prev, [a.id]: e.target.value }))}
              />
            </li>
          ))}
        </ul>
        <Button
          className="w-full"
          disabled={save.isPending || data.checkedOut}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Saving…" : "Save counts"}
        </Button>
      </CardContent>
    </Card>
  );
}

const EXTENSIONS = ["jpg", "jpeg", "png", "webp"] as const;
type PhotoExtension = (typeof EXTENSIONS)[number];

function FeedbackCard({ sessionId, onSaved }: { sessionId: string; onSaved: () => void }) {
  const [rating, setRating] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [complaint, setComplaint] = useState("");
  const [photoKeys, setPhotoKeys] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 6 - photoKeys.length)) {
        const ext = (file.name.split(".").pop() ?? "").toLowerCase();
        if (!EXTENSIONS.includes(ext as PhotoExtension)) {
          toast.error("Photos must be JPG, PNG or WEBP.");
          continue;
        }
        const slot = await requestGuestPhotoUpload({
          data: { sessionId, extension: ext as PhotoExtension },
        });
        const { error } = await supabase.storage
          .from("task-photos")
          .uploadToSignedUrl(slot.path, slot.token, file);
        if (error) throw new Error(error.message);
        setPhotoKeys((prev) => [...prev, slot.key]);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Photo upload failed.");
    } finally {
      setUploading(false);
    }
  }

  const submit = useMutation({
    mutationFn: () =>
      submitGuestReport({
        data: {
          sessionId,
          overallRating: rating,
          notes: notes.trim() ? notes.trim() : null,
          complaint: complaint.trim() ? complaint.trim() : null,
          photoKeys,
        },
      }),
    onSuccess: (result) => {
      toast.success(
        result.kind === "feedback" ? "Thanks for the feedback." : "Your host has been notified.",
      );
      setRating(null);
      setNotes("");
      setComplaint("");
      setPhotoKeys([]);
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div>
          <h2 className="text-lg font-medium">How is the place?</h2>
          <p className="text-sm text-muted-foreground">
            Rate the cleanliness, or tell your host if something is wrong.
          </p>
        </div>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((star) => (
            <Button
              key={star}
              type="button"
              variant={rating === star ? "default" : "outline"}
              size="sm"
              onClick={() => setRating(star)}
            >
              {star}
            </Button>
          ))}
        </div>
        <div className="space-y-2">
          <Label htmlFor="guest-notes">Notes (optional)</Label>
          <Textarea
            id="guest-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="guest-complaint">Something wrong? (optional)</Label>
          <Textarea
            id="guest-complaint"
            value={complaint}
            onChange={(e) => setComplaint(e.target.value)}
            rows={3}
            placeholder="Describe what needs attention"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="guest-photos">Photos (up to 6)</Label>
          <Input
            id="guest-photos"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={uploading || photoKeys.length >= 6}
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
          {photoKeys.length > 0 ? (
            <p className="text-xs text-muted-foreground">{photoKeys.length} photo(s) attached</p>
          ) : null}
        </div>
        <Button
          className="w-full"
          disabled={
            submit.isPending || uploading || (rating === null && !notes.trim() && !complaint.trim())
          }
          onClick={() => submit.mutate()}
        >
          {submit.isPending ? "Sending…" : "Send to my host"}
        </Button>
      </CardContent>
    </Card>
  );
}

function CheckoutCard({
  sessionId,
  data,
  onSaved,
}: {
  sessionId: string;
  data: GuestData;
  onSaved: () => void;
}) {
  const checkout = useMutation({
    mutationFn: () => checkoutGuestSession({ data: { sessionId } }),
    onSuccess: () => {
      toast.success("Checked out. Safe travels.");
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <h2 className="text-lg font-medium">Leaving?</h2>
        <p className="text-sm text-muted-foreground">
          Let the cleaning team know the place is free.
        </p>
        <Button
          variant="outline"
          className="w-full"
          disabled={data.checkedOut || checkout.isPending}
          onClick={() => checkout.mutate()}
        >
          {data.checkedOut ? "Checked out" : checkout.isPending ? "Saving…" : "Check out"}
        </Button>
      </CardContent>
    </Card>
  );
}
