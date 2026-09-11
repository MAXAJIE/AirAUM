import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

type Role = Database["public"]["Enums"]["app_role"];

export type Workspace = {
  orgId: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  role: Role;
  status: Database["public"]["Enums"]["member_status"];
  qcAutoThreshold: number;
  qcReviewThreshold: number;
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "workspace";

/** Ensures a profile row exists and returns every workspace the user belongs to. */
export const getSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("./ops.server");
    const email = (context.claims["email"] as string | undefined) ?? null;
    const meta = (context.claims["user_metadata"] ?? {}) as Record<string, unknown>;

    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, phone_enc, avatar_url")
      .eq("id", context.userId)
      .maybeSingle();

    let profile = existing;
    if (!profile) {
      const { data: created } = await supabaseAdmin
        .from("profiles")
        .insert({
          id: context.userId,
          full_name:
            (meta["full_name"] as string) ??
            (meta["name"] as string) ??
            email?.split("@")[0] ??
            "New user",
          email,
          avatar_url: (meta["avatar_url"] as string) ?? null,
        })
        .select("id, full_name, email, phone_enc, avatar_url")
        .single();
      profile = created ?? null;
    } else if (email && profile.email !== email) {
      await supabaseAdmin.from("profiles").update({ email }).eq("id", context.userId);
      profile.email = email;
    }

    const { data: memberships } = await supabaseAdmin
      .from("org_members")
      .select("org_id, role, status")
      .eq("user_id", context.userId);

    const orgIds = (memberships ?? []).map((m) => m.org_id);
    const { data: orgs } = orgIds.length
      ? await supabaseAdmin
          .from("organizations")
          .select("id, name, slug, timezone, currency, qc_auto_threshold, qc_review_threshold")
          .in("id", orgIds)
      : { data: [] };

    const orgById = new Map((orgs ?? []).map((o) => [o.id, o]));

    const workspaces: Workspace[] = (memberships ?? [])
      .map((m) => {
        const org = orgById.get(m.org_id);
        if (!org) return null;
        return {
          orgId: org.id,
          name: org.name,
          slug: org.slug,
          timezone: org.timezone,
          currency: org.currency,
          role: m.role,
          status: m.status,
          qcAutoThreshold: Number(org.qc_auto_threshold),
          qcReviewThreshold: Number(org.qc_review_threshold),
        } satisfies Workspace;
      })
      .filter((w): w is Workspace => w !== null);

    let phone: string | null = null;
    if (profile?.phone_enc) {
      const { decryptField } = await import("./crypto.server");
      phone = await decryptField(profile.phone_enc);
    }

    return {
      userId: context.userId,
      email,
      fullName: profile?.full_name ?? "",
      avatarUrl: profile?.avatar_url ?? null,
      phone,
      workspaces,
    };
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ fullName: z.string().min(1).max(120), phone: z.string().max(30).nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("./ops.server");
    const { encryptField } = await import("./crypto.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ full_name: data.fullName, phone_enc: await encryptField(data.phone) })
      .eq("id", context.userId);
    if (error) throw new Error("Could not save your profile.");
    return { ok: true };
  });

