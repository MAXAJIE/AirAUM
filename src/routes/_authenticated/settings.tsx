import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { useWorkspace, isAdmin } from "@/hooks/useWorkspace";
import { ThemePanel } from "@/components/theme-panel";
import { updateProfile, updateWorkspaceSettings } from "@/lib/org.functions";
import { listBackups, createBackup, getBackupDownload, exportCsv } from "@/lib/backup.functions";
import { listAuditLog, listAiDecisions } from "@/lib/dashboard.functions";
import { notificationHealth } from "@/lib/notifications.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings | AirClean" },
      { name: "description", content: "Appearance, your details, workspace rules, exports, backups and the activity trail." },
      { property: "og:title", content: "Settings | AirClean" },
      { property: "og:description", content: "Appearance, workspace rules, exports and backups." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function SettingsPage() {
  const { orgId, workspace, session, refetch } = useWorkspace();
  const admin = isAdmin(workspace?.role);
  const qc = useQueryClient();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [ws, setWs] = useState({ name: "", timezone: "UTC", currency: "EUR", auto: 0.85, review: 0.6 });

  useEffect(() => {
    if (session) {
      setFullName(session.fullName ?? "");
      setPhone(session.phone ?? "");
    }
  }, [session]);

  useEffect(() => {
    if (workspace) {
      setWs({
        name: workspace.name,
        timezone: workspace.timezone,
        currency: workspace.currency,
        auto: workspace.qcAutoThreshold,
        review: workspace.qcReviewThreshold,
      });
    }
  }, [workspace]);

  const saveProfile = useMutation({
    mutationFn: () => updateProfile({ data: { fullName, phone: phone || null } }),
    onSuccess: async () => {
      toast.success("Your details are saved.");
      await refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveWs = useMutation({
    mutationFn: () =>
      updateWorkspaceSettings({
        data: {
          orgId: orgId!,
          name: ws.name,
          timezone: ws.timezone,
          currency: ws.currency.toUpperCase(),
          qcAutoThreshold: ws.auto,
          qcReviewThreshold: ws.review,
        },
      }),
    onSuccess: async () => {
      toast.success("Workspace settings saved.");
      await refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const backups = useQuery({
    queryKey: ["backups", orgId],
    queryFn: () => listBackups({ data: { orgId: orgId! } }),
    enabled: !!orgId && admin,
  });
  const audit = useQuery({
    queryKey: ["audit", orgId],
    queryFn: () => listAuditLog({ data: { orgId: orgId! } }),
    enabled: !!orgId && admin,
  });
  const decisions = useQuery({
    queryKey: ["ai-decisions", orgId],
    queryFn: () => listAiDecisions({ data: { orgId: orgId! } }),
    enabled: !!orgId && admin,
  });
  const health = useQuery({
    queryKey: ["notify-health", orgId],
    queryFn: () => notificationHealth({ data: { orgId: orgId! } }),
    enabled: !!orgId && admin,
  });

  const backupNow = useMutation({
    mutationFn: () => createBackup({ data: { orgId: orgId! } }),
    onSuccess: () => {
      toast.success("Backup created.");
      qc.invalidateQueries({ queryKey: ["backups", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportSet = useMutation({
    mutationFn: (dataset: "tasks" | "bookings" | "maintenance") =>
      exportCsv({ data: { orgId: orgId!, dataset } }),
    onSuccess: (res) => download(res.filename, res.csv),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Settings">
      <Tabs defaultValue="appearance">
        <TabsList className="mb-4 flex flex-wrap">
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="profile">Your details</TabsTrigger>
          {admin && <TabsTrigger value="workspace">Workspace</TabsTrigger>}
          {admin && <TabsTrigger value="data">Data & backups</TabsTrigger>}
          {admin && <TabsTrigger value="activity">Activity</TabsTrigger>}
        </TabsList>

        <TabsContent value="appearance">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Make it yours</CardTitle>
              <CardDescription>Saved in this browser, for you only.</CardDescription>
            </CardHeader>
            <CardContent>
              <ThemePanel />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your details</CardTitle>
              <CardDescription>Your phone number is stored encrypted.</CardDescription>
            </CardHeader>
            <CardContent className="grid max-w-md gap-3">
              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone (for WhatsApp alerts)</Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <Button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending}>
                Save
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {admin && (
          <TabsContent value="workspace">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Workspace</CardTitle>
                <CardDescription>
                  Photo checks above the auto-approve level pass on their own. Anything below the review
                  level always goes to a person.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid max-w-md gap-3">
                <div className="space-y-2">
                  <Label htmlFor="ws-name">Name</Label>
                  <Input id="ws-name" value={ws.name} onChange={(e) => setWs({ ...ws, name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ws-tz">Time zone</Label>
                  <Input id="ws-tz" value={ws.timezone} onChange={(e) => setWs({ ...ws, timezone: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ws-cur">Currency</Label>
                  <Input
                    id="ws-cur"
                    maxLength={3}
                    value={ws.currency}
                    onChange={(e) => setWs({ ...ws, currency: e.target.value.toUpperCase() })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="ws-auto">Auto-approve level</Label>
                    <Input
                      id="ws-auto"
                      type="number"
                      step="0.05"
                      min={0.5}
                      max={1}
                      value={ws.auto}
                      onChange={(e) => setWs({ ...ws, auto: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ws-review">Review level</Label>
                    <Input
                      id="ws-review"
                      type="number"
                      step="0.05"
                      min={0}
                      max={1}
                      value={ws.review}
                      onChange={(e) => setWs({ ...ws, review: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <Button onClick={() => saveWs.mutate()} disabled={saveWs.isPending}>
                  Save workspace
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {admin && (
          <TabsContent value="data" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Exports</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {(["tasks", "bookings", "maintenance"] as const).map((d) => (
                  <Button key={d} variant="outline" size="sm" onClick={() => exportSet.mutate(d)}>
                    Download {d} CSV
                  </Button>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Backups</CardTitle>
                <CardDescription>
                  A full copy of your workspace data, kept in private storage. Runs nightly and on demand.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button onClick={() => backupNow.mutate()} disabled={backupNow.isPending}>
                  {backupNow.isPending ? "Backing up…" : "Back up now"}
                </Button>
                <div className="divide-y divide-border">
                  {(backups.data ?? []).map((b) => (
                    <div key={b.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                      <span>{new Date(b.createdAt).toLocaleString()}</span>
                      <Badge variant={b.status === "completed" ? "secondary" : "destructive"}>{b.status}</Badge>
                      <span className="text-muted-foreground">{b.triggeredBy}</span>
                      {b.sizeBytes && (
                        <span className="text-muted-foreground">{Math.round(b.sizeBytes / 1024)} KB</span>
                      )}
                      {b.downloadable && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="ml-auto"
                          onClick={async () => {
                            try {
                              const res = await getBackupDownload({
                                data: { orgId: orgId!, backupId: b.id },
                              });
                              window.open(res.url, "_blank", "noopener");
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Download failed.");
                            }
                          }}
                        >
                          Download
                        </Button>
                      )}
                    </div>
                  ))}
                  {(backups.data ?? []).length === 0 && (
                    <p className="py-3 text-sm text-muted-foreground">No backups yet.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {health.data && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Message delivery</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <pre className="whitespace-pre-wrap">{JSON.stringify(health.data, null, 2)}</pre>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}

        {admin && (
          <TabsContent value="activity" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Activity trail</CardTitle>
              </CardHeader>
              <CardContent className="divide-y divide-border p-0">
                {(audit.data ?? []).map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center gap-2 px-6 py-3 text-sm">
                    <span className="font-medium">{a.action.replace(/[._]/g, " ")}</span>
                    <span className="text-muted-foreground">{a.entityType}</span>
                    <span className="text-muted-foreground">by {a.actor}</span>
                    {a.reasonCodes?.length > 0 && (
                      <span className="text-xs text-muted-foreground">{a.reasonCodes.join(", ")}</span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {new Date(a.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
                {(audit.data ?? []).length === 0 && (
                  <p className="p-6 text-sm text-muted-foreground">Nothing recorded yet.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Automated checks</CardTitle>
                <CardDescription>Every automated judgement, with its confidence and outcome.</CardDescription>
              </CardHeader>
              <CardContent className="divide-y divide-border p-0">
                {(decisions.data ?? []).map((d) => (
                  <div key={d.id} className="flex flex-wrap items-center gap-2 px-6 py-3 text-sm">
                    <span className="font-medium">{d.kind.replace(/_/g, " ")}</span>
                    {d.confidence !== null && (
                      <Badge variant="secondary">{Math.round(d.confidence * 100)}%</Badge>
                    )}
                    {d.requiresHumanReview && <Badge variant="outline">person reviewed</Badge>}
                    {d.error && <span className="text-destructive">{d.error}</span>}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {new Date(d.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
                {(decisions.data ?? []).length === 0 && (
                  <p className="p-6 text-sm text-muted-foreground">No automated checks yet.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </AppShell>
  );
}
