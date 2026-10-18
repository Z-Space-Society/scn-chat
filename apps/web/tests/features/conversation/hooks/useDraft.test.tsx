import type { ModelRef } from '@scn-chat/lexicons'
import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import type { OutgoingMessage } from '../../../../src/features/conversation/chat.ts'
import {
  type DraftOptions,
  useDraft,
} from '../../../../src/features/conversation/hooks/useDraft.ts'
import { type ModelOption, modelRef } from '../../../../src/features/models/models.ts'
import { createQueryClient } from '../../../../src/router.tsx'
import { stubFetch } from '../../../helpers/fetch.ts'

const smart: ModelOption = {
  provider: 'p',
  id: 'smart',
  name: 'Smart',
  capabilities: { vision: true, reasoning: true, tools: true },
  source: 'admin',
  default: true,
}
const basic: ModelOption = {
  provider: 'p',
  id: 'basic',
  name: 'Basic',
  capabilities: { vision: false, reasoning: false, tools: false },
  source: 'admin',
  default: false,
}

/** A server offering both models, falling back to `defaultModel`, answering uploads with `upload`. */
const serve = (
  options: {
    defaultModel?: ModelRef | null
    models?: ModelOption[]
    upload?: (init?: RequestInit) => Promise<Response>
  } = {},
) =>
  stubFetch(
    (_url, init) =>
      options.upload?.(init) ??
      Promise.resolve(
        Response.json({ part: { file: { ref: { $link: 'bafy' } }, name: 'f' } }, { status: 201 }),
      ),
    {
      '/api/models': {
        models: options.models ?? [smart, basic],
        defaultModel: options.defaultModel === undefined ? smart : options.defaultModel,
      },
    },
  )

let send: Mock<(message: OutgoingMessage) => Promise<unknown>>

/** The draft, once its models and preferences have loaded. */
async function renderDraft(options: Partial<DraftOptions> = {}) {
  const queryClient = createQueryClient()
  const wrapper = (props: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
  )
  const hook = renderHook(() => useDraft({ send, ...options }), { wrapper })
  await vi.waitFor(() => expect(hook.result.current.loading).toBe(false))
  return hook
}

type Draft = ReturnType<typeof useDraft>

const pdf = () => new File(['%PDF'], 'report.pdf', { type: 'application/pdf' })
const png = () => new File(['png'], 'shot.png', { type: 'image/png' })
const choose = (draft: Draft, model: ModelRef) =>
  act(() => draft.form.setFieldValue('model', modelRef(model)))

beforeEach(() => {
  serve()
  send = vi.fn(async () => {})
})
afterEach(() => vi.unstubAllGlobals())

