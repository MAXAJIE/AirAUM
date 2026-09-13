import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { useWorkspace, isStaff, isAdmin } from "@/hooks/useWorkspace";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listAmenities,
  listGuestProperties,
  listGuestReports,
  removeAmenity,
  resolveGuestReport,
  saveAmenity,
} from "@/lib/guests.functions";

export const Route = createFileRoute("/_authenticated/guests")({
  head: () => ({
    meta: [
      { title: "Guests | AirClean" },
      {
        name: "description",
        content:
          "Share guest stay links, set the expected items per property and work the complaint queue.",
      },
      { property: "og:title", content: "Guests | AirClean" },
      {
        property: "og:description",
        content: "Guest links, item lists and complaints in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GuestsPage,
});

function GuestsPage() {
  const { orgId, workspace } = useWorkspace();
  const staff = isStaff(workspace?.role);
  const admin = isAdmin(workspace?.role);
  const qc = useQueryClient();

  const [propertyId, setPropertyId] = useState("");
  const [statusFilter, setStatusFilter] = useState<"open" | "resolved" | "dismissed" | "all">(
    "open",
  );

  const properties = useQuery({
    queryKey: ["guest-properties", orgId],
    queryFn: () => listGuestProperties({ data: { orgId: orgId! } }),
    enabled: !!orgId && staff,
  });

  useEffect(() => {
    if (!propertyId && properties.data && properties.data.length > 0) {
      setPropertyId(properties.data[0]!.id);
    }
  }, [properties.data, propertyId]);

  const amenities = useQuery({
    queryKey: ["amenities", orgId, propertyId],
    queryFn: () => listAmenities({ data: { orgId: orgId!, propertyId } }),
    enabled: !!orgId && !!propertyId && staff,
  });

  const reports = useQuery({
    queryKey: ["guest-reports", orgId, statusFilter],
    queryFn: () => listGuestReports({ data: { orgId: orgId!, status: statusFilter } }),
    enabled: !!orgId && staff,
  });

  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [newUnit, setNewUnit] = useState("");

  const addAmenity = useMutation({
    mutationFn: () =>
      saveAmenity({
        data: {
          orgId: orgId!,
          propertyId,
          id: null,
          name: newName.trim(),
          expectedQty: Math.max(0, Number(newQty) || 0),
          unit: newUnit.trim() ? newUnit.trim() : null,
          sortOrder: (amenities.data?.length ?? 0) + 1,
        },
      }),
    onSuccess: () => {
      setNewName("");
      setNewQty("1");
      setNewUnit("");
      toast.success("Item added.");
      qc.invalidateQueries({ queryKey: ["amenities", orgId, propertyId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const dropAmenity = useMutation({
    mutationFn: (id: string) => removeAmenity({ data: { orgId: orgId!, id } }),
    onSuccess: () => {
      toast.success("Item removed.");
      qc.invalidateQueries({ queryKey: ["amenities", orgId, propertyId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const resolve = useMutation({
    mutationFn: (input: { id: string; status: "resolved" | "dismissed"; note: string }) =>
      resolveGuestReport({
        data: {
          orgId: orgId!,
          id: input.id,
          status: input.status,
          resolutionNote: input.note.trim() ? input.note.trim() : null,
        },
      }),
    onSuccess: () => {
      toast.success("Report updated.");
      qc.invalidateQueries({ queryKey: ["guest-reports", orgId, statusFilter] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!staff) {
    return (
      <AppShell title="Guests">
        <p className="text-sm text-muted-foreground">
          Only owners, managers and supervisors can manage guest stays.
        </p>
      </AppShell>
    );
  }

  const selected = properties.data?.find((p) => p.id === propertyId) ?? null;
  const guestLink =
    selected && typeof window !== "undefined"
      ? `${window.location.origin}/g/${selected.guestCode}`
      : selected
        ? `/g/${selected.guestCode}`
        : "";

  return (
    <AppShell title="Guests">
      <div className="space-y-8">
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-2">
              <Label>Property</Label>
              <Select value={propertyId} onValueChange={setPropertyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a property" />
                </SelectTrigger>
                <SelectContent>
                  {(properties.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selected ? (
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded-md bg-muted px-2 py-1 text-sm">{guestLink}</code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard.writeText(guestLink);
                    toast.success("Link copied.");
                  }}
                >
                  Copy link
                </Button>
                <span className="text-xs text-muted-foreground">
                  Guests still need the door access code to open it.
                </span>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <h2 className="text-lg font-medium">Expected items</h2>
            {amenities.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (amenities.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No items yet for this property.</p>
            ) : (
              <ul className="divide-y">
                {(amenities.data ?? []).map((a) => (
                  <li key={a.id} className="flex items-center justify-between py-2">
                    <span className="text-sm">
                      {a.name}
                      <span className="ml-2 text-muted-foreground">
                        {a.expectedQty}
                        {a.unit ? ` ${a.unit}` : ""}
                      </span>
                    </span>
                    {admin ? (
                      <Button size="sm" variant="ghost" onClick={() => dropAmenity.mutate(a.id)}>
                        Remove
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            {admin && propertyId ? (
              <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
                <Input
                  placeholder="Item, e.g. Bath towel"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <Input
                  type="number"
                  min={0}
                  placeholder="Qty"
                  value={newQty}
                  onChange={(e) => setNewQty(e.target.value)}
                />
                <Input
                  placeholder="Unit (optional)"
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                />
                <Button
                  disabled={!newName.trim() || addAmenity.isPending}
                  onClick={() => addAmenity.mutate()}
                >
                  Add
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-medium">Guest reports</h2>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="dismissed">Dismissed</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {reports.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (reports.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing here right now.</p>
            ) : (
              <ul className="space-y-4">
                {(reports.data ?? []).map((r) => (
                  <ReportRow
                    key={r.id}
                    report={r}
                    pending={resolve.isPending}
                    onResolve={(status, note) => resolve.mutate({ id: r.id, status, note })}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

type Report = Awaited<ReturnType<typeof listGuestReports>>[number];

function ReportRow({
  report,
  pending,
  onResolve,
}: {
  report: Report;
  pending: boolean;
  onResolve: (status: "resolved" | "dismissed", note: string) => void;
}) {
  const [note, setNote] = useState("");

  return (
    <li className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{report.propertyName}</span>
        <Badge variant={report.kind === "complaint" ? "destructive" : "secondary"}>
          {report.kind}
        </Badge>
        {report.rating !== null ? <Badge variant="outline">{report.rating}/5</Badge> : null}
        <span className="text-xs text-muted-foreground">
          {new Date(report.createdAt).toLocaleString()}
          {report.guestName ? ` · ${report.guestName}` : ""}
        </span>
      </div>

      {report.complaint ? <p className="mt-2 text-sm">{report.complaint}</p> : null}
      {report.notes ? <p className="mt-1 text-sm text-muted-foreground">{report.notes}</p> : null}

      {report.missingItems.length > 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Missing:{" "}
          {report.missingItems.map((m) => `${m.name} (${m.found}/${m.expected})`).join(", ")}
        </p>
      ) : null}

      {report.photos.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {report.photos.map((url) => (
            <img
              key={url}
              src={url}
              alt="Guest photo"
              className="h-24 w-24 rounded-md object-cover"
            />
          ))}
        </div>
      ) : null}

      {report.status === "open" ? (
        <div className="mt-3 space-y-2">
          <Textarea
            rows={2}
            placeholder="What did you do about it?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={pending} onClick={() => onResolve("resolved", note)}>
              Mark resolved
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => onResolve("dismissed", note)}
            >
              Dismiss
            </Button>
          </div>
        </div>
      ) : report.resolutionNote ? (
        <p className="mt-2 text-xs text-muted-foreground">Resolution: {report.resolutionNote}</p>
      ) : null}
    </li>
  );
}
