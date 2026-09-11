import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Team invitation codes.
 *
 * A code carries the workspace and the role it grants, so redeeming it joins
 * the holder as an active member with no approval round-trip. Codes are
 * single-use unless a larger cap is chosen, expire, and can be revoked.
 */

// Unambiguous alphabet: no O/0, no I/1 — these get read aloud and retyped.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode(length = 8) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

const normalise = (code: string) => code.trim().toUpperCase().replace(/\s+/g, "");

export type InviteCode = {
  id: string;
  code: string;
  role: string;
  label: string | null;
  maxUses: number;
  uses: number;
  expiresAt: string | null;
  active: boolean;
  createdAt: string;
};

export const listInviteCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<InviteCode[]> => {
    const { requireMembership, supabaseAdmin, STAFF_ROLES } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId, STAFF_ROLES);

    const { data: rows } = await supabaseAdmin
      .from("invite_codes")
      .select("id, code, role, label, max_uses, uses, expires_at, active, revoked_at, created_at")
      .eq("org_id", data.orgId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(50);

    return (rows ?? []).map((r) => ({
      id: r.id,
      code: r.code,
      role: r.role,
      label: r.label,
      maxUses: r.max_uses,
      uses: r.uses,
      expiresAt: r.expires_at,
      active: r.active && (!r.expires_at || new Date(r.expires_at) > new Date()),
      createdAt: r.created_at,
    }));
  });

export const createInviteCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        role: z.enum(["manager", "supervisor", "cleaner", "technician"]),
        label: z.string().max(60).nullable().default(null),
        maxUses: z.number().int().min(1).max(100).default(1),
        expiresInDays: z.number().int().min(1).max(90).nullable().default(14),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireMembership, supabaseAdmin, ADMIN_ROLES, logAudit } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId, ADMIN_ROLES);

    const expiresAt = data.expiresInDays
      ? new Date(Date.now() + data.expiresInDays * 86_400_000).toISOString()
      : null;

    // Collisions are vanishingly unlikely, but the code column is unique —
    // retry rather than surfacing a database error to a manager.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = makeCode();
      const { data: row, error } = await supabaseAdmin
        .from("invite_codes")
        .insert({
          org_id: data.orgId,
          code,
          role: data.role,
          label: data.label,
          max_uses: data.maxUses,
          expires_at: expiresAt,
          created_by: context.userId,
        })
        .select("id, code")
        .single();

      if (!error && row) {
        await logAudit({
          orgId: data.orgId,
          actorId: context.userId,
          action: "invite.created",
          entityType: "invite_code",
          entityId: row.id,
          metadata: { role: data.role, maxUses: data.maxUses },
        });
        return { id: row.id, code: row.code };
      }
    }
    throw new Error("Could not create an invitation code. Try again.");
  });

export const revokeInviteCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ orgId: z.string().uuid(), inviteId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireMembership, supabaseAdmin, ADMIN_ROLES, logAudit } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId, ADMIN_ROLES);

    const { error } = await supabaseAdmin
      .from("invite_codes")
      .update({ active: false, revoked_at: new Date().toISOString() })
      .eq("id", data.inviteId)
      .eq("org_id", data.orgId);
    if (error) throw new Error("Could not revoke that code.");

    await logAudit({
      orgId: data.orgId,
      actorId: context.userId,
      action: "invite.revoked",
      entityType: "invite_code",
      entityId: data.inviteId,
    });
    return { ok: true };
  });

/** Redeem a code and join the workspace as an active member. */
export const redeemInviteCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ code: z.string().min(4).max(24) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, notifyStaff, logAudit } = await import("./ops.server");

    const { data: invite } = await supabaseAdmin
      .from("invite_codes")
      .select("id, org_id, role, max_uses, uses, expires_at, active, revoked_at")
      .eq("code", normalise(data.code))
      .maybeSingle();

    if (!invite || !invite.active || invite.revoked_at) {
      throw new Error("That invitation code is not valid.");
    }
    if (invite.expires_at && new Date(invite.expires_at) <= new Date()) {
      throw new Error("That invitation code has expired.");
    }
    if (invite.uses >= invite.max_uses) {
      throw new Error("That invitation code has already been used.");
    }

    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("id, name")
      .eq("id", invite.org_id)
      .maybeSingle();
    if (!org) throw new Error("That workspace no longer exists.");

    const { data: existing } = await supabaseAdmin
      .from("org_members")
      .select("id, status")
      .eq("org_id", invite.org_id)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (existing) {
      // Already known to the workspace: the code simply activates them.
      await supabaseAdmin
        .from("org_members")
        .update({ status: "active", role: invite.role, approved_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      const { error } = await supabaseAdmin.from("org_members").insert({
        org_id: invite.org_id,
        user_id: context.userId,
        role: invite.role,
        status: "active",
        approved_at: new Date().toISOString(),
      });
      if (error) throw new Error("Could not add you to that workspace.");
    }

    if (invite.role === "cleaner" || invite.role === "technician") {
      await supabaseAdmin
        .from("cleaner_profiles")
        .upsert(
          { org_id: invite.org_id, user_id: context.userId },
          { onConflict: "org_id,user_id" },
        );
    }

    const uses = invite.uses + 1;
    await supabaseAdmin
      .from("invite_codes")
      .update({ uses, active: uses < invite.max_uses })
      .eq("id", invite.id);

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("id", context.userId)
      .maybeSingle();

    await notifyStaff(invite.org_id, "member_joined_with_code", {
      name: profile?.full_name ?? "Someone",
      email: profile?.email ?? "",
      role: invite.role,
      org: org.name,
    });
    await logAudit({
      orgId: invite.org_id,
      actorId: context.userId,
      action: "invite.redeemed",
      entityType: "invite_code",
      entityId: invite.id,
      metadata: { role: invite.role },
    });

    return { orgId: invite.org_id, role: invite.role, orgName: org.name };
  });
