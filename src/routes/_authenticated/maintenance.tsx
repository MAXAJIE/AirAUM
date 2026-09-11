import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { useWorkspace, isStaff } from "@/hooks/useWorkspace";
import { listMaintenance, reportMaintenance, updateMaintenance } from "@/lib/maintenance.functions";
import { listProperties } from "@/lib/properties.functions";
import { listMembers } from "@/lib/org.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/maintenance")({
  head: () => ({
    meta: [
      { title: "Maintenance | AirClean" },
      { name: "description", content: "Report property issues with a photo, triage them by severity and track repairs." },
      { property: "og:title", content: "Maintenance | AirClean" },
      { property: "og:description", content: "Report, triage and track property repairs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MaintenancePage,
});

const SEVERITY_TONE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  low: "outline",
  medium: "secondary",
  high: "default",
  critical: "destructive",
};

function MaintenancePage() {
  const { orgId, workspace } = useWorkspace();
  const staff = isStaff(workspace?.role);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [propertyId, setPropertyId] = useState("");
  const [description, setDescription] = useState("");

  const list = useQuery({
    queryKey: ["maintenance", orgId],
    queryFn: () => listMaintenance({ data: { orgId: orgId! } }),
    enabled: !!orgId,
  });
  const properties = useQuery({
    queryKey: ["properties", orgId],
    queryFn: () => listProperties({ data: { orgId: orgId! } }),
    enabled: !!orgId,
  });
  const members = useQuery({
    queryKey: ["members", orgId],
    queryFn: () => listMembers({ data: { orgId: orgId! } }),
    enabled: !!orgId && staff,
  });

  const report = useMutation({
    mutationFn: () =>
      reportMaintenance({
        data: { orgId: orgId!, propertyId, taskId: null, description, photoKey: null },
      }),
    onSuccess: () => {
      toast.success("Issue reported.");
      setOpen(false);
      setDescription("");
      qc.invalidateQueries({ queryKey: ["maintenance", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: (input: {
      id: string;
      status: "open" | "triaged" | "assigned" | "resolved" | "dismissed";
      severity: "low" | "medium" | "high" | "critical" | null;
      category: string | null;
      assignedTo: string | null;
    }) => updateMaintenance({ data: { orgId: orgId!, ...input } }),
    onSuccess: () => {
      toast.success("Request updated.");
      qc.invalidateQueries({ queryKey: ["maintenance", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assignable = (members.data ?? []).filter((m) => m.status === "active");

  return (
    <AppShell title="Maintenance">
      <div className="space-y-4">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button disabled={!(properties.data ?? []).length}>Report an issue</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Report an issue</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
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
              <div className="space-y-2">
                <Label htmlFor="m-desc">What is wrong?</Label>
                <Textarea
                  id="m-desc"
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Shower mixer drips constantly in the main bathroom."
                />
              </div>
              <Button
                onClick={() => report.mutate()}
                disabled={report.isPending || !propertyId || description.trim().length < 5}
              >
                Send report
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {list.isLoading && <Skeleton className="h-40 w-full" />}

        {!list.isLoading && (list.data ?? []).length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No maintenance requests. That is a good sign.
            </CardContent>
          </Card>
        )}

        <div className="grid gap-3">
          {(list.data ?? []).map((r) => (
            <Card key={r.id}>
              <CardContent className="space-y-3 p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{r.propertyName}</p>
                  {r.severity && <Badge variant={SEVERITY_TONE[r.severity] ?? "outline"}>{r.severity}</Badge>}
                  <Badge variant="outline">{r.status}</Badge>
                  {r.requiresHumanReview && <Badge variant="destructive">Needs a person</Badge>}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm">{r.description}</p>
                {r.aiSummary && (
                  <p className="text-sm text-muted-foreground">
                    Suggested: {r.aiSummary}
                    {r.aiConfidence !== null && ` (${Math.round(r.aiConfidence * 100)}% confidence)`}
                  </p>
                )}
                {r.photoUrl && (
                  <img
                    src={r.photoUrl}
                    alt="Reported issue"
                    className="max-h-56 rounded-lg border border-border object-cover"
                    loading="lazy"
                  />
                )}

                {r.canEdit && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Select
                      value={r.status}
                      onValueChange={(v) =>
                        update.mutate({
                          id: r.id,
                          status: v as "open" | "triaged" | "assigned" | "resolved" | "dismissed",
                          severity: (r.severity as "low" | "medium" | "high" | "critical" | null) ?? null,
                          category: r.category,
                          assignedTo: r.assignedTo,
                        })
                      }
                    >
                      <SelectTrigger className="w-40" aria-label="Status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["open", "triaged", "assigned", "resolved", "dismissed"].map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={r.assignedTo ?? "none"}
                      onValueChange={(v) =>
                        update.mutate({
                          id: r.id,
                          status: r.status === "open" ? "assigned" : (r.status as "triaged"),
                          severity: (r.severity as "low" | "medium" | "high" | "critical" | null) ?? null,
                          category: r.category,
                          assignedTo: v === "none" ? null : v,
                        })
                      }
                    >
                      <SelectTrigger className="w-48" aria-label="Assign to">
                        <SelectValue placeholder="Assign to" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nobody</SelectItem>
                        {assignable.map((m) => (
                          <SelectItem key={m.userId} value={m.userId}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
