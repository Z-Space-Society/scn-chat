import { isDeepStrictEqual } from 'node:util'
import { isValidDid } from '@atproto/syntax'
import { z } from 'zod'
import { apiKeysHolding } from '../auth/api-keys.ts'
import {
  addMember,
  hostnames,
  insertRole,
  listRoles,
  type RoleSummary,
  removeMember,
  removeRole,
  roleName,
  updateRole,
} from '../auth/role-store.ts'
import { ADMIN_ROLE, IMPLICIT_ROLE } from '../auth/roles.ts'
import { describeIssues, InvalidBody, type Issue, validate } from '../body.ts'
import type { Db } from '../db/index.ts'
import type { Logger } from '../logger.ts'
import { type InstalledPlugins, optionsJsonSchema, secretKeys } from '../plugins/installed.ts'
import { type PluginInstance, readInstances, replaceInstances } from '../plugins/instances.ts'
import {
  instantiate,
  PluginInstanceError,
  type PluginRuntime,
  type RuntimeBuilder,
  type RuntimeHolder,
} from '../plugins/runtime.ts'
import {
  type AdminModel,
  adminModelSchema,
  listAdminModels,
  replaceAdminModels,
  servesAdminModels,
} from '../providers/admin-models.ts'
import { jsonObject } from '../schemas.ts'
import type { SecretBox } from '../secrets.ts'
import { type SettingKey, type Settings, settingSchemas } from '../settings/schemas.ts'
import { SettingsStore } from '../settings/store.ts'

const INSTANCE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

const roleEntry = z.object({
  name: roleName,
  description: z.string().optional(),
  pdsHosts: hostnames.optional(),
  handleDomains: hostnames.optional(),
  members: z
    .array(z.string().refine((value): boolean => isValidDid(value), 'must be a DID'))
    .optional(),
})

type RoleEntry = z.infer<typeof roleEntry>

const pluginEntry = z.object({
  id: z.string().regex(INSTANCE_ID, `must match ${INSTANCE_ID}`),
  package: z.string().min(1),
  enabled: z.boolean().default(true),
  options: jsonObject.default({}),
  secrets: z.record(z.string(), z.unknown()).default({}),
  secretsSet: z.array(z.string()).optional(),
})

/** A server's whole admin configuration, as `site-config` exports and applies it. */
export const siteConfigSchema = z.object({
  version: z.literal(1),
  // A setting group left out keeps its stored value.
  settings: z.object(settingSchemas).partial(),
  roles: z.array(roleEntry),
  plugins: z.array(pluginEntry),
  models: z.array(adminModelSchema),
})

export type ConfigDocument = z.infer<typeof siteConfigSchema>

export type ApplyResult = { changed: boolean; changes: string[]; warnings: string[] }

export type SiteConfigDeps = {
  db: Db
  box: SecretBox
  settings: SettingsStore
  installed: InstalledPlugins
  holder: RuntimeHolder
  build: RuntimeBuilder
  logger: Logger
}

const SETTING_KEYS = Object.keys(settingSchemas) as SettingKey[]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Fields of the input that parsing dropped, however deep, such as a misspelled nested setting. */
function droppedFields(input: unknown, output: unknown, path: Issue['path'] = []): string[] {
  if (Array.isArray(input) && Array.isArray(output))
    return input.flatMap((item, i) => droppedFields(item, output[i], [...path, i]))
  if (!isRecord(input) || !isRecord(output)) return []
  return Object.entries(input).flatMap(([key, value]) =>
    key in output ? droppedFields(value, output[key], [...path, key]) : [[...path, key].join('.')],
  )
}

/** Does a plugin keep this role's members in sync? */
const pluginManaged = (role: RoleSummary) =>
  role.members.some((member) => member.addedBy.startsWith('plugin:'))

