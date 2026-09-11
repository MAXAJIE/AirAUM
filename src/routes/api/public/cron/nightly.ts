import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Nightly maintenance job: drains the notification queue and takes a backup of
 * every workspace. Callable only with the cron bearer secret.
 */
export const Route = createFileRoute("/api/public/cron/nightly")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        const { drainNotificationQueue } = await import("@/lib/notifications.server");
        const { runBackup, orgsDueForBackup } = await import("@/lib/backup.server");

        const queue = await drainNotificationQueue();
        const orgs = await orgsDueForBackup();
        const backups: Array<{ orgId: string; ok: boolean; error?: string }> = [];
        for (const orgId of orgs) {
          const result = await runBackup(orgId, "schedule", null);
          backups.push({ orgId, ok: result.ok, ...(result.error ? { error: result.error } : {}) });
        }

        return Response.json({ queue, backups: backups.length, failed: backups.filter((b) => !b.ok).length });
      },
    },
  },
});
