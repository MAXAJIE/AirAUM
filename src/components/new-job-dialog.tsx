import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { createAdhocTask } from "@/lib/tasks.functions";
import { listProperties } from "@/lib/properties.functions";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type JobType = "turnover_clean" | "deep_clean" | "inspection" | "maintenance" | "restock";

/**
 * Presets exist so an owner can raise a job in two clicks. "deep_clean" is the
 * one for rooms that sat empty for a while and need a full refresh.
 */
const PRESETS: { type: JobType; emoji: string; label: string; title: string; minutes: number }[] = [
  {
    type: "deep_clean",
    emoji: "✨",
    label: "Deep clean (room left empty)",
    title: "Deep clean",
    minutes: 240,
  },
  {
    type: "turnover_clean",
    emoji: "🧹",
    label: "Turnover clean",
    title: "Turnover clean",
    minutes: 120,
  },
  {
    type: "inspection",
    emoji: "🔎",
    label: "Inspection walk-through",
    title: "Inspection",
    minutes: 60,
  },
  {
    type: "maintenance",
    emoji: "🔧",
    label: "Maintenance visit",
    title: "Maintenance visit",
    minutes: 120,
  },
  {
    type: "restock",
    emoji: "🧴",
    label: "Restock supplies",
    title: "Restock supplies",
    minutes: 60,
  },
];

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultStart() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return toLocalInput(d);
}

function addMinutes(localValue: string, minutes: number) {
  const d = new Date(localValue);
  if (Number.isNaN(d.getTime())) return localValue;
  d.setMinutes(d.getMinutes() + minutes);
  return toLocalInput(d);
}

export function NewJobDialog({ propertyId: fixedPropertyId }: { propertyId?: string }) {
  const { orgId } = useWorkspace();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [propertyId, setPropertyId] = useState(fixedPropertyId ?? "");
  const [type, setType] = useState<JobType>("deep_clean");
  const [title, setTitle] = useState("");
  const [start, setStart] = useState(defaultStart);
  const [due, setDue] = useState(() => addMinutes(defaultStart(), 240));
  const [notes, setNotes] = useState("");

  const properties = useQuery({
    queryKey: ["properties", orgId],
    queryFn: () => listProperties({ data: { orgId: orgId! } }),
    enabled: !!orgId && open,
  });

  const activeProperties = useMemo(
    () => (properties.data ?? []).filter((p) => p.active || p.id === propertyId),
    [properties.data, propertyId],
  );
  const preset = PRESETS.find((p) => p.type === type)!;
  const property = activeProperties.find((p) => p.id === propertyId);
  const finalTitle = title.trim() || `${preset.title}${property ? ` — ${property.name}` : ""}`;

  function pickType(next: JobType) {
    setType(next);
    const nextPreset = PRESETS.find((p) => p.type === next)!;
    setDue(addMinutes(start, nextPreset.minutes));
  }

  const create = useMutation({
    mutationFn: () =>
      createAdhocTask({
        data: {
          orgId: orgId!,
          propertyId,
          type,
          title: finalTitle,
          scheduledStart: start,
          dueAt: due,
          notes: notes.trim() ? notes.trim() : null,
        },
      }),
    onSuccess: (res) => {
      toast.success("🎉 Job created — now pick who does it.");
      setOpen(false);
      setTitle("");
      setNotes("");
      qc.invalidateQueries({ queryKey: ["tasks", orgId] });
      qc.invalidateQueries({ queryKey: ["dashboard", orgId] });
      navigate({ to: "/tasks/$taskId", params: { taskId: res.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const invalid = !propertyId || new Date(due) <= new Date(start);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="animate-pop">
          ➕ New job
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>🧽 Create a job</DialogTitle>
          <DialogDescription>
            Raise cleaning or upkeep work yourself — handy for a room that has been empty a while.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="job-property">🏠 Place</Label>
            <Select value={propertyId} onValueChange={setPropertyId} disabled={!!fixedPropertyId}>
              <SelectTrigger id="job-property">
                <SelectValue placeholder={properties.isLoading ? "Loading…" : "Choose a place"} />
              </SelectTrigger>
              <SelectContent>
                {activeProperties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.unitLabel ? ` · ${p.unitLabel}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>🧰 What kind of work</Label>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Button
                  key={p.type}
                  type="button"
                  size="sm"
                  variant={p.type === type ? "default" : "outline"}
                  className="hover-lift"
                  onClick={() => pickType(p.type)}
                >
                  {p.emoji} {p.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="job-title">🏷️ Title</Label>
            <Input
              id="job-title"
              value={title}
              placeholder={finalTitle}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="job-start">🕒 Starts</Label>
              <Input
                id="job-start"
                type="datetime-local"
                value={start}
                onChange={(e) => {
                  setStart(e.target.value);
                  setDue(addMinutes(e.target.value, preset.minutes));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="job-due">⏰ Finish by</Label>
              <Input
                id="job-due"
                type="datetime-local"
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="job-notes">📝 Notes for the cleaner (optional)</Label>
            <Textarea
              id="job-notes"
              rows={3}
              value={notes}
              placeholder="e.g. Room has been closed for 3 weeks — air it out and run the taps."
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {new Date(due) <= new Date(start) && (
            <p className="text-sm text-destructive">
              ⚠️ The deadline has to be after the start time.
            </p>
          )}

          <Button
            className="w-full"
            disabled={invalid || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Creating…" : "✅ Create job"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
