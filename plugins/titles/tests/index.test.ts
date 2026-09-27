import type { TurnContext } from '@scn-chat/plugin-api'
import { setupForTest } from '@scn-chat/plugin-api/testing'
import { describe, expect, it, vi } from 'vitest'
import titles, { cleanTitle, optionsSchema, wantsTitle } from '../src/index.ts'

const text = (value: string) => ({
  $type: 'network.sharedcomputer.chat.defs#plainContent',
  parts: [{ $type: 'network.sharedcomputer.chat.defs#textPart', text: value }],
})

function turn(
  overrides: { info?: object; status?: string; preferences?: object } = {},
): TurnContext {
  return {
    user: 'did:plc:alice',
    conversation: {
      uri: 'at://did:plc:alice/space/c/1',
      info: { createdAt: 'now', ...overrides.info } as never,
    },
    preferences: overrides.preferences as never,
    userMessage: {
      rkey: 'u',
      record: {
        role: 'user',
        content: text('How do I tile a bathroom?'),
        createdAt: 'now',
      } as never,
    },
    reply: {
      rkey: 'u.r0',
      record: {
        role: 'assistant',
        status: overrides.status ?? 'complete',
        content: text('Start with...'),
        createdAt: 'now',
      } as never,
    },
    model: { provider: 'fake', id: 'reply-model' },
  }
}

async function run(
  context: TurnContext,
  generated: string | Error = 'Tiling a Bathroom',
  options = {},
) {
  const { hooks, ctx } = await setupForTest(titles(options))
  const generateText = vi.fn(async () => {
    if (generated instanceof Error) throw generated
    return { text: generated, finishReason: 'stop' }
  })
  const updateInfo = vi.fn(async () => {})
  const warn = vi.fn()
  Object.assign(ctx.models, { generateText })
  Object.assign(ctx.conversations, { updateInfo })
  Object.assign(ctx.logger, { warn })
  await (hooks[0]?.handler as (t: TurnContext) => Promise<void>)(context)
  return { generateText, updateInfo, warn }
}

describe('titles plugin', () => {
  it('writes a generated title after the first completed reply', async () => {
    const { updateInfo, generateText } = await run(turn())
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({ model: { provider: 'fake', id: 'reply-model' } }),
    )
    expect(updateInfo).toHaveBeenCalledWith(
      'did:plc:alice',
      'at://did:plc:alice/space/c/1',
      { title: 'Tiling a Bathroom', titleSource: 'generated' },
      { unlessUserTitled: true },
    )
  })

  it('uses the configured model instead of the reply model', async () => {
    const { generateText } = await run(turn(), 'T', { model: { provider: 'cheap', id: 'mini' } })
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({ model: { provider: 'cheap', id: 'mini' } }),
    )
  })

  it('logs a failed model call without writing anything', async () => {
    const { updateInfo, warn } = await run(turn(), new Error('provider down'))
    expect(updateInfo).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
  })

  it('treats an empty result as a failure', async () => {
    const { updateInfo } = await run(turn(), '  "" ')
    expect(updateInfo).not.toHaveBeenCalled()
  })

  it('names the finish reason when the result is empty', async () => {
    const { warn } = await run(turn(), '')
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.objectContaining({ message: expect.stringContaining('stop') }),
      }),
      'title generation failed',
    )
  })

  it('logs a warning and writes nothing when a completed reply has no model', async () => {
    const { updateInfo, warn } = await run({ ...turn(), model: undefined })
    expect(updateInfo).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
  })

  it('asks for no reasoning so the output budget goes to the title', async () => {
    const { generateText } = await run(turn())
    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({ effort: 'none' }))
  })
})

describe('wantsTitle', () => {
  it.each([
    ['an untitled conversation with a completed reply', turn(), true],
    ['a conversation that already has a title', turn({ info: { title: 'Existing' } }), false],
    ['a user title source even without a title', turn({ info: { titleSource: 'user' } }), false],
    ['titles turned off in preferences', turn({ preferences: { generateTitles: false } }), false],
    ['no preferences record', turn({ preferences: undefined }), true],
    ['an errored reply', turn({ status: 'error' }), false],
    ['a cancelled reply', turn({ status: 'cancelled' }), false],
    ['a pending reply', turn({ status: 'pending' }), false],
    ['an encrypted conversation', turn({ info: { sealed: {} } }), false],
    [
      'a conversation with no info record to hold the title',
      { ...turn(), conversation: { uri: 'at://did:plc:alice/space/c/1' } },
      false,
    ],
  ])('%s: %s', (_name, context, expected) => {
    expect(wantsTitle(context)).toBe(expected)
  })
})

describe('cleanTitle', () => {
  it('removes quotes, trailing periods, and extra whitespace', () => {
    expect(cleanTitle('  "Tiling   a\nBathroom."  ')).toBe('Tiling a Bathroom')
  })

  it('cuts long output to 300 graphemes', () => {
    expect([...cleanTitle('👩‍👩‍👧'.repeat(400))]).toHaveLength(300 * [...'👩‍👩‍👧'].length)
  })
})

describe('titles optionsSchema', () => {
  it('accepts valid options', () => {
    expect(
      optionsSchema.safeParse({ maxWords: 5, model: { provider: 'p', id: 'm' } }).success,
    ).toBe(true)
  })

  it('rejects invalid or unknown options', () => {
    expect(optionsSchema.safeParse({ maxWords: 0 }).success).toBe(false)
  })
})