/** Added, updated, removed, and reordered entries between two keyed lists. */
function listChanges<T>(what: string, before: T[], after: T[], key: (item: T) => string): string[] {
  const old = new Map(before.map((item) => [key(item), item]))
  const changes: string[] = []
  for (const item of after) {
    const previous = old.get(key(item))
    if (!previous) changes.push(`${what} ${key(item)} added`)
    else if (!isDeepStrictEqual(previous, item)) changes.push(`${what} ${key(item)} updated`)
  }
  const kept = new Set(after.map(key))
  for (const item of before) if (!kept.has(key(item))) changes.push(`${what} ${key(item)} removed`)
  const order = (list: T[]) => list.map(key).filter((id) => kept.has(id) && old.has(id))
  if (!isDeepStrictEqual(order(before), order(after))) changes.push(`${what}s reordered`)
  return changes
}

/** Exporting the admin configuration, and making the server match a document of it. */
export class SiteConfig {
  private readonly deps: SiteConfigDeps

  constructor(deps: SiteConfigDeps) {
    this.deps = deps
  }

  async export(): Promise<z.input<typeof siteConfigSchema>> {
    const { db, box, settings } = this.deps
    const [roles, instances, models] = await Promise.all([
      listRoles(db),
      readInstances(db, box),
      listAdminModels(db),
    ])
    return {
      version: 1,
      settings: Object.fromEntries(
        SETTING_KEYS.map((key) => [key, settings.get(key)]),
      ) as ConfigDocument['settings'],
      roles: roles.map((role) => ({
        name: role.name,
        description: role.description,
        pdsHosts: role.pdsHosts,
        handleDomains: role.handleDomains,
        ...(pluginManaged(role) ? {} : { members: role.members.map((member) => member.did) }),
      })),
      plugins: instances.map((instance) => ({
        id: instance.id,
        package: instance.package,
        enabled: instance.enabled,
        options: instance.options,
        secretsSet: Object.keys(instance.secrets),
      })),
      models,
    }
  }

  /**
   * Make the server match the document. A document that would stop the server starting or break
   * its references is refused, and anything a plugin can recover from is stored with a warning.
   */
  apply(raw: unknown, by: string): Promise<ApplyResult> {
    const doc = validate(siteConfigSchema, raw)
    const warnings = droppedFields(raw, doc).map(
      (path) => `${path} isn't a known field, so it was left out`,
    )
    return this.deps.holder.exclusive(async () => {
      const result = await this.applyNow(doc, by)
      return { ...result, warnings: [...warnings, ...result.warnings] }
    })
  }

  private async applyNow(doc: ConfigDocument, by: string): Promise<ApplyResult> {
    const { db, box, holder } = this.deps
    const [roles, stored, models] = await Promise.all([
      listRoles(db),
      readInstances(db, box),
      listAdminModels(db),
    ])
    const removedRoles = roles.filter(
      (role) => role.name !== ADMIN_ROLE && !doc.roles.some((entry) => entry.name === role.name),
    )
    const proposed = this.proposeInstances(doc, stored)
    await this.check(doc, removedRoles, stored, proposed)
    const missing = SETTING_KEYS.filter((key) => doc.settings[key] === undefined)
    const warnings = [
      ...missing.map((key) => `settings.${key} isn't in the file, so it was left as it is`),
      ...this.pluginWarnings(doc, stored, proposed),
    ]
    const comparable = (instances: PluginInstance[]) =>
      instances.map((instance) => ({
        ...instance,
        unreadableSecrets: instance.unreadableSecrets ?? null,
      }))
    const settingChanges = SETTING_KEYS.filter(
      (key) =>
        doc.settings[key] !== undefined &&
        !isDeepStrictEqual(doc.settings[key], this.deps.settings.get(key)),
    )
    const roleChanges = this.roleChanges(doc, roles, removedRoles)
    const pluginChanges = listChanges(
      'plugin',
      comparable(stored),
      comparable(proposed),
      (i) => i.id,
    )
    const modelChanges = listChanges('model', models, doc.models, (m) => `${m.provider}/${m.id}`)
    const changes = [
      ...settingChanges.map((key) => `setting ${key} updated`),
      ...roleChanges,
      ...pluginChanges,
      ...modelChanges,
    ]
    const current = holder.current()
    if (!changes.length)
      return { changed: false, changes, warnings: [...warnings, ...health(doc, current)] }

    const runtime = pluginChanges.length ? await this.deps.build(proposed) : current
    try {
      await db.transaction().execute(async (tx) => {
        for (const key of settingChanges)
          await SettingsStore.write(tx, key, doc.settings[key] as Settings[typeof key], by)
        if (roleChanges.length) await writeRoles(tx, doc, roles, removedRoles, by)
        if (pluginChanges.length) await replaceInstances(tx, box, proposed, by)
        if (modelChanges.length) await replaceAdminModels(tx, doc.models as AdminModel[], by)
      })
    } catch (err) {
      if (runtime !== current) await runtime.host.close()
      throw err
    }
    if (runtime !== current) holder.swap(runtime)
    for (const key of settingChanges)
      this.deps.settings.adopt(key, doc.settings[key] as Settings[typeof key])
    this.deps.logger.info({ by, changes }, 'site config applied')
    return { changed: true, changes, warnings: [...warnings, ...health(doc, runtime)] }
  }

