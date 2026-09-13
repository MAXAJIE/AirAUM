import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { useWorkspace, isAdmin } from "@/hooks/useWorkspace";
import {
  listProperties,
  saveProperty,
  deleteProperty,
  type PropertyRow,
} from "@/lib/properties.functions";
import { NewJobDialog } from "@/components/new-job-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/properties")({
  head: () => ({
    meta: [
      { title: "Properties | AirClean" },
      {
        name: "description",
        content: "Your units, turnaround times, access codes and cleaning notes.",
      },
      { property: "og:title", content: "Properties | AirClean" },
      { property: "og:description", content: "Units, turnaround times and access details." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PropertiesPage,
});

const EMPTY: PropertyRow = {
  id: "",
  name: "",
  unitLabel: null,
  city: null,
  address: null,
  accessCode: null,
  bedrooms: 1,
  bathrooms: 1,
  notes: null,
  turnoverMinutes: 120,
  active: true,
  complaintStarThreshold: null,
  reviewCode: "",
};

function PropertiesPage() {
  const { orgId, workspace } = useWorkspace();
  const admin = isAdmin(workspace?.role);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<PropertyRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["properties", orgId],
    queryFn: () => listProperties({ data: { orgId: orgId! } }),
    enabled: !!orgId,
  });

  const save = useMutation({
    mutationFn: (p: PropertyRow) =>
      saveProperty({
        data: {
          orgId: orgId!,
          ...(p.id ? { id: p.id } : {}),
          name: p.name,
          unitLabel: p.unitLabel,
          city: p.city,
          address: p.address,
          accessCode: p.accessCode,
          bedrooms: p.bedrooms,
          bathrooms: p.bathrooms,
          notes: p.notes,
          turnoverMinutes: p.turnoverMinutes,
          active: p.active,
          complaintStarThreshold: p.complaintStarThreshold,
        },
      }),
    onSuccess: () => {
      toast.success("Property saved.");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["properties", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archive = useMutation({
    mutationFn: (id: string) => deleteProperty({ data: { orgId: orgId!, id } }),
    onSuccess: () => {
      toast.success("Property archived.");
      qc.invalidateQueries({ queryKey: ["properties", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = <K extends keyof PropertyRow>(key: K, value: PropertyRow[K]) =>
    setEditing((p) => (p ? { ...p, [key]: value } : p));

  return (
    <AppShell title="Properties">
      <div className="space-y-4">
        {admin && <Button onClick={() => setEditing({ ...EMPTY })}>Add property</Button>}

        {isLoading && <Skeleton className="h-40 w-full" />}

        {!isLoading && (data ?? []).length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No properties yet. Add your first unit to start scheduling turnovers.
            </CardContent>
          </Card>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          {(data ?? []).map((p) => (
            <Card key={p.id}>
              <CardContent className="space-y-2 p-5">
                <div className="flex items-center gap-2">
                  <p className="font-medium">
                    {p.name}
                    {p.unitLabel ? ` · ${p.unitLabel}` : ""}
                  </p>
                  {!p.active && <Badge variant="secondary">Archived</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">
                  {p.city ?? "No city"} · {p.bedrooms} bed · {p.bathrooms} bath ·{" "}
                  {p.turnoverMinutes} min turnaround
                </p>
                {p.address && <p className="text-sm text-muted-foreground">{p.address}</p>}
                {p.accessCode && (
                  <p className="text-sm text-muted-foreground">Access code: {p.accessCode}</p>
                )}
                {admin && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {p.active && <NewJobDialog propertyId={p.id} />}
                    <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                      Edit
                    </Button>
                    {p.active && (
                      <Button size="sm" variant="ghost" onClick={() => archive.mutate(p.id)}>
                        Archive
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing?.id ? "Edit property" : "New property"}</DialogTitle>
            </DialogHeader>
            {editing && (
              <div className="grid gap-3">
                <div className="space-y-2">
                  <Label htmlFor="p-name">Name</Label>
                  <Input
                    id="p-name"
                    value={editing.name}
                    onChange={(e) => set("name", e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="p-unit">Unit label</Label>
                    <Input
                      id="p-unit"
                      value={editing.unitLabel ?? ""}
                      onChange={(e) => set("unitLabel", e.target.value || null)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="p-city">City</Label>
                    <Input
                      id="p-city"
                      value={editing.city ?? ""}
                      onChange={(e) => set("city", e.target.value || null)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="p-bed">Bedrooms</Label>
                    <Input
                      id="p-bed"
                      type="number"
                      min={0}
                      value={editing.bedrooms}
                      onChange={(e) => set("bedrooms", Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="p-bath">Bathrooms</Label>
                    <Input
                      id="p-bath"
                      type="number"
                      min={0}
                      value={editing.bathrooms}
                      onChange={(e) => set("bathrooms", Number(e.target.value))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-addr">Address (stored encrypted)</Label>
                  <Input
                    id="p-addr"
                    value={editing.address ?? ""}
                    onChange={(e) => set("address", e.target.value || null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-code">Access code (stored encrypted)</Label>
                  <Input
                    id="p-code"
                    value={editing.accessCode ?? ""}
                    onChange={(e) => set("accessCode", e.target.value || null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-turn">Turnaround minutes</Label>
                  <Input
                    id="p-turn"
                    type="number"
                    min={15}
                    max={1440}
                    value={editing.turnoverMinutes}
                    onChange={(e) => set("turnoverMinutes", Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-threshold">Complaint threshold (stars)</Label>
                  <Input
                    id="p-threshold"
                    type="number"
                    min={1}
                    max={5}
                    placeholder="Workspace default"
                    value={editing.complaintStarThreshold ?? ""}
                    onChange={(e) =>
                      set(
                        "complaintStarThreshold",
                        e.target.value ? Math.min(5, Math.max(1, Number(e.target.value))) : null,
                      )
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Guest feedback below this many stars is raised as a complaint. Leave empty to
                    use the workspace default.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-notes">Cleaning notes</Label>
                  <Textarea
                    id="p-notes"
                    value={editing.notes ?? ""}
                    onChange={(e) => set("notes", e.target.value || null)}
                  />
                </div>
                <Button
                  onClick={() => save.mutate(editing)}
                  disabled={save.isPending || !editing.name}
                >
                  Save property
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
