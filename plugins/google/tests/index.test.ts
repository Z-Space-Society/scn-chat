import { setupForTest } from '@scn-chat/plugin-api/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import plugin, { optionsSchema } from '../src/index.ts'

afterEach(() => vi.unstubAllGlobals())

async function keyUsed(
  provider: Awaited<ReturnType<typeof setupForTest>>['providers'][number],
  apiKey?: string,
) {
  const fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: 'hi' }], role: 'model' }, finishReason: 'STOP' },
          ],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
  )
  vi.stubGlobal('fetch', fetch)
  const model = provider.createModel({ modelId: 'test-model', apiKey })
  await model.doGenerate({
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  } as never)
  const init = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1]
  return new Headers(init.headers).get('x-goog-api-key')
}

describe('google plugin', () => {
  it('registers the Google provider with its replay policy', async () => {
    const { providers } = await setupForTest(plugin({ apiKey: 'admin-key' }))
    expect(providers).toMatchObject([
      { id: 'google', name: 'Google', hasAdminKey: true, userKeys: true, replay: 'replay' },
    ])
  })

  it('reports no admin key when none is configured', async () => {
    const { providers } = await setupForTest(plugin())
    expect(providers[0]?.hasAdminKey).toBe(false)
  })

  it('can turn off user keys', async () => {
    const { providers } = await setupForTest(plugin({ userKeys: false }))
    expect(providers[0]?.userKeys).toBe(false)
  })

  it('uses the admin key when no user key is given', async () => {
    const { providers } = await setupForTest(plugin({ apiKey: 'admin-key' }))
    expect(await keyUsed(providers[0]!)).toContain('admin-key')
  })

  it('uses the user key over the admin key', async () => {
    const { providers } = await setupForTest(plugin({ apiKey: 'admin-key' }))
    expect(await keyUsed(providers[0]!, 'user-key')).toContain('user-key')
  })
})

describe('google optionsSchema', () => {
  it('accepts valid options', () => {
    expect(optionsSchema.safeParse({ userKeys: true }).success).toBe(true)
  })

  it('rejects invalid or unknown options', () => {
    expect(optionsSchema.safeParse({ key: 'typo' }).success).toBe(false)
  })
})
