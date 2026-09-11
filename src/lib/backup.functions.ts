import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listBackups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireMembership, supabaseAdmin, ADMIN_ROLES } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId, ADMIN_ROLES);

    const { data: rows } = await supabaseAdmin
      .from("backups")
      .select("id, status, size_bytes, row_counts, triggered_by, error, created_at, storage_key")
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: false })
      .limit(40);

    return (rows ?? []).map((b) => ({
      id: b.id,
      status: b.status,
      sizeBytes: b.size_bytes,
      rowCounts: b.row_counts as Record<string, number>,
      triggeredBy: b.triggered_by,
      error: b.error,
      createdAt: b.created_at,
      downloadable: !!b.storage_key && b.status === "completed",
    }));
  });

export const createBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireMembership, ADMIN_ROLES, logAudit } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId, ADMIN_ROLES);
    const { runBackup } = await import("./backup.server");
    const result = await runBackup(data.orgId, "manual", context.userId);
    await logAudit({
      orgId: data.orgId,
      actorId: context.userId,
      action: "backup.created",
      entityType: "backup",
      entityId: result.backupId || null,
      metadata: { ok: result.ok, rowCounts: result.rowCounts },
    });
    return result;
  });

export const getBackupDownload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid(), backupId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireMembership, supabaseAdmin, ADMIN_ROLES, logAudit } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId, ADMIN_ROLES);

    const { data: backup } = await supabaseAdmin
      .from("backups")
      .select("storage_key")
      .eq("id", data.backupId)
      .eq("org_id", data.orgId)
      .maybeSingle();
    if (!backup?.storage_key) throw new Error("That backup file is not available.");

    const { data: signed } = await supabaseAdmin.storage
      .from("org-backups")
      .createSignedUrl(backup.storage_key, 300);
    if (!signed?.signedUrl) throw new Error("Could not prepare the download.");

    await logAudit({
      orgId: data.orgId,
      actorId: context.userId,
      action: "backup.downloaded",
      entityType: "backup",
      entityId: data.backupId,
    });
    return { url: signed.signedUrl };
  });

/** Plain CSV export of the operational data an owner is most likely to want. */
export const exportCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ orgId: z.string().uuid(), dataset: z.enum(["tasks", "bookings", "maintenance"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireMembership, supabaseAdmin, ADMIN_ROLES, logAudit } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId, ADMIN_ROLES);

    const columns: Record<typeof data.dataset, string> = {
      tasks: "id, title, type, status, qc_status, qc_score, scheduled_start, due_at, completed_at",
      bookings: "id, guest_name, guests, source, check_in, check_out, cancelled, created_at",
      maintenance: "id, description, category, severity, status, created_at, resolved_at",
    };
    const table = data.dataset === "maintenance" ? "maintenance_requests" : data.dataset;

    const { data: rows, error } = await supabaseAdmin
      .from(table)
      .select(columns[data.dataset])
      .eq("org_id", data.orgId)
      .limit(20000);
    if (error) throw new Error("Could not build the export.");

    const list = (rows ?? []) as unknown as Record<string, unknown>[];
    const headers = list.length ? Object.keys(list[0]!) : [];
    const escape = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers.join(","), ...list.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");

    await logAudit({
      orgId: data.orgId,
      actorId: context.userId,
      action: "data.exported",
      entityType: data.dataset,
      metadata: { rows: list.length },
    });
    return { csv, filename: `${data.dataset}-${new Date().toISOString().slice(0, 10)}.csv` };
  });
