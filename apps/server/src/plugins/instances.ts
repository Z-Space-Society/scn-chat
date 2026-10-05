import type { Db } from '../db/index.ts'
import type { SecretBox } from '../secrets.ts'

/** A configured plugin, with its options split into plain values and secrets. */
export type PluginInstance = {
  id: string
  package: string
  enabled: boolean
  options: Record<string, unknown>
  secrets: Record<string, unknown>
}

/** Every plugin instance, in load order, with secrets decrypted. */
export async function readInstances(db: Db, box: SecretBox): Promise<PluginInstance[]> {
  const rows = await db.selectFrom('plugin_instance').selectAll().orderBy('position').execute()
  return rows.map((row) => ({
    id: row.id,
    package: row.package,
    enabled: row.enabled === 1,
    options: JSON.parse(row.options_json) as Record<string, unknown>,
    secrets: row.secrets_encrypted
      ? (JSON.parse(box.decrypt(row.secrets_encrypted)) as Record<string, unknown>)
      : {},
  }))
}

/** Replace the stored instances with this list, in this order. */
export async function writeInstances(
  db: Db,
  box: SecretBox,
  instances: PluginInstance[],
  adminDid: string,
): Promise<void> {
  const now = new Date().toISOString()
  await db.transaction().execute(async (tx) => {
    const ids = instances.map((instance) => instance.id)
    let removal = tx.deleteFrom('plugin_instance')
    if (ids.length) removal = removal.where('id', 'not in', ids)
    await removal.execute()
    for (const [position, instance] of instances.entries()) {
      const row = {
        package: instance.package,
        position,
        enabled: instance.enabled ? 1 : 0,
        options_json: JSON.stringify(instance.options),
        secrets_encrypted: Object.keys(instance.secrets).length
          ? box.encrypt(JSON.stringify(instance.secrets))
          : null,
        updated_at: now,
        updated_by: adminDid,
      }
      await tx
        .insertInto('plugin_instance')
        .values({ id: instance.id, created_at: now, ...row })
        .onConflict((oc) => oc.column('id').doUpdateSet(row))
        .execute()
    }
  })
}
