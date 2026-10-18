import type { ModelRef } from '@scn-chat/lexicons'
import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act, createRef, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import type { OutgoingMessage } from '../../../../src/features/conversation/chat.ts'
import {
  Composer,
  type ComposerHandle,
} from '../../../../src/features/conversation/components/Composer.tsx'
import type { ModelOption } from '../../../../src/features/models/models.ts'
import { modelsQuery } from '../../../../src/features/models/queries.ts'
import { stubFetch, writes } from '../../../helpers/fetch.ts'
import { renderAt } from '../../../helpers/router.tsx'
import { choose, optionsOf } from '../../../helpers/select.ts'

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

/** Open the effort select and pick a level by its name. */
async function pickEffort(name: string) {
  await userEvent.click(screen.getByLabelText('Thinking effort'))
  // An option's name is its label, then its note.
  await userEvent.click(screen.getByRole('option', { name: new RegExp(`^${name}`) }))
}

const effortSelect = () => screen.queryByRole('combobox', { name: 'Thinking effort' })

/** Wait until the model list offers the models above. */
const modelsLoaded = () =>
  vi.waitFor(async () => expect(await optionsOf(screen.getByLabelText('Model'))).toContain('Smart'))

/** Render the Composer once its models have loaded. */
async function renderComposer(ui: ReactNode) {
  const rendered = await renderAt(ui)
  await modelsLoaded()
  return rendered
}

/** The chat's send, which the composer hands its message to. */
let send: Mock<(message: OutgoingMessage) => Promise<unknown>>
/** The message the composer sent first. */
const sentMessage = () => send.mock.calls[0]?.[0]

beforeEach(() => {
  serve()
  send = vi.fn(async () => {})
})
afterEach(() => vi.unstubAllGlobals())