  /** Refuse a document whose references don't hold together, or that removes a role an API key holds. */
  private async check(
    doc: ConfigDocument,
    removedRoles: RoleSummary[],
    stored: PluginInstance[],
    proposed: PluginInstance[],
  ) {
    const issues: Issue[] = []
    const listed = new Set<string>()
    for (const [i, role] of doc.roles.entries()) {
      if (role.name === IMPLICIT_ROLE)
        issues.push({ path: ['roles', i, 'name'], message: `"${IMPLICIT_ROLE}" is built in` })
      else if (listed.has(role.name))
        issues.push({ path: ['roles', i, 'name'], message: `"${role.name}" is listed twice` })
      listed.add(role.name)
    }
    const roleNames = new Set([ADMIN_ROLE, IMPLICIT_ROLE, ...listed])
    const access = doc.settings.access ?? this.deps.settings.get('access')
    for (const [i, role] of access.inviteRoles.entries()) {
      if (!roleNames.has(role))
        issues.push({
          path: ['settings', 'access', 'inviteRoles', i],
          message: `No such role: ${role}`,
        })
    }
    for (const role of removedRoles) {
      for (const label of await apiKeysHolding(this.deps.db, role.name))
        issues.push({
          path: ['roles'],
          message: `The "${role.name}" role is held by the API key ${label}, so it can't be removed`,
        })
    }

    const ids = new Set<string>()
    for (const [i, entry] of doc.plugins.entries()) {
      if (ids.has(entry.id))
        issues.push({ path: ['plugins', i, 'id'], message: `"${entry.id}" is listed twice` })
      ids.add(entry.id)
      const installed = this.deps.installed.get(entry.package)
      if (
        installed &&
        !installed.multiple &&
        doc.plugins.findIndex((p) => p.package === entry.package) < i
      )
        issues.push({
          path: ['plugins', i, 'package'],
          message: `${entry.package} can only be added once`,
        })
    }
    issues.push(...this.pluginIdIssues(stored, proposed))

    const modelKeys = new Set<string>()
    for (const [i, model] of doc.models.entries()) {
      const key = `${model.provider}/${model.id}`
      if (modelKeys.has(key))
        issues.push({ path: ['models', i], message: `${key} is listed twice` })
      modelKeys.add(key)
      for (const role of model.roles) {
        if (!roleNames.has(role))
          issues.push({ path: ['models', i, 'roles'], message: `No such role: ${role}` })
      }
    }
    if (doc.models.filter((model) => model.default).length > 1)
      issues.push({ path: ['models'], message: 'Only one model can be the default' })

    if (issues.length) throw new InvalidBody(describeIssues(issues), issues)
  }

