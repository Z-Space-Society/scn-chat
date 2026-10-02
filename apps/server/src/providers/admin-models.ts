import type { Capabilities, ModelProvider } from '@scn-chat/plugin-api'
import { z } from 'zod'
import type { Issue } from '../body.ts'
import type { Db } from '../db/index.ts'
import type { Registry } from '../plugins/registry.ts'

/** A model everyone in its roles can use with the admin's key. */
export type AdminModel = {
  provider: string
  id: string
  name: string
  capabilities: Capabilities
  roles: string[]
  default: boolean
}

export const capabilitiesSchema = z.object({
  vision: z.boolean(),
  reasoning: z.boolean(),
  tools: z.boolean(),
})

export const adminModelSchema = z.object({
  provider: z.string().min(1),
  id: z.string().min(1),
  name: z.string().trim().min(1),
  capabilities: capabilitiesSchema,
  roles: z.array(z.string()).min(1, 'List at least one role'),
  default: z.boolean().default(false),
})

/** Can the provider serve admin models? */
export const servesAdminModels = (providers: Registry<ModelProvider>, id: string) =>
  providers.get(id)?.hasAdminKey === true

/** Problems with an admin model against the loaded providers and existing roles. */
export function adminModelIssues(
  model: AdminModel,
  providers: Registry<ModelProvider>,
  roleNames: ReadonlySet<string>,
): Issue[] {
  const issues: Issue[] = []
  const provider = providers.get(model.provider)
  if (!provider)
    issues.push({ path: ['provider'], message: `No plugin registers provider "${model.provider}"` })
  else if (!provider.hasAdminKey)
    issues.push({ path: ['provider'], message: `Provider "${model.provider}" has no admin key` })
  for (const role of model.roles) {
    if (!roleNames.has(role)) issues.push({ path: ['roles'], message: `No such role: ${role}` })
  }
  return issues
}

export async function listAdminModels(db: Db): Promise<AdminModel[]> {
  const rows = await db.selectFrom('admin_model').selectAll().orderBy('position').execute()
  return rows.map((row) => ({
    provider: row.provider,
    id: row.model_id,
    name: row.name,
    capabilities: JSON.parse(row.capabilities_json) as Capabilities,
    roles: JSON.parse(row.roles_json) as string[],
    default: row.is_default === 1,
  }))
}

/** Add or change a model. Marking it default clears the flag on every other model. */
export async function saveAdminModel(db: Db, model: AdminModel, adminDid: string) {
  const now = new Date().toISOString()
  await db.transaction().execute(async (tx) => {
    if (model.default) await tx.updateTable('admin_model').set({ is_default: 0 }).execute()
    const last = await tx
      .selectFrom('admin_model')
      .select((eb) => eb.fn.max('position').as('position'))
      .executeTakeFirst()
    const row = {
      name: model.name,
      capabilities_json: JSON.stringify(model.capabilities),
      roles_json: JSON.stringify(model.roles),
      is_default: model.default ? 1 : 0,
      updated_at: now,
      updated_by: adminDid,
    }
    await tx
      .insertInto('admin_model')
      .values({
        provider: model.provider,
        model_id: model.id,
        position: Number(last?.position ?? -1) + 1,
        created_at: now,
        ...row,
      })
      .onConflict((oc) => oc.columns(['provider', 'model_id']).doUpdateSet(row))
      .execute()
  })
}

/** Returns false when there was no such model. */
export async function deleteAdminModel(db: Db, provider: string, id: string): Promise<boolean> {
  const result = await db
    .deleteFrom('admin_model')
    .where('provider', '=', provider)
    .where('model_id', '=', id)
    .executeTakeFirst()
  return result.numDeletedRows > 0n
}

/** Put the models in this order. */
export async function reorderAdminModels(db: Db, refs: { provider: string; id: string }[]) {
  await db.transaction().execute(async (tx) => {
    for (const [position, ref] of refs.entries()) {
      await tx
        .updateTable('admin_model')
        .set({ position })
        .where('provider', '=', ref.provider)
        .where('model_id', '=', ref.id)
        .execute()
    }
  })
}
