import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { getSession } from "@/lib/org.functions";

const ORG_KEY = "opspilot.orgId";

export type SessionData = Awaited<ReturnType<typeof getSession>>;

export function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: () => getSession(),
    staleTime: 30_000,
  });
}

/** Current workspace selection, remembered per browser. */
export function useWorkspace() {
  const session = useSession();
  const [orgId, setOrgIdState] = useState<string | null>(null);

  useEffect(() => {
    if (!session.data) return;
    const active = session.data.workspaces.filter((w) => w.status === "active");
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(ORG_KEY);
    } catch {
      stored = null;
    }
    const valid = active.find((w) => w.orgId === stored) ?? active[0] ?? null;
    setOrgIdState(valid?.orgId ?? null);
  }, [session.data]);

  const setOrgId = useCallback((id: string) => {
    setOrgIdState(id);
    try {
      window.localStorage.setItem(ORG_KEY, id);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const workspace = session.data?.workspaces.find((w) => w.orgId === orgId) ?? null;

  return {
    session: session.data ?? null,
    isLoading: session.isLoading,
    error: session.error,
    orgId,
    setOrgId,
    workspace,
    workspaces: session.data?.workspaces ?? [],
    refetch: session.refetch,
  };
}

export const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  supervisor: "Supervisor",
  cleaner: "Cleaner",
  technician: "Technician",
};

export const isStaff = (role?: string | null) =>
  role === "owner" || role === "manager" || role === "supervisor";
export const isAdmin = (role?: string | null) => role === "owner" || role === "manager";
