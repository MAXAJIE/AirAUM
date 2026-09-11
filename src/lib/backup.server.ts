import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BUCKET = "org-backups";

/**
 * Tables included in a workspace backup. Encrypted columns are exported in
 * their encrypted form — a backup file never contains readable addresses,
 * door codes or phone numbers.
 */
const TABLES = [
  "organizations",
  "org_members",
  "properties",
  "bookings",
  "checklists",
  "checklist_items",
  "tasks",
  "task_items",
  "photos",
  "cleaner_profiles",
  "availability_rules",
  "time_off",
  "maintenance_requests",
  "notifications",
  "ai_decisions",
  "audit_logs",
] as const;

export type BackupOutcome = { ok: boolean; backupId: string; rowCounts: Record<string, number>; error?: string };

export async function runBackup(orgId: string, triggeredBy: "manual" | "schedule", actorId: string | null) {
  const { data: created } = await supabaseAdmin
    .from("backups")
    .insert({ org_id: orgId, status: "running", triggered_by: triggeredBy, created_by: actorId, row_counts: {} })
    .select("id")
    .single();

  const backupId = created?.id ?? "";
  const rowCounts: Record<string, number> = {};
  const payload: Record<string, unknown[]> = {};

  try {
    for (const table of TABLES) {
      const query =
        table === "organizations"
          ? supabaseAdmin.from("organizations").select("*").eq("id", orgId)
          : supabaseAdmin.from(table).select("*").eq("org_id", orgId);
      const { data, error } = await query.limit(50000);
      if (error) throw new Error(`${table}: ${error.message}`);
      payload[table] = (data ?? []) as unknown[];
      rowCounts[table] = data?.length ?? 0;
    }

    const body = JSON.stringify(
      { version: 1, orgId, createdAt: new Date().toISOString(), rowCounts, data: payload },
      null,
      0,
    );
    const bytes = new TextEncoder().encode(body);
    const key = `${orgId}/${new Date().toISOString().replace(/[:.]/g, "-")}.json`;

    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(key, bytes, { contentType: "application/json", upsert: false });
    if (upErr) throw new Error(upErr.message);

    if (backupId) {
      await supabaseAdmin
        .from("backups")
        .update({ status: "completed", storage_key: key, size_bytes: bytes.byteLength, row_counts: rowCounts })
        .eq("id", backupId);
    }

    return { ok: true, backupId, rowCounts } satisfies BackupOutcome;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Backup failed.";
    if (backupId) {
      await supabaseAdmin.from("backups").update({ status: "failed", error: message }).eq("id", backupId);
    }
    return { ok: false, backupId, rowCounts, error: message } satisfies BackupOutcome;
  }
}

export async function orgsDueForBackup(): Promise<string[]> {
  const { data } = await supabaseAdmin.from("organizations").select("id").limit(1000);
  return (data ?? []).map((o) => o.id);
}