describe('useDraft', () => {
  it('can send only once there is text, a quote, or an uploaded attachment', async () => {
    const { result } = await renderDraft()
    expect(result.current.canSend).toBe(false)
    act(() => result.current.setText('   '))
    expect(result.current.canSend).toBe(false)
    act(() => result.current.setText(''))
    act(() => result.current.quote('A passage'))
    expect(result.current.canSend).toBe(true)
    act(() => result.current.clear())
    act(() => result.current.attach([pdf()]))
    await vi.waitFor(() => expect(result.current.canSend).toBe(true))
  })

  it('waits for uploads, the chat, and a running reply before sending', async () => {
    serve({ upload: () => new Promise(() => {}) })
    const uploading = await renderDraft()
    act(() => uploading.result.current.setText('Hi'))
    act(() => uploading.result.current.attach([pdf()]))
    expect(uploading.result.current.canSend).toBe(false)
    act(() => uploading.result.current.send())
    expect(send).not.toHaveBeenCalled()
    for (const options of [{ waiting: true }, { running: true }]) {
      const { result } = await renderDraft(options)
      act(() => result.current.setText('Hi'))
      expect(result.current.canSend).toBe(false)
      act(() => result.current.send())
    }
    expect(send).not.toHaveBeenCalled()
  })

  it('sends once when asked again while the message is on its way', async () => {
    send.mockReturnValue(new Promise(() => {}))
    const { result } = await renderDraft()
    act(() => result.current.setText('Hello'))
    await act(async () => {
      result.current.send()
      result.current.send()
    })
    expect(send).toHaveBeenCalledTimes(1)
    expect(result.current.canSend).toBe(false)
  })

  it('opens the message with its quotes, and sends quotes alone without a trailing blank line', async () => {
    const { result } = await renderDraft({ parent: 'p0' })
    act(() => result.current.quote('first\nline'))
    act(() => result.current.quote('second'))
    act(() => result.current.setText('My question'))
    act(() => result.current.send())
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      parent: 'p0',
      parts: [{ text: '> first\n> line\n\n> second\n\nMy question' }],
    })
    await vi.waitFor(() => expect(result.current.empty).toBe(true))
    act(() => result.current.quote('alone'))
    act(() => result.current.send())
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2))
    expect(send.mock.calls[1]?.[0]?.parts).toEqual([expect.objectContaining({ text: '> alone' })])
  })

  it('keeps a quote added while the message was on its way', async () => {
    let arrive = () => {}
    send.mockReturnValue(new Promise<void>((resolve) => (arrive = resolve)))
    const { result } = await renderDraft()
    act(() => result.current.quote('sent'))
    act(() => result.current.send())
    act(() => result.current.quote('later'))
    await act(async () => arrive())
    expect(result.current.quotes.map((quote) => quote.text)).toEqual(['later'])
  })

  it('sends the effort only while the answering model reasons', async () => {
    const { result } = await renderDraft()
    act(() => result.current.form.setFieldValue('effort', 'high'))
    choose(result.current, basic)
    expect(result.current.reasons).toBe(false)
    act(() => result.current.setText('Hello'))
    act(() => result.current.send())
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect(send.mock.calls[0]?.[0]?.generation).toEqual({ model: { provider: 'p', id: 'basic' } })
  })

  it('takes its capabilities from the fallback model when none is chosen', async () => {
    serve({ defaultModel: modelRef(basic) })
    const { result } = await renderDraft()
    expect(result.current.seesImages).toBe(false)
    expect(result.current.reasons).toBe(false)
    choose(result.current, smart)
    expect(result.current.seesImages).toBe(true)
    expect(result.current.reasons).toBe(true)
  })

  it('leaves images to the server under a fallback the catalog does not list', async () => {
    const { result } = await renderDraft({ inherited: { provider: 'p', id: 'gone' } })
    expect(result.current.seesImages).toBe(true)
    expect(result.current.blocked).toBeNull()
  })

  it('blocks an image attached before switching to a model that cannot read it', async () => {
    const { result } = await renderDraft()
    act(() => result.current.attach([png()]))
    await vi.waitFor(() => expect(result.current.canSend).toBe(true))
    choose(result.current, basic)
    expect(result.current.blocked).toBe('images')
    expect(result.current.canSend).toBe(false)
    act(() => result.current.send())
    expect(send).not.toHaveBeenCalled()
    choose(result.current, smart)
    expect(result.current.canSend).toBe(true)
  })

  it('turns an image away when the model cannot read it', async () => {
    const { result } = await renderDraft()
    choose(result.current, basic)
    act(() => result.current.attach([png()]))
    expect(result.current.attachments).toHaveLength(0)
    expect(result.current.error).toMatch(/can't read images/)
  })

  it('asks for a model when there is nothing to fall back to', async () => {
    serve({ defaultModel: null })
    const { result } = await renderDraft()
    act(() => result.current.setText('Hello'))
    expect(result.current.blocked).toBe('needsModel')
    expect(result.current.canSend).toBe(false)
    choose(result.current, basic)
    expect(result.current.blocked).toBeNull()
    expect(result.current.canSend).toBe(true)
  })

  it('refuses to send, even with an inherited model, when there are no models at all', async () => {
    serve({ models: [], defaultModel: null })
    const { result } = await renderDraft({ inherited: { provider: 'p', id: 'smart' } })
    act(() => result.current.setText('Hello'))
    expect(result.current.blocked).toBe('noModels')
    expect(result.current.canSend).toBe(false)
  })
})
