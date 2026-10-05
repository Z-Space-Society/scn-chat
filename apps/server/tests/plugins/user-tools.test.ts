import type { Tool } from '@scn-chat/plugin-api'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { migrateToLatest } from '../../src/db/migrate.ts'
import { isToolEnabled, readToolChoices, writeToolChoice } from '../../src/plugins/user-tools.ts'
import { dialects } from '../helpers/db.ts'

const tool = (fields: Partial<Tool<never>>): Tool<never> => ({
  name: 'web_search',
  description: 'Search',
  inputSchema: z.never(),
  run: async () => '',
  ...fields,
})

describe('isToolEnabled', () => {
  it('follows the default when the user has no choice', () => {
    expect(isToolEnabled(tool({ defaultEnabled: true, userToggle: true }), new Map())).toBe(true)
  })

  it('is off when the tool has no default and no choice', () => {
    expect(isToolEnabled(tool({ userToggle: true }), new Map())).toBe(false)
  })

  it("uses the user's choice for a tool users may switch", () => {
    const choices = new Map([['web_search', true]])
    expect(isToolEnabled(tool({ userToggle: true }), choices)).toBe(true)
  })

  it("ignores the user's choice for a tool users may not switch", () => {
    const choices = new Map([['web_search', false]])
    expect(isToolEnabled(tool({ defaultEnabled: true }), choices)).toBe(true)
  })
})

describe.each(dialects)('tool choices on $name', ({ create }) => {
  it('round-trips a choice and overwrites it on a second write', async () => {
    const db = create()
    await migrateToLatest(db)
    await writeToolChoice(db, 'did:plc:alice', 'web_search', true)
    await writeToolChoice(db, 'did:plc:alice', 'web_search', false)
    await writeToolChoice(db, 'did:plc:bob', 'web_search', true)
    expect(await readToolChoices(db, 'did:plc:alice')).toEqual(new Map([['web_search', false]]))
  })
})