  /**
   * Refuse a change that renames a plugin, which strands what users stored under its old ID, or
   * that gives two enabled instances the same plugin.
   */
  private pluginIdIssues(stored: PluginInstance[], proposed: PluginInstance[]): Issue[] {
    const issues: Issue[] = []
    const byId = new Map(stored.map((instance) => [instance.id, instance]))
    const seen = new Set<string>()
    for (const [i, instance] of proposed.entries()) {
      const pluginId = this.pluginIdOf(instance)
      if (!pluginId) continue
      const before = byId.get(instance.id)
      const previous = before?.package === instance.package ? this.pluginIdOf(before) : undefined
      if (previous && previous !== pluginId)
        issues.push({
          path: ['plugins', i, 'options'],
          message: `This would rename the plugin from ${previous} to ${pluginId}. Add a new instance instead.`,
        })
      if (!instance.enabled) continue
      if (seen.has(pluginId))
        issues.push({ path: ['plugins', i], message: `Two plugins would use the ID ${pluginId}` })
      seen.add(pluginId)
    }
    return issues
  }

  /** The ID the instance's plugin has, when its package is installed and its options load. */
  private pluginIdOf(instance: PluginInstance): string | undefined {
    try {
      return instantiate(this.deps.installed, instance).id
    } catch (err) {
      if (err instanceof PluginInstanceError) return undefined
      throw err
    }
  }

  /** What the document asks of the plugins that they can live with, but a person should know. */
  private pluginWarnings(
    doc: ConfigDocument,
    stored: PluginInstance[],
    proposed: PluginInstance[],
  ): string[] {
    const byId = new Map(stored.map((instance) => [instance.id, instance]))
    return doc.plugins.flatMap((entry, i) => {
      const warnings: string[] = []
      const before = byId.get(entry.id)
      if (before && before.package !== entry.package && Object.keys(before.secrets).length)
        warnings.push(`plugin ${entry.id} changed package, so its stored secrets were dropped`)
      const kept = Object.keys(proposed[i]?.secrets ?? {}).sort()
      if (entry.secretsSet && !isDeepStrictEqual([...entry.secretsSet].sort(), kept))
        warnings.push(
          `plugin ${entry.id}'s secretsSet is only for reading, so it was ignored. To clear a secret, set it to null under secrets`,
        )
      const installed = this.deps.installed.get(entry.package)
      if (!installed) {
        if (Object.keys(entry.options).length)
          warnings.push(
            `plugin ${entry.id}'s package ${entry.package} isn't installed, so its secrets can't be told apart from its options. Give any secrets under secrets, or they are stored unencrypted`,
          )
        return warnings
      }
      const fields = this.optionFields(entry.package)
      const secrets = secretKeys(installed.optionsSchema)
      for (const key of Object.keys(entry.options).filter((key) => !fields.has(key)))
        warnings.push(
          `plugin ${entry.id} has no option ${key}; it's stored, and the plugin ignores it`,
        )
      for (const key of Object.keys(entry.secrets).filter((key) => !secrets.includes(key)))
        warnings.push(
          `plugin ${entry.id} has no secret ${key}; it's stored, and the plugin ignores it`,
        )
      return warnings
    })
  }

  private readonly fields = new Map<string, Set<string>>()

  /** The option fields a package's schema has. */
  private optionFields(pkg: string) {
    let fields = this.fields.get(pkg)
    if (!fields) {
      const plugin = this.deps.installed.get(pkg)
      fields = new Set(Object.keys((plugin && optionsJsonSchema(plugin).properties) ?? {}))
      this.fields.set(pkg, fields)
    }
    return fields
  }

