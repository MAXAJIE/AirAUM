import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { useWorkspace, isAdmin, ROLE_LABEL } from "@/hooks/useWorkspace";
import { listMembers, setMemberStatus, updateCleanerProfile } from "@/lib/org.functions";
import { createInviteCode, listInviteCodes, revokeInviteCode } from "@/lib/invites.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Ticket, Trash2 } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({
    meta: [
      { title: "Team | AirClean" },
      { name: "description", content: "Approve people who ask to join, set roles and manage cleaner availability." },
      { property: "og:title", content: "Team | AirClean" },
      { property: "og:description", content: "Approvals, roles and cleaner settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TeamPage,
});

const ROLES = ["owner", "manager", "supervisor", "cleaner", "technician"] as const;

function TeamPage() {
  const { orgId, workspace } = useWorkspace();
  const admin = isAdmin(workspace?.role);
  const qc = useQueryClient();

  const members = useQuery({
    queryKey: ["members", orgId],
    queryFn: () => listMembers({ data: { orgId: orgId! } }),
    enabled: !!orgId,
  });

  const mutate = useMutation({
    mutationFn: (input: { memberId: string; status?: "active" | "suspended"; role?: (typeof ROLES)[number] }) =>
      setMemberStatus({ data: { orgId: orgId!, ...input } }),
    onSuccess: () => {
      toast.success("Team updated.");
      qc.invalidateQueries({ queryKey: ["members", orgId] });
      qc.invalidateQueries({ queryKey: ["dashboard", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cleaner = useMutation({
    mutationFn: (input: {
      userId: string;
      baseCity: string | null;
      skills: string[];
      maxDailyTasks: number;
      active: boolean;
    }) => updateCleanerProfile({ data: { orgId: orgId!, ...input } }),
    onSuccess: () => {
      toast.success("Cleaner settings saved.");
      qc.invalidateQueries({ queryKey: ["members", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pending = (members.data ?? []).filter((m) => m.status === "pending");
  const rest = (members.data ?? []).filter((m) => m.status !== "pending");

  return (
    <AppShell title="Team">
      <div className="space-y-6">
        <InviteCodes orgId={orgId} admin={admin} slug={workspace?.slug} />

        {members.isLoading && <Skeleton className="h-40 w-full" />}

        {pending.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Waiting for approval</CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-border p-0">
              {pending.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center gap-3 px-6 py-4">
                  <div className="flex-1">
                    <p className="font-medium">{m.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {m.email} · asked to join as {ROLE_LABEL[m.role] ?? m.role}
                    </p>
                  </div>
                  {admin && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => mutate.mutate({ memberId: m.id, status: "active" })}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => mutate.mutate({ memberId: m.id, status: "suspended" })}
                      >
                        Decline
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Members</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border p-0">
            {rest.map((m) => (
              <div key={m.id} className="space-y-3 px-6 py-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-40 flex-1">
                    <p className="font-medium">{m.name}</p>
                    <p className="text-sm text-muted-foreground">{m.email}</p>
                  </div>
                  <Badge variant={m.status === "active" ? "secondary" : "outline"}>{m.status}</Badge>
                  {admin ? (
                    <Select
                      value={m.role}
                      onValueChange={(v) => mutate.mutate({ memberId: m.id, role: v as (typeof ROLES)[number] })}
                    >
                      <SelectTrigger className="w-40" aria-label="Role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline">{ROLE_LABEL[m.role] ?? m.role}</Badge>
                  )}
                  {admin && m.status === "active" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => mutate.mutate({ memberId: m.id, status: "suspended" })}
                    >
                      Suspend
                    </Button>
                  )}
                  {admin && m.status === "suspended" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => mutate.mutate({ memberId: m.id, status: "active" })}
                    >
                      Restore
                    </Button>
                  )}
                </div>

                {admin && m.cleaner && (
                  <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/40 p-3 text-sm">
                    <span className="text-muted-foreground">
                      Quality {Number(m.cleaner.quality_score).toFixed(2)} · reliability{" "}
                      {Number(m.cleaner.reliability).toFixed(2)} · {m.cleaner.tasks_completed} jobs done
                    </span>
                    <label className="ml-auto flex items-center gap-2">
                      Max jobs per day
                      <Select
                        value={String(m.cleaner.max_daily_tasks)}
                        onValueChange={(v) =>
                          cleaner.mutate({
                            userId: m.userId,
                            baseCity: m.cleaner?.base_city ?? null,
                            skills: m.cleaner?.skills ?? [],
                            maxDailyTasks: Number(v),
                            active: m.cleaner?.active ?? true,
                          })
                        }
                      >
                        <SelectTrigger className="w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                            <SelectItem key={n} value={String(n)}>
                              {n}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                    <Button
                      size="sm"
                      variant={m.cleaner.active ? "ghost" : "outline"}
                      onClick={() =>
                        cleaner.mutate({
                          userId: m.userId,
                          baseCity: m.cleaner?.base_city ?? null,
                          skills: m.cleaner?.skills ?? [],
                          maxDailyTasks: m.cleaner?.max_daily_tasks ?? 3,
                          active: !(m.cleaner?.active ?? true),
                        })
                      }
                    >
                      {m.cleaner.active ? "Mark unavailable" : "Mark available"}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}


/**
 * Invitation codes.
 *
 * A code carries its role, so anyone who enters it joins straight away — the
 * older workspace-code route still exists and keeps its approval step.
 */
function InviteCodes({
  orgId,
  admin,
  slug,
}: {
  orgId: string | null;
  admin: boolean;
  slug?: string | undefined;
}) {
  const qc = useQueryClient();
  const [role, setRole] = useState<"manager" | "supervisor" | "cleaner" | "technician">("cleaner");
  const [label, setLabel] = useState("");
  const [maxUses, setMaxUses] = useState(1);
  const [days, setDays] = useState(14);

  const codes = useQuery({
    queryKey: ["invite-codes", orgId],
    queryFn: () => listInviteCodes({ data: { orgId: orgId! } }),
    enabled: !!orgId,
  });

  const create = useMutation({
    mutationFn: () =>
      createInviteCode({
        data: {
          orgId: orgId!,
          role,
          label: label.trim() || null,
          maxUses,
          expiresInDays: days || null,
        },
      }),
    onSuccess: (res) => {
      toast.success(`Invitation code ${res.code} is ready.`);
      setLabel("");
      void qc.invalidateQueries({ queryKey: ["invite-codes", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: (inviteId: string) => revokeInviteCode({ data: { orgId: orgId!, inviteId } }),
    onSuccess: () => {
      toast.success("Code revoked.");
      void qc.invalidateQueries({ queryKey: ["invite-codes", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="glow-ring">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Ticket className="size-4" /> Invitation codes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Send a code and the person joins with the role built in — no approval needed. Your older
          workspace code{" "}
          <span className="font-mono font-medium text-foreground">{slug}</span> still works for
          requests that you approve by hand.
        </p>

        {admin && (
          <div className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="inv-role">Joins as</Label>
              <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                <SelectTrigger id="inv-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cleaner">Cleaner</SelectItem>
                  <SelectItem value="technician">Maintenance technician</SelectItem>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-label">Label (optional)</Label>
              <Input
                id="inv-label"
                value={label}
                maxLength={60}
                placeholder="Summer crew"
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-uses">How many people</Label>
              <Input
                id="inv-uses"
                type="number"
                min={1}
                max={100}
                value={maxUses}
                onChange={(e) => setMaxUses(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-days">Valid for (days)</Label>
              <Input
                id="inv-days"
                type="number"
                min={1}
                max={90}
                value={days}
                onChange={(e) => setDays(Math.max(1, Math.min(90, Number(e.target.value) || 1)))}
              />
            </div>
            <Button
              className="sm:col-span-4"
              onClick={() => create.mutate()}
              disabled={create.isPending}
            >
              Generate invitation code
            </Button>
          </div>
        )}

        {codes.isLoading && <Skeleton className="h-16 w-full" />}

        <div className="divide-y divide-border">
          {(codes.data ?? []).map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 py-3">
              <code className="rounded-lg border border-border bg-background px-3 py-1.5 font-mono text-sm">
                {c.code}
              </code>
              <Badge variant="outline">{ROLE_LABEL[c.role] ?? c.role}</Badge>
              {c.label && <span className="text-sm text-muted-foreground">{c.label}</span>}
              <span className="text-xs text-muted-foreground">
                {c.uses}/{c.maxUses} used
                {c.expiresAt ? ` · until ${new Date(c.expiresAt).toLocaleDateString()}` : ""}
              </span>
              {!c.active && <Badge variant="secondary">Used up or expired</Badge>}
              <div className="ml-auto flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Copy code"
                  onClick={() => {
                    void navigator.clipboard.writeText(c.code);
                    toast.success("Code copied.");
                  }}
                >
                  <Copy className="size-4" />
                </Button>
                {admin && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Revoke code"
                    onClick={() => revoke.mutate(c.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          {!codes.isLoading && (codes.data ?? []).length === 0 && (
            <p className="py-3 text-sm text-muted-foreground">
              No active codes yet.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
