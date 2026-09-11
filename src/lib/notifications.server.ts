import { supabaseAdmin } from "@/integrations/supabase/client.server";

type QueueResult = { sent: number; skipped: number; failed: number; reasons: string[] };

const MAX_ATTEMPTS = 5;
const BATCH = 100;

async function sendEmail(to: string, subject: string, body: string): Promise<{ ok: boolean; reason?: string }> {
  const key = process.env["RESEND_API_KEY"];
  const from = process.env["NOTIFY_EMAIL_FROM"];
  if (!key || !from) return { ok: false, reason: "email_provider_not_configured" };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ from, to, subject, text: body }),
  });
  if (res.ok) return { ok: true };
  return { ok: false, reason: `email_${res.status}` };
}

/**
 * Provider-agnostic WhatsApp send. Configure WHATSAPP_API_URL + token for any
 * provider that accepts a JSON `{ to, message }` body; no provider is baked in.
 */
async function sendWhatsapp(to: string, body: string): Promise<{ ok: boolean; reason?: string }> {
  const url = process.env["WHATSAPP_API_URL"];
  const token = process.env["WHATSAPP_API_TOKEN"];
  if (!url || !token) return { ok: false, reason: "whatsapp_provider_not_configured" };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to, message: body }),
  });
  if (res.ok) return { ok: true };
  return { ok: false, reason: `whatsapp_${res.status}` };
}

export async function drainNotificationQueue(orgId?: string): Promise<QueueResult> {
  let query = supabaseAdmin
    .from("notifications")
    .select("id, channel, subject, body, to_address, attempts")
    .eq("status", "queued")
    .in("channel", ["email", "whatsapp"])
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at")
    .limit(BATCH);
  if (orgId) query = query.eq("org_id", orgId);

  const { data: rows } = await query;
  const out: QueueResult = { sent: 0, skipped: 0, failed: 0, reasons: [] };

  for (const row of rows ?? []) {
    if (!row.to_address) {
      out.skipped++;
      await supabaseAdmin
        .from("notifications")
        .update({ status: "skipped", error: "no_address", attempts: row.attempts + 1 })
        .eq("id", row.id);
      continue;
    }

    const result =
      row.channel === "email"
        ? await sendEmail(row.to_address, row.subject ?? "Notification", row.body ?? "")
        : await sendWhatsapp(row.to_address, row.body ?? "");

    if (result.ok) {
      out.sent++;
      await supabaseAdmin
        .from("notifications")
        .update({ status: "sent", sent_at: new Date().toISOString(), attempts: row.attempts + 1, error: null })
        .eq("id", row.id);
      continue;
    }

    const notConfigured = result.reason?.endsWith("not_configured");
    if (!out.reasons.includes(result.reason ?? "")) out.reasons.push(result.reason ?? "unknown");
    if (notConfigured) out.skipped++;
    else out.failed++;

    await supabaseAdmin
      .from("notifications")
      .update({
        // Not configured is a settings gap, not a delivery failure — park it
        // rather than burning retries.
        status: notConfigured ? "skipped" : row.attempts + 1 >= MAX_ATTEMPTS ? "failed" : "queued",
        error: result.reason ?? "unknown",
        attempts: row.attempts + 1,
      })
      .eq("id", row.id);
  }

  return out;
}
