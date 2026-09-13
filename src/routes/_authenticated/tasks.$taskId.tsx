import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  getTask,
  startTask,
  toggleTaskItem,
  createPhotoUpload,
  registerPhoto,
  deletePhoto,
  submitTask,
  suggestAssignee,
  assignTaskFn,
  reviewTask,
} from "@/lib/tasks.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { taskStatusEmoji, taskStatusLabel, taskStatusTone } from "@/lib/task-display";

export const Route = createFileRoute("/_authenticated/tasks/$taskId")({
  head: () => ({
    meta: [
      { title: "Task | AirClean" },
      { name: "description", content: "Checklist, photos, quality result and assignment for a single job." },
      { property: "og:title", content: "Task | AirClean" },
      { property: "og:description", content: "Checklist, photos and quality result for a job." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TaskDetail,
});

function TaskDetail() {
  const { taskId } = Route.useParams();
  const { orgId } = useWorkspace();
  const qc = useQueryClient();
  const [room, setRoom] = useState("General");
  const [notes, setNotes] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [uploading, setUploading] = useState(false);

  const task = useQuery({
    queryKey: ["task", orgId, taskId],
    queryFn: () => getTask({ data: { orgId: orgId!, taskId } }),
    enabled: !!orgId,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["task", orgId, taskId] });
    qc.invalidateQueries({ queryKey: ["tasks", orgId] });
    qc.invalidateQueries({ queryKey: ["dashboard", orgId] });
  };

  const run = <T,>(fn: () => Promise<T>, success: string) => async () => {
    try {
      await fn();
      toast.success(success);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    }
  };

  const suggest = useMutation({
    mutationFn: () => suggestAssignee({ data: { orgId: orgId!, taskId } }),
    onError: (e: Error) => toast.error(e.message),
  });

  const assign = useMutation({
    mutationFn: (userId: string) =>
      assignTaskFn({ data: { orgId: orgId!, taskId, userId, reasonCodes: ["manager_confirmed"] } }),
    onSuccess: () => {
      toast.success("Assigned.");
      suggest.reset();
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = useMutation({
    mutationFn: () => submitTask({ data: { orgId: orgId!, taskId, notes: notes || null } }),
    onSuccess: (res) => {
      toast.success(
        res.qcStatus === "pass"
          ? "Submitted and approved."
          : "Submitted — a supervisor will take a look.",
      );
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const upload = async (file: File) => {
    if (!orgId) return;
    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
    const extension = (["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "jpg") as
      | "jpg"
      | "jpeg"
      | "png"
      | "webp";
    setUploading(true);
    try {
      const prepared = await createPhotoUpload({ data: { orgId, taskId, extension } });
      const { error } = await supabase.storage
        .from("task-photos")
        .uploadToSignedUrl(prepared.path, prepared.token, file);
      if (error) throw new Error(error.message);
      await registerPhoto({
        data: {
          orgId,
          taskId,
          storageKey: prepared.key,
          room: room || "General",
          photoType: "after",
          taskItemId: null,
        },
      });
      toast.success("Photo added.");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not upload that photo.");
    } finally {
      setUploading(false);
    }
  };

  const t = task.data;
  const itemsDone = t ? t.items.filter((i) => i.done).length : 0;
  const itemsTotal = t ? t.items.length : 0;
  const checklistPercent = itemsTotal ? Math.round((itemsDone / itemsTotal) * 100) : 0;

  return (
    <AppShell title="Task">
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/tasks">← All tasks</Link>
        </Button>

        {task.isLoading && <Skeleton className="h-64 w-full" />}
        {task.error && (
          <Card>
            <CardContent className="p-6 text-sm text-destructive">
              {(task.error as Error).message}
            </CardContent>
          </Card>
        )}

        {t && (
          <>
            <Card>
              <CardContent className="space-y-2 p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-xl font-semibold">{t.title}</h2>
                  <Badge variant={taskStatusTone(t.status)}>
                    {taskStatusEmoji(t.status)} {taskStatusLabel(t.status)}
                  </Badge>
                  {t.qcScore !== null && (
                    <Badge variant="secondary">Quality {Math.round(t.qcScore * 100)}%</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {t.property.name}
                  {t.property.unitLabel ? ` · ${t.property.unitLabel}` : ""} · due{" "}
                  {new Date(t.dueAt).toLocaleString()}
                </p>
                {t.property.address && (
                  <p className="text-sm">
                    Address: {t.property.address}
                    {t.property.accessCode ? ` · code ${t.property.accessCode}` : ""}
                  </p>
                )}
                {t.property.notes && <p className="text-sm text-muted-foreground">{t.property.notes}</p>}
                {t.assigneeName && <p className="text-sm">Assigned to {t.assigneeName}</p>}
                {t.qcSummary && (
                  <p className="rounded-lg bg-muted/50 p-3 text-sm">Review notes: {t.qcSummary}</p>
                )}

                <div className="flex flex-wrap gap-2 pt-2">
                  {t.isAssignee && t.status === "assigned" && (
                    <Button onClick={run(() => startTask({ data: { orgId: orgId!, taskId } }), "Started.")}>
                      Start work
                    </Button>
                  )}
                  {t.canEdit && !t.assignedTo && (
                    <Button variant="outline" onClick={() => suggest.mutate()} disabled={suggest.isPending}>
                      {suggest.isPending ? "Checking who is free…" : "Find someone for this job"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {suggest.data && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">🤝 Who can take this</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {suggest.data.aiError && (
                    <p className="text-sm text-muted-foreground">{suggest.data.aiError}</p>
                  )}
                  {suggest.data.summary && <p className="text-sm">{suggest.data.summary}</p>}
                  {suggest.data.candidates.map((c) => {
                    const rank = suggest.data.ranked.find((r) => r.userId === c.userId);
                    return (
                      <div key={c.userId} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
                        <div className="min-w-40 flex-1">
                          <p className="font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Quality {c.qualityScore.toFixed(2)} · {c.loadThatDay}/{c.maxDailyTasks} jobs that
                            day · cleaned here {c.familiarity}×{c.sameCity ? " · same city" : ""}
                          </p>
                          {rank?.reasons.length ? (
                            <p className="text-xs text-muted-foreground">{rank.reasons.join(" · ")}</p>
                          ) : null}
                        </div>
                        {rank && <Badge variant="secondary">Suggested #{rank.rank}</Badge>}
                        <Button size="sm" onClick={() => assign.mutate(c.userId)} disabled={assign.isPending}>
                          Assign
                        </Button>
                      </div>
                    );
                  })}
                  {suggest.data.rejected.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Not eligible:{" "}
                      {suggest.data.rejected.map((r) => r.reason.replace(/_/g, " ")).join(", ")}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  <span>🧽 Checklist</span>
                  {itemsTotal > 0 && (
                    <span className="text-sm font-normal text-muted-foreground">
                      {itemsDone}/{itemsTotal} done
                    </span>
                  )}
                  {itemsTotal > 0 && checklistPercent === 100 && (
                    <span className="animate-pop text-sm">🎉</span>
                  )}
                </CardTitle>
                {itemsTotal > 0 && (
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-700"
                      style={{ width: `${checklistPercent}%` }}
                    />
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-2">
                {t.items.length === 0 && (
                  <p className="text-sm text-muted-foreground">No checklist on this job.</p>
                )}
                {t.items.map((i) => (
                  <label key={i.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm">
                    <Checkbox
                      checked={i.done}
                      disabled={!t.isAssignee}
                      onCheckedChange={(v) =>
                        run(
                          () => toggleTaskItem({ data: { orgId: orgId!, itemId: i.id, done: v === true } }),
                          "Saved.",
                        )()
                      }
                    />
                    <span className={i.done ? "text-muted-foreground line-through" : ""}>
                      {i.room} — {i.label}
                    </span>
                    {i.requiresPhoto && <Badge variant="outline">photo</Badge>}
                  </label>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  📸 Photos{t.photos.length > 0 ? ` (${t.photos.length})` : ""}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {t.isAssignee && (
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="room">Room</Label>
                      <Input id="room" value={room} onChange={(e) => setRoom(e.target.value)} className="w-40" />
                    </div>
                    <Label
                      htmlFor="photo"
                      className="cursor-pointer rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
                    >
                      {uploading ? "Uploading…" : "Add photo"}
                    </Label>
                    <input
                      id="photo"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) await upload(file);
                      }}
                    />
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-3">
                  {t.photos.map((p) => (
                    <div key={p.id} className="space-y-1">
                      {p.url && (
                        <img
                          src={p.url}
                          alt={`${p.room} photo`}
                          loading="lazy"
                          className="h-36 w-full rounded-lg border border-border object-cover"
                        />
                      )}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{p.room}</span>
                        {t.isAssignee && ["assigned", "in_progress", "needs_review"].includes(t.status) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="ml-auto h-6 px-2"
                            onClick={run(
                              () => deletePhoto({ data: { orgId: orgId!, photoId: p.id } }),
                              "Photo removed.",
                            )}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  {t.photos.length === 0 && (
                    <p className="text-sm text-muted-foreground">No photos yet. 📷</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {t.isAssignee && ["assigned", "in_progress", "needs_review"].includes(t.status) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">🏁 Finish up</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Textarea
                    placeholder="Anything the manager should know?"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                  <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
                    {submit.isPending ? "Checking your photos…" : "Submit for checking"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {t.canEdit && ["submitted", "needs_review"].includes(t.status) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">🔎 Review</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Textarea
                    placeholder="Note for the cleaner (optional)"
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={run(
                        () =>
                          reviewTask({
                            data: { orgId: orgId!, taskId, decision: "approve", note: reviewNote || null },
                          }),
                        "Approved.",
                      )}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      onClick={run(
                        () =>
                          reviewTask({
                            data: { orgId: orgId!, taskId, decision: "reject", note: reviewNote || null },
                          }),
                        "Sent back for another pass.",
                      )}
                    >
                      Send back
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
