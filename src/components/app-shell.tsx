import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  Building2,
  CalendarRange,
  ClipboardList,
  Gauge,
  LogOut,
  Menu,
  Bell,
  Settings,
  Users,
  Wrench,
  Palette,
  Star,
  UserCheck,
  CalendarDays,
  Sun,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace, isStaff, isAdmin, ROLE_LABEL } from "@/hooks/useWorkspace";
import { listNotifications, markNotificationsRead } from "@/lib/notifications.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ThemePanel } from "@/components/theme-panel";
import { AirCleanLogo } from "@/components/brand";
import { Skeleton } from "@/components/ui/skeleton";

type NavItem = { to: string; label: string; icon: typeof Gauge; staffOnly?: boolean; adminOnly?: boolean };

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Overview", icon: Gauge },
  { to: "/my-day", label: "My day", icon: Sun },
  { to: "/tasks", label: "Tasks", icon: ClipboardList },
  { to: "/schedule", label: "Schedule", icon: CalendarDays, staffOnly: true },
  { to: "/bookings", label: "Bookings", icon: CalendarRange, staffOnly: true },
  { to: "/properties", label: "Properties", icon: Building2, staffOnly: true },
  { to: "/maintenance", label: "Maintenance", icon: Wrench },
  { to: "/reviews", label: "Reviews", icon: Star, staffOnly: true },
  { to: "/guests", label: "Guests", icon: UserCheck, staffOnly: true },
  { to: "/team", label: "Team", icon: Users, staffOnly: true },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children, title }: { children: ReactNode; title: string }) {
  const { session, isLoading, orgId, setOrgId, workspace, workspaces } = useWorkspace();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const active = workspaces.filter((w) => w.status === "active");
  const items = NAV.filter(
    (n) => (!n.staffOnly || isStaff(workspace?.role)) && (!n.adminOnly || isAdmin(workspace?.role)),
  );

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  const nav = (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = item.icon;
        const current = pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              current
                ? "bg-primary/10 text-primary shadow-[inset_2px_0_0_0_var(--primary)]"
                : "text-muted-foreground hover:translate-x-0.5 hover:bg-muted hover:text-foreground"
            }`}
          >
            <Icon className="size-4" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-24 w-64" />
      </div>
    );
  }

  if (session && active.length === 0) {
    return <NoWorkspace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-border bg-surface p-4 lg:flex">
        <Link to="/dashboard" className="mb-6 flex items-center gap-2 px-2">
          <AirCleanLogo />
        </Link>
        {nav}
        <div className="mt-auto space-y-2 pt-4">
          <p className="px-3 text-xs text-muted-foreground">{session?.fullName}</p>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={signOut}>
            <LogOut className="mr-2 size-4" /> Sign out
          </Button>
        </div>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-4">
              <SheetTitle className="mb-6 font-display">
                <AirCleanLogo />
              </SheetTitle>
              {nav}
              <Button variant="ghost" size="sm" className="mt-6 w-full justify-start" onClick={signOut}>
                <LogOut className="mr-2 size-4" /> Sign out
              </Button>
            </SheetContent>
          </Sheet>

          <h1 className="font-display text-lg font-semibold tracking-tight">{title}</h1>

          <div className="ml-auto flex items-center gap-2">
            {active.length > 1 && orgId && (
              <Select value={orgId} onValueChange={setOrgId}>
                <SelectTrigger className="w-44" aria-label="Workspace">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {active.map((w) => (
                    <SelectItem key={w.orgId} value={w.orgId}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {workspace && <Badge variant="secondary">{ROLE_LABEL[workspace.role]}</Badge>}
            <NotificationBell orgId={orgId} />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Appearance">
                  <Palette className="size-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80">
                <ThemePanel />
              </PopoverContent>
            </Popover>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
      </div>
    </div>
  );
}

function NotificationBell({ orgId }: { orgId: string | null }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["notifications", orgId],
    queryFn: () => listNotifications({ data: { orgId: orgId! } }),
    enabled: !!orgId,
    refetchInterval: 60_000,
  });
  const unread = (data ?? []).filter((n) => !n.read).length;

  return (
    <Popover
      onOpenChange={async (o) => {
        if (!o || !orgId || !unread) return;
        await markNotificationsRead({ data: { orgId } });
        qc.invalidateQueries({ queryKey: ["notifications", orgId] });
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <ScrollArea className="max-h-96">
          <div className="divide-y divide-border">
            {(data ?? []).length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">🔕 Nothing new right now.</p>
            )}
            {(data ?? []).map((n) => (
              <div key={n.id} className={`p-4 ${n.read ? "" : "bg-muted/40"}`}>
                <p className="text-sm font-medium">{n.subject}</p>
                <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(n.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function NoWorkspace() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="font-display text-2xl font-semibold">You are not in a workspace yet</h1>
        <p className="text-sm text-muted-foreground">
          Create one for your properties, or ask to join your team's workspace and wait for a
          manager to approve you.
        </p>
        <Button asChild>
          <Link to="/onboarding">Get started</Link>
        </Button>
      </div>
    </div>
  );
}