export const createWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().min(2).max(80),
        timezone: z.string().min(1).max(60).default("Asia/Kuala_Lumpur"),
        currency: z.string().min(1).max(8).default("MYR"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, logAudit } = await import("./ops.server");
    const base = slugify(data.name);
    const slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;

    const { data: org, error } = await supabaseAdmin
      .from("organizations")
      .insert({
        name: data.name,
        slug,
        timezone: data.timezone,
        currency: data.currency,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error || !org) throw new Error("Could not create the workspace.");

    await supabaseAdmin.from("org_members").insert({
      org_id: org.id,
      user_id: context.userId,
      role: "owner",
      status: "active",
      approved_by: context.userId,
      approved_at: new Date().toISOString(),
    });

    // Seed a sensible default turnover checklist so the first task is usable.
    const { data: checklist } = await supabaseAdmin
      .from("checklists")
      .insert({ org_id: org.id, name: "Standard turnover", task_type: "turnover_clean", is_default: true })
      .select("id")
      .single();

    if (checklist) {
      const items: Array<[string, string, boolean]> = [
        ["Strip and remake all beds", "bedroom", true],
        ["Vacuum and mop all floors", "general", false],
        ["Clean and dry bathroom, restock toiletries", "bathroom", true],
        ["Fresh towels laid out", "bathroom", true],
        ["Kitchen surfaces cleared and wiped", "kitchen", true],
        ["Fridge emptied and wiped", "kitchen", false],
        ["Bins emptied, new liners", "general", false],
        ["Living area staged, cushions arranged", "living_room", true],
        ["Restock consumables (coffee, water, paper)", "amenities", true],
        ["Air-con and lights working, remote in place", "general", false],
      ];
      await supabaseAdmin.from("checklist_items").insert(
        items.map(([label, room, requires_photo], i) => ({
          org_id: org.id,
          checklist_id: checklist.id,
          label,
          room,
          requires_photo,
          position: i,
        })),
      );
    }

    await logAudit({
      orgId: org.id,
      actorId: context.userId,
      action: "workspace.created",
      entityType: "organization",
      entityId: org.id,
      metadata: { name: data.name },
    });

    return { orgId: org.id, slug };
  });

export const findWorkspaceBySlug = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ slug: z.string().min(1).max(60) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("./ops.server");
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("id, name, slug")
      .eq("slug", data.slug.trim().toLowerCase())
      .maybeSingle();
    return org ?? null;
  });

export const requestToJoin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ slug: z.string().min(1).max(60), role: z.enum(["cleaner", "technician"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, notifyStaff, logAudit } = await import("./ops.server");
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("id, name")
      .eq("slug", data.slug.trim().toLowerCase())
      .maybeSingle();
    if (!org) throw new Error("No workspace found with that code.");

    const { data: existing } = await supabaseAdmin
      .from("org_members")
      .select("id, status")
      .eq("org_id", org.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existing) return { orgId: org.id, status: existing.status };

    await supabaseAdmin.from("org_members").insert({
      org_id: org.id,
      user_id: context.userId,
      role: data.role,
      status: "pending",
    });

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("id", context.userId)
      .maybeSingle();

    await notifyStaff(org.id, "member_pending", {
      name: profile?.full_name ?? "A new user",
      email: profile?.email ?? "",
      org: org.name,
    });
    await logAudit({
      orgId: org.id,
      actorId: context.userId,
      action: "member.join_requested",
      entityType: "org_member",
      metadata: { role: data.role },
    });

    return { orgId: org.id, status: "pending" as const };
  });

export const listMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireMembership, supabaseAdmin, STAFF_ROLES } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId, STAFF_ROLES);

    const { data: members } = await supabaseAdmin
      .from("org_members")
      .select("id, user_id, role, status, created_at")
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: true });

    const userIds = (members ?? []).map((m) => m.user_id);
    const { data: profiles } = userIds.length
      ? await supabaseAdmin.from("profiles").select("id, full_name, email").in("id", userIds)
      : { data: [] };
    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

    const { data: cleaners } = await supabaseAdmin
      .from("cleaner_profiles")
      .select(
        "user_id, base_city, skills, max_daily_tasks, quality_score, reliability, cancellations_30d, tasks_completed, active",
      )
      .eq("org_id", data.orgId);
    const cleanerByUser = new Map((cleaners ?? []).map((c) => [c.user_id, c]));

    return (members ?? []).map((m) => ({
      id: m.id,
      userId: m.user_id,
      role: m.role,
      status: m.status,
      joinedAt: m.created_at,
      name: profileById.get(m.user_id)?.full_name ?? "Unnamed",
      email: profileById.get(m.user_id)?.email ?? null,
      cleaner: cleanerByUser.get(m.user_id) ?? null,
    }));
  });

