import type { ModelRef } from '@scn-chat/lexicons'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Composer } from '../../src/components/Composer.tsx'
import type { ModelOption } from '../../src/lib/models.ts'
import { modelsQuery } from '../../src/queries.ts'
import { stubFetch, writes } from '../helpers/fetch.ts'
import { renderAt } from '../helpers/router.tsx'

const models: ModelOption[] = [
  {
    provider: 'p',
    id: 'smart',
    name: 'Smart',
    capabilities: { vision: true, reasoning: true, tools: true },
    source: 'admin',
    default: true,
  },
  {
    provider: 'p',
    id: 'basic',
    name: 'Basic',
    capabilities: { vision: false, reasoning: false, tools: false },
    source: 'admin',
    default: false,
  },
]

/** A server offering the models above, with an admin default to fall back to unless overridden. */
const serve = (
  handler?: Parameters<typeof stubFetch>[0],
  defaultModel: ModelRef | null = { provider: 'p', id: 'smart' },
) => stubFetch(handler, { '/api/models': { models, defaultModel } })

/** Render the Composer once its models have loaded. */
async function renderComposer(ui: ReactNode) {
  await renderAt(ui)
  await screen.findByRole('option', { name: 'Smart' })
}

beforeEach(() => void serve())
afterEach(() => vi.unstubAllGlobals())

describe('Composer', () => {
  it('shows the effort select only for reasoning models', async () => {
    await renderComposer(<Composer skey="s" onSent={() => {}} />)
    expect(screen.queryByLabelText('Effort')).toBeNull()
    await userEvent.selectOptions(screen.getByLabelText('Model'), 'p/smart')
    expect(screen.getByLabelText('Effort')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Model'), 'p/basic')
    expect(screen.queryByLabelText('Effort')).toBeNull()
  })

  it('stops offering images for models without vision', async () => {
    await renderComposer(<Composer skey="s" onSent={() => {}} />)
    await vi.waitFor(() =>
      expect(screen.getByLabelText('Attach')).toHaveAttribute(
        'accept',
        'image/png,image/jpeg,application/pdf',
      ),
    )
    await userEvent.selectOptions(screen.getByLabelText('Model'), 'p/basic')
    expect(screen.getByLabelText('Attach')).toHaveAttribute('accept', 'application/pdf')
  })

  it('stops offering images once the chosen model is no longer offered', async () => {
    const { queryClient } = await renderAt(<Composer skey="s" onSent={() => {}} />)
    await screen.findByRole('option', { name: 'Smart' })
    await userEvent.selectOptions(screen.getByLabelText('Model'), 'p/smart')
    queryClient.setQueryData(modelsQuery.queryKey, { models: models.slice(1), defaultModel: null })
    expect(await screen.findByRole('option', { name: 'Unavailable: p/smart' })).toBeInTheDocument()
    expect(screen.getByLabelText('Attach')).toHaveAttribute('accept', 'application/pdf')
  })

  it('sends the text with the chosen model and effort on Enter', async () => {
    const fetch = serve(async () =>
      Response.json({ rkey: 'u1', replyRkey: 'u1.r0', status: 'claimed' }, { status: 201 }),
    )
    const onSent = vi.fn()
    await renderComposer(<Composer skey="s1" parent="p0" onSent={onSent} />)
    await userEvent.selectOptions(screen.getByLabelText('Model'), 'p/smart')
    await userEvent.selectOptions(screen.getByLabelText('Effort'), 'high')
    await userEvent.type(screen.getByPlaceholderText('Message'), 'Hello{Enter}')
    await vi.waitFor(() => expect(onSent).toHaveBeenCalledWith({ rkey: 'u1', replyRkey: 'u1.r0' }))
    const [url, init] = writes(fetch)[0] as [string, RequestInit]
    expect(String(url)).toBe('/api/conversations/s1/messages')
    expect(JSON.parse(String(init.body))).toMatchObject({
      parent: 'p0',
      parts: [{ text: 'Hello' }],
      generation: { model: { provider: 'p', id: 'smart' }, effort: 'high' },
    })
  })

  it('does not send an effort hidden by switching to a model without reasoning', async () => {
    const fetch = serve(async () =>
      Response.json({ rkey: 'u1', replyRkey: 'u1.r0', status: 'claimed' }, { status: 201 }),
    )
    await renderComposer(<Composer skey="s1" onSent={() => {}} />)
    await userEvent.selectOptions(screen.getByLabelText('Model'), 'p/smart')
    await userEvent.selectOptions(screen.getByLabelText('Effort'), 'max')
    await userEvent.selectOptions(screen.getByLabelText('Model'), 'p/basic')
    await userEvent.type(screen.getByPlaceholderText('Message'), 'Hello{Enter}')
    await vi.waitFor(() => expect(writes(fetch)).toHaveLength(1))
    const init = (writes(fetch)[0] as [string, RequestInit])[1]
    expect(JSON.parse(String(init.body)).generation).toEqual({
      model: { provider: 'p', id: 'basic' },
    })
  })

  it('does not send on Enter while an attachment is still uploading', async () => {
    const fetch = serve((url) =>
      url === '/api/attachments'
        ? new Promise<Response>(() => {})
        : Promise.resolve(Response.json({ rkey: 'u1', replyRkey: null, status: null })),
    )
    await renderComposer(<Composer skey="s1" onSent={() => {}} />)
    const file = new File(['%PDF'], 'report.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText('Attach'), file)
    await userEvent.type(screen.getByPlaceholderText('Message'), 'Read this{Enter}')
    expect(writes(fetch).map(([url]) => url)).toEqual(['/api/attachments'])
  })

  it('adds a newline on Shift+Enter instead of sending', async () => {
    const fetch = serve()
    await renderComposer(<Composer skey="s" onSent={() => {}} />)
    await userEvent.type(screen.getByPlaceholderText('Message'), 'a{Shift>}{Enter}{/Shift}b')
    expect(screen.getByPlaceholderText('Message')).toHaveValue('a\nb')
    expect(writes(fetch)).toEqual([])
  })

  it('asks for a model before sending when there is no default', async () => {
    const fetch = serve(
      async () =>
        Response.json({ rkey: 'u1', replyRkey: 'u1.r0', status: 'claimed' }, { status: 201 }),
      null,
    )
    await renderComposer(<Composer skey="s1" onSent={() => {}} />)
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled())
    expect(screen.queryByRole('option', { name: 'Default model' })).toBeNull()
    await userEvent.type(screen.getByPlaceholderText('Message'), 'Hello{Enter}')
    expect(writes(fetch)).toEqual([])
    await userEvent.selectOptions(screen.getByLabelText('Model'), 'p/basic')
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
    await userEvent.type(screen.getByPlaceholderText('Message'), '{Enter}')
    await vi.waitFor(() => expect(writes(fetch)).toHaveLength(1))
    const init = (writes(fetch)[0] as [string, RequestInit])[1]
    expect(JSON.parse(String(init.body))).toMatchObject({
      generation: { model: { provider: 'p', id: 'basic' } },
    })
  })
})
