import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { createWorkspace, requestToJoin } from "@/lib/org.functions";
import { redeemInviteCode } from "@/lib/invites.functions";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Set up your workspace | AirClean" },
      { name: "description", content: "Create a new AirClean workspace or join your team's existing one." },
      { property: "og:title", content: "Set up your workspace | AirClean" },
      { property: "og:description", content: "Create a workspace or join your team on AirClean." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Onboarding,
});

const TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Lisbon",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function Onboarding() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { setOrgId, refetch } = useWorkspace();

  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );
  const [currency, setCurrency] = useState("EUR");
  const [busy, setBusy] = useState(false);

  const [code, setCode] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [joinRole, setJoinRole] = useState<"cleaner" | "technician">("cleaner");

  const create = async () => {
    if (name.trim().length < 2) {
      toast.error("Give your workspace a name.");
      return;
    }
    setBusy(true);
    try {
      const res = await createWorkspace({
        data: { name: name.trim(), timezone, currency: currency.toUpperCase() },
      });
      await refetch();
      qc.invalidateQueries();
      setOrgId(res.orgId);
      toast.success("Workspace ready.");
      navigate({ to: "/dashboard" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the workspace.");
    } finally {
      setBusy(false);
    }
  };

  const redeem = async () => {
    if (inviteCode.trim().length < 4) {
      toast.error("Enter the invitation code your manager sent you.");
      return;
    }
    setBusy(true);
    try {
      const res = await redeemInviteCode({ data: { code: inviteCode.trim() } });
      await refetch();
      qc.invalidateQueries();
      setOrgId(res.orgId);
      toast.success(`You are in — welcome to ${res.orgName}.`);
      navigate({ to: "/dashboard" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not use that code.");
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    if (!code.trim()) {
      toast.error("Enter the workspace code your manager gave you.");
      return;
    }
    setBusy(true);
    try {
      const res = await requestToJoin({ data: { slug: code.trim(), role: joinRole } });
      await refetch();
      if (res.status === "active") {
        setOrgId(res.orgId);
        navigate({ to: "/dashboard" });
      } else {
        toast.success("Request sent. A manager needs to approve you.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send the request.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-2xl">Get set up</CardTitle>
          <CardDescription>
            Start a workspace for your properties, or join a team that already has one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="invite">
            <TabsList className="mb-4 grid w-full grid-cols-3">
              <TabsTrigger value="invite">Invitation code</TabsTrigger>
              <TabsTrigger value="create">Create</TabsTrigger>
              <TabsTrigger value="join">Join</TabsTrigger>
            </TabsList>

            <TabsContent value="invite" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="inv-code">Invitation code</Label>
                <Input
                  id="inv-code"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="AIRC-LEAN"
                  className="font-mono tracking-widest"
                />
              </div>
              <Button className="w-full" onClick={redeem} disabled={busy}>
                Join the team
              </Button>
              <p className="text-xs text-muted-foreground">
                A code puts you straight into the workspace with the role your manager chose.
              </p>
            </TabsContent>

            <TabsContent value="create" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ws-name">Workspace name</Label>
                <Input
                  id="ws-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Coastal Stays"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ws-tz">Time zone</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger id="ws-tz">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[...new Set([timezone, ...TIMEZONES])].map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ws-cur">Currency</Label>
                <Input
                  id="ws-cur"
                  value={currency}
                  maxLength={3}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                />
              </div>
              <Button className="w-full" onClick={create} disabled={busy}>
                Create workspace
              </Button>
            </TabsContent>

            <TabsContent value="join" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ws-code">Workspace code</Label>
                <Input
                  id="ws-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="coastal-stays"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ws-role">I work as</Label>
                <Select value={joinRole} onValueChange={(v) => setJoinRole(v as "cleaner" | "technician")}>
                  <SelectTrigger id="ws-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cleaner">Cleaner</SelectItem>
                    <SelectItem value="technician">Maintenance technician</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" onClick={join} disabled={busy}>
                Ask to join
              </Button>
              <p className="text-xs text-muted-foreground">
                A manager reviews every request before you can see any work.
              </p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