export const setMemberStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        memberId: z.string().uuid(),
        status: z.enum(["active", "suspended"]).optional(),
        role: z.enum(["owner", "manager", "supervisor", "cleaner", "technician"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireMembership, supabaseAdmin, logAudit, queueNotification, ADMIN_ROLES } = await import(
      "./ops.server"
    );
    const me = await requireMembership(context.userId, data.orgId, ADMIN_ROLES);

    const { data: target } = await supabaseAdmin
      .from("org_members")
      .select("id, user_id, role, status")
      .eq("id", data.memberId)
      .eq("org_id", data.orgId)
      .maybeSingle();
    if (!target) throw new Error("That member no longer exists.");

    // Only an owner may create or demote another owner.
    if ((data.role === "owner" || target.role === "owner") && me.role !== "owner") {
      throw new Error("Only an owner can change owner access.");
    }
    if (target.user_id === context.userId && data.role && data.role !== me.role) {
      throw new Error("You cannot change your own role.");
    }

    const patch: Database["public"]["Tables"]["org_members"]["Update"] = {};
    if (data.status) {
      patch.status = data.status;
      patch.approved_by = context.userId;
      patch.approved_at = new Date().toISOString();
    }
    if (data.role) patch.role = data.role;

    const { error } = await supabaseAdmin.from("org_members").update(patch).eq("id", data.memberId);
    if (error) throw new Error("Could not update that member.");

    const role = data.role ?? target.role;
    if ((role === "cleaner" || role === "technician") && (data.status ?? target.status) === "active") {
      await supabaseAdmin
        .from("cleaner_profiles")
        .upsert({ org_id: data.orgId, user_id: target.user_id }, { onConflict: "org_id,user_id" });
    }

    if (data.status === "active" && target.status === "pending") {
      const { data: org } = await supabaseAdmin
        .from("organizations")
        .select("name")
        .eq("id", data.orgId)
        .maybeSingle();
      await queueNotification({
        orgId: data.orgId,
        userId: target.user_id,
        template: "member_approved",
        data: { org: org?.name ?? "the workspace", role },
      });
    }

    await logAudit({
      orgId: data.orgId,
      actorId: context.userId,
      action: "member.updated",
      entityType: "org_member",
      entityId: data.memberId,
      metadata: { status: data.status ?? null, role: data.role ?? null },
    });
    return { ok: true };
  });

export const updateCleanerProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        userId: z.string().uuid(),
        baseCity: z.string().max(80).nullable(),
        skills: z.array(z.string().max(40)).max(20),
        maxDailyTasks: z.number().int().min(1).max(20),
        active: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireMembership, supabaseAdmin, ADMIN_ROLES, logAudit } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId, ADMIN_ROLES);
    const { error } = await supabaseAdmin.from("cleaner_profiles").upsert(
      {
        org_id: data.orgId,
        user_id: data.userId,
        base_city: data.baseCity,
        skills: data.skills,
        max_daily_tasks: data.maxDailyTasks,
        active: data.active,
      },
      { onConflict: "org_id,user_id" },
    );
    if (error) throw new Error("Could not save those cleaner details.");
    await logAudit({
      orgId: data.orgId,
      actorId: context.userId,
      action: "cleaner.updated",
      entityType: "cleaner_profile",
      entityId: data.userId,
    });
    return { ok: true };
  });

export const updateWorkspaceSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        name: z.string().min(2).max(80),
        timezone: z.string().min(1).max(60),
        currency: z.string().min(1).max(8),
        qcAutoThreshold: z.number().min(0.5).max(1),
        qcReviewThreshold: z.number().min(0.1).max(0.95),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireMembership, supabaseAdmin, ADMIN_ROLES, logAudit } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId, ADMIN_ROLES);
    if (data.qcReviewThreshold >= data.qcAutoThreshold) {
      throw new Error("The review threshold must be lower than the auto-approve threshold.");
    }
    const { error } = await supabaseAdmin
      .from("organizations")
      .update({
        name: data.name,
        timezone: data.timezone,
        currency: data.currency,
        qc_auto_threshold: data.qcAutoThreshold,
        qc_review_threshold: data.qcReviewThreshold,
      })
      .eq("id", data.orgId);
    if (error) throw new Error("Could not save workspace settings.");
    await logAudit({
      orgId: data.orgId,
      actorId: context.userId,
      action: "workspace.settings_updated",
      entityType: "organization",
      entityId: data.orgId,
    });
    return { ok: true };
  });
