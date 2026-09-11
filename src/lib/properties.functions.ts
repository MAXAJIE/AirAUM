import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type PropertyRow = {
  id: string;
  name: string;
  unitLabel: string | null;
  city: string | null;
  address: string | null;
  accessCode: string | null;
  bedrooms: number;
  bathrooms: number;
  notes: string | null;
  turnoverMinutes: number;
  active: boolean;
};

const propertyInput = z.object({
  orgId: z.string().uuid(),
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  unitLabel: z.string().max(60).nullable(),
  city: z.string().max(80).nullable(),
  address: z.string().max(400).nullable(),
  accessCode: z.string().max(120).nullable(),
  bedrooms: z.number().int().min(0).max(30),
  bathrooms: z.number().int().min(0).max(30),
  notes: z.string().max(2000).nullable(),
  turnoverMinutes: z.number().int().min(15).max(1440),
  active: z.boolean(),
});

export const listProperties = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<PropertyRow[]> => {
    const { requireMembership, supabaseAdmin, STAFF_ROLES } = await import("./ops.server");
    const me = await requireMembership(context.userId, data.orgId);
    const isStaff = STAFF_ROLES.includes(me.role);

    const { data: rows, error } = await supabaseAdmin
      .from("properties")
      .select("*")
      .eq("org_id", data.orgId)
      .order("name");
    if (error) throw new Error("Could not load properties.");

    const { decryptField } = await import("./crypto.server");
    return Promise.all(
      (rows ?? []).map(async (p) => ({
        id: p.id,
        name: p.name,
        unitLabel: p.unit_label,
        city: p.city,
        // Street address and door codes are encrypted at rest and only
        // revealed to staff on this listing screen.
        address: isStaff ? await decryptField(p.address_enc) : null,
        accessCode: isStaff ? await decryptField(p.access_code_enc) : null,
        bedrooms: p.bedrooms,
        bathrooms: p.bathrooms,
        notes: p.notes,
        turnoverMinutes: p.turnover_minutes,
        active: p.active,
      })),
    );
  });

export const saveProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => propertyInput.parse(d))
  .handler(async ({ data, context }) => {
    const { requireMembership, supabaseAdmin, ADMIN_ROLES, logAudit } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId, ADMIN_ROLES);
    const { encryptField } = await import("./crypto.server");

    const row = {
      org_id: data.orgId,
      name: data.name,
      unit_label: data.unitLabel,
      city: data.city,
      address_enc: await encryptField(data.address),
      access_code_enc: await encryptField(data.accessCode),
      bedrooms: data.bedrooms,
      bathrooms: data.bathrooms,
      notes: data.notes,
      turnover_minutes: data.turnoverMinutes,
      active: data.active,
    };

    if (data.id) {
      const { error } = await supabaseAdmin
        .from("properties")
        .update(row)
        .eq("id", data.id)
        .eq("org_id", data.orgId);
      if (error) throw new Error("Could not save the property.");
      await logAudit({
        orgId: data.orgId,
        actorId: context.userId,
        action: "property.updated",
        entityType: "property",
        entityId: data.id,
      });
      return { id: data.id };
    }

    const { data: created, error } = await supabaseAdmin.from("properties").insert(row).select("id").single();
    if (error || !created) throw new Error("Could not create the property.");
    await logAudit({
      orgId: data.orgId,
      actorId: context.userId,
      action: "property.created",
      entityType: "property",
      entityId: created.id,
      metadata: { name: data.name },
    });
    return { id: created.id };
  });

export const deleteProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireMembership, supabaseAdmin, ADMIN_ROLES, logAudit } = await import("./ops.server");
    await requireMembership(context.userId, data.orgId, ADMIN_ROLES);
    // Soft delete: history (tasks, photos, audit) must stay intact.
    const { error } = await supabaseAdmin
      .from("properties")
      .update({ active: false })
      .eq("id", data.id)
      .eq("org_id", data.orgId);
    if (error) throw new Error("Could not archive the property.");
    await logAudit({
      orgId: data.orgId,
      actorId: context.userId,
      action: "property.archived",
      entityType: "property",
      entityId: data.id,
    });
    return { ok: true };
  });