  /**
   * The document's instances, keeping stored secrets it leaves out and clearing the ones it nulls.
   * A secret field under options moves to secrets, so it is stored encrypted.
   */
  private proposeInstances(doc: ConfigDocument, stored: PluginInstance[]): PluginInstance[] {
    const byId = new Map(stored.map((instance) => [instance.id, instance]))
    return doc.plugins.map((entry) => {
      const before = byId.get(entry.id)
      const same = before?.package === entry.package ? before : undefined
      const secretFields = secretKeys(this.deps.installed.get(entry.package)?.optionsSchema)
      const options = Object.fromEntries(
        Object.entries(entry.options).filter(([key]) => !secretFields.includes(key)),
      )
      const given = {
        ...Object.fromEntries(
          Object.entries(entry.options).filter(([key]) => secretFields.includes(key)),
        ),
        ...entry.secrets,
      }
      const secrets = { ...same?.secrets }
      for (const [key, value] of Object.entries(given)) {
        if (value === null) delete secrets[key]
        else secrets[key] = value
      }
      const cleared = Object.values(given).some((value) => value === null)
      return {
        id: entry.id,
        package: entry.package,
        enabled: entry.enabled,
        options,
        secrets,
        ...(same?.unreadableSecrets && !cleared
          ? { unreadableSecrets: same.unreadableSecrets }
          : {}),
      }
    })
  }

  private roleChanges(doc: ConfigDocument, roles: RoleSummary[], removed: RoleSummary[]) {
    const byName = new Map(roles.map((role) => [role.name, role]))
    const changes: string[] = []
    for (const entry of doc.roles) {
      const before = byName.get(entry.name)
      if (!before) {
        changes.push(`role ${entry.name} added`)
        continue
      }
      if (definitionChanged(entry, before)) changes.push(`role ${entry.name} updated`)
      if (entry.members && !sameMembers(entry.members, before))
        changes.push(`role ${entry.name} members updated`)
    }
    for (const role of removed) changes.push(`role ${role.name} removed`)
    return changes
  }
}

/** Plugins that aren't loaded and models users can't see, as the server is after an apply. */
function health(doc: ConfigDocument, runtime: PluginRuntime): string[] {
  const warnings: string[] = []
  for (const entry of doc.plugins) {
    const status = runtime.statuses.get(entry.id)
    if (status?.state === 'failed')
      warnings.push(`plugin ${entry.id} isn't loaded: ${status.error}`)
  }
  for (const model of doc.models) {
    if (!servesAdminModels(runtime.host.providers, model.provider))
      warnings.push(
        `model ${model.provider}/${model.id} is hidden from users, since no loaded plugin serves its provider with an admin key`,
      )
  }
  return warnings
}

const sameMembers = (members: string[], role: RoleSummary) =>
  isDeepStrictEqual(new Set(members), new Set(role.members.map((member) => member.did)))

/** Does the entry change any part of the role's definition it gives? */
const definitionChanged = (entry: RoleEntry, role: RoleSummary) =>
  (entry.description !== undefined && entry.description !== role.description) ||
  (entry.pdsHosts !== undefined && !isDeepStrictEqual(entry.pdsHosts, role.pdsHosts)) ||
  (entry.handleDomains !== undefined && !isDeepStrictEqual(entry.handleDomains, role.handleDomains))

/** Bring the stored roles and members in line with the document. */
async function writeRoles(
  db: Db,
  doc: ConfigDocument,
  roles: RoleSummary[],
  removed: RoleSummary[],
  by: string,
) {
  for (const role of removed) await removeRole(db, role.name)
  const byName = new Map(roles.map((role) => [role.name, role]))
  for (const entry of doc.roles) {
    const before = byName.get(entry.name)
    if (!before) await insertRole(db, entry)
    else if (definitionChanged(entry, before)) await updateRole(db, entry.name, entry)
    if (!entry.members || (before && sameMembers(entry.members, before))) continue
    const listed = new Set(entry.members)
    const current = new Set(before?.members.map((member) => member.did))
    for (const did of current) if (!listed.has(did)) await removeMember(db, entry.name, did)
    for (const did of listed) if (!current.has(did)) await addMember(db, entry.name, did, by)
  }
}
