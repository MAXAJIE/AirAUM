import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireMembership, supabaseAdmin } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId);

    const { data: rows } = await supabaseAdmin
      .from("notifications")
      .select("id, subject, body, template, status, read_at, created_at")
      .eq("org_id", data.orgId)
      .eq("user_id", context.userId)
      .eq("channel", "in_app")
      .order("created_at", { ascending: false })
      .limit(60);

    return (rows ?? []).map((n) => ({
      id: n.id,
      subject: n.subject,
      body: n.body,
      template: n.template,
      read: !!n.read_at,
      createdAt: n.created_at,
    }));
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ orgId: z.string().uuid(), ids: z.array(z.string().uuid()).max(200).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireMembership, supabaseAdmin } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId);

    let query = supabaseAdmin
      .from("notifications")
      .update({ read_at: new Date().toISOString(), status: "read" })
      .eq("org_id", data.orgId)
      .eq("user_id", context.userId)
      .eq("channel", "in_app")
      .is("read_at", null);
    if (data.ids?.length) query = query.in("id", data.ids);

    await query;
    return { ok: true };
  });

/**
 * Drains the outbound queue. Email and WhatsApp are provider-agnostic on
 * purpose: until a provider is configured the rows are marked `skipped` with a
 * clear reason instead of being lost, so switching provider later is a single
 * function change and no message is silently dropped.
 */
export const dispatchQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireMembership, ADMIN_ROLES } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId, ADMIN_ROLES);
    const { drainNotificationQueue } = await import("./notifications.server");
    return drainNotificationQueue(data.orgId);
  });

export const notificationHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireMembership, supabaseAdmin, ADMIN_ROLES } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId, ADMIN_ROLES);

    const { data: rows } = await supabaseAdmin
      .from("notifications")
      .select("channel, status")
      .eq("org_id", data.orgId)
      .limit(2000);

    const counts: Record<string, number> = {};
    for (const r of rows ?? []) {
      const key = `${r.channel}:${r.status}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return {
      counts,
      emailConfigured: !!process.env["RESEND_API_KEY"],
      whatsappConfigured: !!process.env["WHATSAPP_API_URL"] && !!process.env["WHATSAPP_API_TOKEN"],
    };
  });