describe('Composer', () => {
  it('offers effort beside the model only for reasoning models, the default included', async () => {
    await renderComposer(<Composer send={send} />)
    await vi.waitFor(() => expect(effortSelect()).toHaveTextContent('Default'))
    await choose(screen.getByLabelText('Model'), 'Basic')
    expect(effortSelect()).toBeNull()
    await choose(screen.getByLabelText('Model'), 'Smart')
    expect(screen.getByLabelText('Model')).toHaveTextContent(/^Smart$/)
    expect(effortSelect()).toHaveTextContent('Default')
    await choose(screen.getByLabelText('Model'), 'Basic')
    expect(effortSelect()).toBeNull()
  })

  it('names the model the default falls back to', async () => {
    await renderComposer(<Composer send={send} />)
    await vi.waitFor(() =>
      expect(screen.getByLabelText('Model')).toHaveTextContent('Default · Smart'),
    )
  })

  it('starts on the effort last chosen on this device', async () => {
    const first = await renderComposer(<Composer send={send} />)
    await choose(screen.getByLabelText('Model'), 'Smart')
    await pickEffort('High')
    first.unmount()
    await renderComposer(<Composer send={send} />)
    await choose(screen.getByLabelText('Model'), 'Smart')
    expect(effortSelect()).toHaveTextContent('High')
  })

  it('stops offering images for models without vision', async () => {
    await renderComposer(<Composer send={send} />)
    await vi.waitFor(() =>
      expect(screen.getByLabelText('Files to attach')).toHaveAttribute(
        'accept',
        'image/png,image/jpeg,application/pdf',
      ),
    )
    await choose(screen.getByLabelText('Model'), 'Basic')
    expect(screen.getByLabelText('Files to attach')).toHaveAttribute('accept', 'application/pdf')
  })

  it('stops offering images once the chosen model is no longer offered', async () => {
    const { queryClient } = await renderComposer(<Composer send={send} />)
    await choose(screen.getByLabelText('Model'), 'Smart')
    queryClient.setQueryData(modelsQuery.queryKey, { models: models.slice(1), defaultModel: null })
    await vi.waitFor(() =>
      expect(screen.getByLabelText('Model')).toHaveTextContent('Unavailable: p/smart'),
    )
    expect(screen.getByLabelText('Files to attach')).toHaveAttribute('accept', 'application/pdf')
  })

  it('sends the text with the chosen model and effort on Enter', async () => {
    await renderComposer(<Composer send={send} parent="p0" />)
    await choose(screen.getByLabelText('Model'), 'Smart')
    await pickEffort('High')
    await userEvent.type(screen.getByLabelText('Message'), 'Hello{Enter}')
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect(sentMessage()).toMatchObject({
      parent: 'p0',
      parts: [{ text: 'Hello' }],
      generation: { model: { provider: 'p', id: 'smart' }, effort: 'high' },
    })
    await vi.waitFor(() => expect(screen.getByLabelText('Message')).toHaveValue(''))
  })

  it('sends a quote on its own, and drops a removed one', async () => {
    const composer = createRef<ComposerHandle>()
    await renderComposer(<Composer ref={composer} send={send} />)
    act(() => composer.current?.quote('dropped'))
    act(() => composer.current?.quote('kept'))
    const removes = screen.getAllByRole('button', { name: 'Remove quote' })
    await userEvent.click(removes[0] as HTMLElement)
    expect(screen.getByRole('list', { name: 'Quotes' })).toHaveTextContent(/^kept$/)
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect(sentMessage()?.parts).toEqual([expect.objectContaining({ text: '> kept' })])
  })

  it('uploads the same file again when it is chosen twice', async () => {
    let uploads = 0
    const fetch = serve(async () => {
      uploads += 1
      const file = { ref: { $link: `bafy${uploads}` }, mimeType: 'application/pdf', size: 4 }
      return Response.json({ part: { file, name: 'report.pdf' } }, { status: 201 })
    })
    await renderComposer(<Composer send={send} />)
    const file = new File(['%PDF'], 'report.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText('Files to attach'), file)
    await userEvent.upload(screen.getByLabelText('Files to attach'), file)
    expect(writes(fetch)).toHaveLength(2)
    expect(screen.getByLabelText('Files to attach')).toHaveValue('')
  })

  it('uploads a PDF, shows its name, and sends it as an attachment part', async () => {
    const part = {
      $type: 'network.sharedcomputer.chat.defs#filePart',
      file: { $type: 'blob', ref: { $link: 'bafypdf' }, mimeType: 'application/pdf', size: 4 },
      name: 'report.pdf',
      extracted: {
        text: { $type: 'blob', ref: { $link: 'bafytext' }, mimeType: 'text/plain', size: 9 },
        method: 'pdf',
      },
    }
    const fetch = serve(async () => Response.json({ part }, { status: 201 }))
    await renderComposer(<Composer send={send} />)
    const file = new File(['%PDF'], 'report.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText('Files to attach'), file)
    expect(await screen.findByText('report.pdf')).toBeInTheDocument()
    expect(await screen.findByText('PDF · 4 B')).toBeInTheDocument()
    const [uploadUrl, uploadInit] = writes(fetch)[0] as [string, RequestInit]
    expect(uploadUrl).toBe('/api/attachments')
    expect(new Headers(uploadInit.headers).get('content-type')).toBe('application/pdf')
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled())
    await userEvent.type(screen.getByLabelText('Message'), 'Summarize this{Enter}')
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect(sentMessage()?.parts).toEqual([
      part,
      { $type: 'network.sharedcomputer.chat.defs#textPart', text: 'Summarize this' },
    ])
    await vi.waitFor(() => expect(screen.queryByText('report.pdf')).toBeNull())
  })

  it('removes an attachment while it uploads, cancelling the upload, and sends without it', async () => {
    let signal: AbortSignal | null | undefined
    serve((_url, init) => {
      signal = init?.signal
      return new Promise<Response>(() => {})
    })
    await renderComposer(<Composer send={send} />)
    await userEvent.upload(
      screen.getByLabelText('Files to attach'),
      new File(['%PDF'], 'report.pdf', { type: 'application/pdf' }),
    )
    expect(screen.getByText('Uploading…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Remove report.pdf' }))
    expect(screen.queryByText('report.pdf')).toBeNull()
    expect(signal?.aborted).toBe(true)
    await userEvent.type(screen.getByLabelText('Message'), 'Just text{Enter}')
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect(sentMessage()?.parts).toEqual([
      { $type: 'network.sharedcomputer.chat.defs#textPart', text: 'Just text' },
    ])
  })

  it('previews an attached image', async () => {
    serve(async () =>
      Response.json(
        { part: { image: { ref: { $link: 'bafyimg' }, mimeType: 'image/png', size: 3 } } },
        { status: 201 },
      ),
    )
    await renderComposer(<Composer send={send} />)
    await userEvent.upload(
      screen.getByLabelText('Files to attach'),
      new File(['png'], 'shot.png', { type: 'image/png' }),
    )
    const chip = screen.getByRole('listitem')
    expect(chip.querySelector('img')).toHaveAttribute('src', 'blob:preview')
    await vi.waitFor(() => expect(chip).toHaveAttribute('data-state', 'ready'))
  })

  it('says why it cannot send an image the chosen model cannot read', async () => {
    serve(async () =>
      Response.json(
        { part: { image: { ref: { $link: 'bafyimg' }, mimeType: 'image/png', size: 3 } } },
        { status: 201 },
      ),
    )
    await renderComposer(<Composer send={send} />)
    await userEvent.upload(
      screen.getByLabelText('Files to attach'),
      new File(['png'], 'shot.png', { type: 'image/png' }),
    )
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled())
    await choose(screen.getByLabelText('Model'), 'Basic')
    expect(screen.getByText(/This model can't read images/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('says why an upload failed and drops its attachment', async () => {
    serve(async () =>
      Response.json(
        {
          error: 'UnsupportedMediaType',
          message: "Files of type text/csv can't be attached. Choose a different file.",
        },
        { status: 415 },
      ),
    )
    await renderComposer(<Composer send={send} />)
    await userEvent.upload(
      screen.getByLabelText('Files to attach'),
      new File(['a,b'], 'data.csv', { type: 'text/csv' }),
      { applyAccept: false },
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't attach data.csv. Files of type text/csv can't be attached. Choose a different file.",
    )
    expect(screen.queryByText('data.csv')).toBeNull()
  })

  it('attaches pasted files, but pastes copied text as text', async () => {
    const fetch = serve(async () =>
      Response.json(
        { part: { file: { ref: { $link: 'bafy' } }, name: 'report.pdf' } },
        { status: 201 },
      ),
    )
    await renderComposer(<Composer send={send} />)
    const file = new File(['%PDF'], 'report.pdf', { type: 'application/pdf' })
    const box = screen.getByLabelText('Message')
    fireEvent.paste(box, { clipboardData: { files: [file], types: ['text/plain', 'Files'] } })
    expect(writes(fetch)).toHaveLength(0)
    fireEvent.paste(box, { clipboardData: { files: [file], types: ['Files'] } })
    expect(await screen.findByText('report.pdf')).toBeInTheDocument()
    expect(writes(fetch)).toHaveLength(1)
  })

  it('grows the box with its text where CSS cannot', async () => {
    const scrollHeight = vi
      .spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get')
      .mockReturnValue(120)
    const supports = vi.spyOn(CSS, 'supports').mockReturnValue(false)
    try {
      await renderComposer(<Composer send={send} />)
      await userEvent.type(screen.getByLabelText('Message'), 'a{Shift>}{Enter}{/Shift}b')
      expect(screen.getByLabelText('Message').style.height).toBe('120px')
    } finally {
      scrollHeight.mockRestore()
      supports.mockRestore()
    }
  })

  it('says neither Reply nor Ask anything, and sends nothing, while the messages are on their way', async () => {
    await renderComposer(<Composer send={send} waiting />)
    expect(screen.getByLabelText('Message')).toHaveAttribute('placeholder', '')
    await userEvent.type(screen.getByLabelText('Message'), 'Hello{Enter}')
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(send).not.toHaveBeenCalled()
  })

  it('offers Clear once there is something, and clearing drops the text and attachments', async () => {
    let signal: AbortSignal | null | undefined
    serve((_url, init) => {
      signal = init?.signal
      return new Promise<Response>(() => {})
    })
    await renderComposer(<Composer send={send} />)
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()
    await userEvent.type(screen.getByLabelText('Message'), 'Draft')
    await userEvent.upload(
      screen.getByLabelText('Files to attach'),
      new File(['%PDF'], 'report.pdf', { type: 'application/pdf' }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByLabelText('Message')).toHaveValue('')
    expect(screen.queryByText('report.pdf')).toBeNull()
    expect(signal?.aborted).toBe(true)
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()
    await vi.waitFor(() => expect(screen.getByLabelText('Message')).toHaveFocus())
  })

  it('opens the file picker from the attach button', async () => {
    await renderComposer(<Composer send={send} />)
    const click = vi.spyOn(screen.getByLabelText('Files to attach'), 'click')
    await userEvent.click(screen.getByRole('button', { name: 'Attach files' }))
    expect(click).toHaveBeenCalled()
  })

  it('says it is editing, and stops on Cancel or Escape', async () => {
    const onCancel = vi.fn()
    await renderComposer(<Composer send={send} initialText="Old" onCancel={onCancel} />)
    expect(screen.getByText(/Editing your message/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute(
      'title',
      'Send as a new version',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.type(screen.getByLabelText('Message'), '{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(2)
  })

  it('adds a newline on Shift+Enter instead of sending', async () => {
    await renderComposer(<Composer send={send} />)
    await userEvent.type(screen.getByLabelText('Message'), 'a{Shift>}{Enter}{/Shift}b')
    expect(screen.getByLabelText('Message')).toHaveValue('a\nb')
    expect(send).not.toHaveBeenCalled()
  })

  it('adds a newline on Enter on a touch screen, leaving Send to send', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(hover: none)' }))
    await renderComposer(<Composer send={send} />)
    await userEvent.type(screen.getByLabelText('Message'), 'a{Enter}b')
    expect(screen.getByLabelText('Message')).toHaveValue('a\nb')
    expect(send).not.toHaveBeenCalled()
  })

  it('leaves Enter to an input method while it composes', async () => {
    await renderComposer(<Composer send={send} />)
    const box = screen.getByLabelText('Message')
    await userEvent.type(box, 'nihon')
    fireEvent.keyDown(box, { key: 'Enter', isComposing: true })
    await userEvent.type(box, 'go{Enter}')
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect(sentMessage()).toMatchObject({ parts: [{ text: 'nihongo' }] })
  })

  it('refuses to send, even with an inherited model, when the user has no models at all', async () => {
    stubFetch(undefined, { '/api/models': { models: [], defaultModel: null } })
    await renderAt(<Composer send={send} inherited={{ provider: 'p', id: 'smart' }} />)
    expect(await screen.findByText(/No models are available to you/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Message'), 'Hello{Enter}')
    expect(send).not.toHaveBeenCalled()
  })

  it('asks for a model before sending when there is no default', async () => {
    serve(undefined, null)
    await renderComposer(<Composer send={send} />)
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled())
    expect(await optionsOf(screen.getByLabelText('Model'))).not.toContain('Default model')
    await userEvent.type(screen.getByLabelText('Message'), 'Hello{Enter}')
    expect(send).not.toHaveBeenCalled()
    await choose(screen.getByLabelText('Model'), 'Basic')
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
    await userEvent.type(screen.getByLabelText('Message'), '{Enter}')
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect(sentMessage()).toMatchObject({ generation: { model: { provider: 'p', id: 'basic' } } })
  })
})
