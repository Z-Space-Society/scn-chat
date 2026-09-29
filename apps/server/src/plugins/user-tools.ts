import type { Tool } from '@scn-chat/plugin-api'
import type { Db } from '../db/index.ts'

/** The user's stored on and off choices, by tool name. */
export async function readToolChoices(db: Db, did: string): Promise<Map<string, boolean>> {
  const rows = await db
    .selectFrom('user_tool_settings')
    .select(['tool', 'enabled'])
    .where('did', '=', did)
    .execute()
  return new Map(rows.map((row) => [row.tool, row.enabled === 1]))
}

export async function writeToolChoice(
  db: Db,
  did: string,
  tool: string,
  enabled: boolean,
): Promise<void> {
  const row = { enabled: enabled ? 1 : 0, updated_at: new Date().toISOString() }
  await db
    .insertInto('user_tool_settings')
    .values({ did, tool, ...row })
    .onConflict((oc) => oc.columns(['did', 'tool']).doUpdateSet(row))
    .execute()
}

/** Is the tool on for a user with these choices? Choices only count for tools users may switch. */
export function isToolEnabled(tool: Tool<never>, choices: Map<string, boolean>): boolean {
  const choice = tool.userToggle ? choices.get(tool.name) : undefined
  return choice ?? tool.defaultEnabled ?? false
}
