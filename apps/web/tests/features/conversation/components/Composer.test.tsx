import type { ModelRef } from '@scn-chat/lexicons'
import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act, createRef, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

/** Open the model menu, then its effort submenu, and pick a level in it by its name. */
async function pickEffort(name: string) {
  await userEvent.click(screen.getByLabelText('Model'))
  await userEvent.click(screen.getByRole('option', { name: /^Thinking effort/ }))
  const efforts = screen.getByRole('listbox', { name: 'Thinking effort' })
  // An option's name is its label, then its note.
  await userEvent.click(within(efforts).getByRole('option', { name: new RegExp(`^${name}`) }))
}

/** Wait until the model list offers the models above. */
const modelsLoaded = () =>
  vi.waitFor(async () => expect(await optionsOf(screen.getByLabelText('Model'))).toContain('Smart'))

/** Render the Composer once its models have loaded. */
async function renderComposer(ui: ReactNode) {
  const rendered = await renderAt(ui)
  await modelsLoaded()
  return rendered
}

beforeEach(() => void serve())
afterEach(() => vi.unstubAllGlobals())

describe('Composer', () => {
  it('offers effort in the model menu only for reasoning models', async () => {
    /** Whether the open model menu has a thinking effort submenu, read by opening and closing it. */
    const offersEffort = async () => {
      await userEvent.click(screen.getByLabelText('Model'))
      const found = screen.queryByRole('option', { name: /^Thinking effort/ }) !== null
      await userEvent.keyboard('{Escape}')
      return found
    }
    await renderComposer(<Composer skey="s" onSent={() => {}} />)
    expect(await offersEffort()).toBe(false)
    await choose(screen.getByLabelText('Model'), 'Smart')
    expect(screen.getByLabelText('Model')).toHaveTextContent('SmartDefault')
    expect(await offersEffort()).toBe(true)
    await choose(screen.getByLabelText('Model'), 'Basic')
    expect(screen.getByLabelText('Model')).toHaveTextContent(/^Basic$/)
    expect(await offersEffort()).toBe(false)
  })

  it('names the model the default falls back to', async () => {
    await renderComposer(<Composer skey="s" onSent={() => {}} />)
    await vi.waitFor(() =>
      expect(screen.getByLabelText('Model')).toHaveTextContent('Default · Smart'),
    )
  })

  it('names the model alone while thinking is off', async () => {
    await renderComposer(<Composer skey="s" onSent={() => {}} />)
    await choose(screen.getByLabelText('Model'), 'Smart')
    await pickEffort('Off')
    expect(screen.getByLabelText('Model')).toHaveTextContent(/^Smart$/)
  })

  it('starts on the effort last chosen on this device', async () => {
    const first = await renderComposer(<Composer skey="s" onSent={() => {}} />)
    await choose(screen.getByLabelText('Model'), 'Smart')
    await pickEffort('High')
    first.unmount()
    await renderComposer(<Composer skey="s" onSent={() => {}} />)
    await choose(screen.getByLabelText('Model'), 'Smart')
    expect(screen.getByLabelText('Model')).toHaveTextContent('High')
  })

  it('stops offering images for models without vision', async () => {
    await renderComposer(<Composer skey="s" onSent={() => {}} />)
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
    const { queryClient } = await renderComposer(<Composer skey="s" onSent={() => {}} />)
    await choose(screen.getByLabelText('Model'), 'Smart')
    queryClient.setQueryData(modelsQuery.queryKey, { models: models.slice(1), defaultModel: null })
    await vi.waitFor(() =>
      expect(screen.getByLabelText('Model')).toHaveTextContent('Unavailable: p/smart'),
    )
    expect(screen.getByLabelText('Files to attach')).toHaveAttribute('accept', 'application/pdf')
  })

  it('sends the text with the chosen model and effort on Enter', async () => {
    const fetch = serve(async () =>
      Response.json({ rkey: 'u1', replyRkey: 'u1.r0', status: 'claimed' }, { status: 201 }),
    )
    const onSent = vi.fn()
    await renderComposer(<Composer skey="s1" parent="p0" onSent={onSent} />)
    await choose(screen.getByLabelText('Model'), 'Smart')
    await pickEffort('High')
    await userEvent.type(screen.getByLabelText('Message'), 'Hello{Enter}')
    await vi.waitFor(() =>
      expect(onSent).toHaveBeenCalledWith({ skey: 's1', rkey: 'u1', replyRkey: 'u1.r0' }),
    )
    const [url, init] = writes(fetch)[0] as [string, RequestInit]
    expect(String(url)).toBe('/api/conversations/s1/messages')
    expect(JSON.parse(String(init.body))).toMatchObject({
      parent: 'p0',
      parts: [{ text: 'Hello' }],
      generation: { model: { provider: 'p', id: 'smart' }, effort: 'high' },
    })
  })

  it('sends a quote on its own, and drops a removed one', async () => {
    const fetch = serve(async () =>
      Response.json({ rkey: 'u1', replyRkey: 'u1.r0', status: 'claimed' }, { status: 201 }),
    )
    const composer = createRef<ComposerHandle>()
    await renderComposer(<Composer ref={composer} skey="s1" onSent={() => {}} />)
    act(() => composer.current?.quote('dropped'))
    act(() => composer.current?.quote('kept'))
    const removes = screen.getAllByRole('button', { name: 'Remove quote' })
    await userEvent.click(removes[0] as HTMLElement)
    expect(screen.getByRole('list', { name: 'Quotes' })).toHaveTextContent(/^kept$/)
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    await vi.waitFor(() => expect(writes(fetch)).toHaveLength(1))
    const init = (writes(fetch)[0] as [string, RequestInit])[1]
    expect(JSON.parse(String(init.body)).parts).toEqual([
      expect.objectContaining({ text: '> kept' }),
    ])
  })

  it('does not send an effort hidden by switching to a model without reasoning', async () => {
    const fetch = serve(async () =>
      Response.json({ rkey: 'u1', replyRkey: 'u1.r0', status: 'claimed' }, { status: 201 }),
    )
    await renderComposer(<Composer skey="s1" onSent={() => {}} />)
    await choose(screen.getByLabelText('Model'), 'Smart')
    await pickEffort('Extra')
    await choose(screen.getByLabelText('Model'), 'Basic')
    await userEvent.type(screen.getByLabelText('Message'), 'Hello{Enter}')
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
    await userEvent.upload(screen.getByLabelText('Files to attach'), file)
    await userEvent.type(screen.getByLabelText('Message'), 'Read this{Enter}')
    expect(writes(fetch).map(([url]) => url)).toEqual(['/api/attachments'])
  })

  it('creates the chat on the first message without one, and reuses it when trying again', async () => {
    let sends = 0
    const fetch = serve(async (url) => {
      if (url === '/api/conversations') return Response.json({ skey: 'new' }, { status: 201 })
      sends += 1
      if (sends === 1) return Response.json({ error: 'Busy' }, { status: 503 })
      return Response.json({ rkey: 'u1', replyRkey: 'u1.r0', status: 'claimed' }, { status: 201 })
    })
    const onSent = vi.fn()
    await renderComposer(<Composer onSent={onSent} />)
    await userEvent.type(screen.getByLabelText('Message'), 'Hello{Enter}')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    await vi.waitFor(() =>
      expect(onSent).toHaveBeenCalledWith({ skey: 'new', rkey: 'u1', replyRkey: 'u1.r0' }),
    )
    expect(writes(fetch).map(([url]) => url)).toEqual([
      '/api/conversations',
      '/api/conversations/new/messages',
      '/api/conversations/new/messages',
    ])
  })

  it('sends once when Enter is pressed again while the message is on its way', async () => {
    const fetch = serve(() => new Promise<Response>(() => {}))
    await renderComposer(<Composer skey="s1" onSent={() => {}} />)
    await userEvent.type(screen.getByLabelText('Message'), 'Hello{Enter}{Enter}')
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(writes(fetch)).toHaveLength(1)
  })

  it('uploads the same file again when it is chosen twice', async () => {
    let uploads = 0
    const fetch = serve(async () => {
      uploads += 1
      const file = { ref: { $link: `bafy${uploads}` }, mimeType: 'application/pdf', size: 4 }
      return Response.json({ part: { file, name: 'report.pdf' } }, { status: 201 })
    })
    await renderComposer(<Composer skey="s1" onSent={() => {}} />)
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
    const fetch = serve(async (url) =>
      url === '/api/attachments'
        ? Response.json({ part }, { status: 201 })
        : Response.json({ rkey: 'u1', replyRkey: 'u1.r0', status: 'claimed' }, { status: 201 }),
    )
    await renderComposer(<Composer skey="s1" onSent={() => {}} />)
    const file = new File(['%PDF'], 'report.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText('Files to attach'), file)
    expect(await screen.findByText('report.pdf')).toBeInTheDocument()
    expect(await screen.findByText('PDF · 4 B')).toBeInTheDocument()
    const [uploadUrl, uploadInit] = writes(fetch)[0] as [string, RequestInit]
    expect(uploadUrl).toBe('/api/attachments')
    expect(new Headers(uploadInit.headers).get('content-type')).toBe('application/pdf')
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled())
    await userEvent.type(screen.getByLabelText('Message'), 'Summarize this{Enter}')
    await vi.waitFor(() => expect(writes(fetch)).toHaveLength(2))
    const [url, init] = writes(fetch)[1] as [string, RequestInit]
    expect(String(url)).toBe('/api/conversations/s1/messages')
    expect(JSON.parse(String(init.body)).parts).toEqual([
      part,
      { $type: 'network.sharedcomputer.chat.defs#textPart', text: 'Summarize this' },
    ])
    await vi.waitFor(() => expect(screen.queryByText('report.pdf')).toBeNull())
  })

  it('removes an attachment while it uploads, cancelling the upload, and sends without it', async () => {
    let signal: AbortSignal | null | undefined
    const fetch = serve((url, init) => {
      if (url !== '/api/attachments')
        return Promise.resolve(Response.json({ rkey: 'u1', replyRkey: null, status: null }))
      signal = init?.signal
      return new Promise<Response>(() => {})
    })
    await renderComposer(<Composer skey="s1" onSent={() => {}} />)
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
    await vi.waitFor(() => expect(writes(fetch)).toHaveLength(2))
    const [, init] = writes(fetch)[1] as [string, RequestInit]
    expect(JSON.parse(String(init.body)).parts).toEqual([
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
    await renderComposer(<Composer skey="s1" onSent={() => {}} />)
    await userEvent.upload(
      screen.getByLabelText('Files to attach'),
      new File(['png'], 'shot.png', { type: 'image/png' }),
    )
    const chip = screen.getByRole('listitem')
    expect(chip.querySelector('img')).toHaveAttribute('src', 'blob:preview')
    await vi.waitFor(() => expect(chip).toHaveAttribute('data-state', 'ready'))
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
    await renderComposer(<Composer skey="s1" onSent={() => {}} />)
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
    await renderComposer(<Composer skey="s1" onSent={() => {}} />)
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
      await renderComposer(<Composer skey="s1" onSent={() => {}} />)
      await userEvent.type(screen.getByLabelText('Message'), 'a{Shift>}{Enter}{/Shift}b')
      expect(screen.getByLabelText('Message').style.height).toBe('120px')
    } finally {
      scrollHeight.mockRestore()
      supports.mockRestore()
    }
  })

  it('disables Send until there is text or an attachment to send', async () => {
    serve(async () =>
      Response.json(
        { part: { file: { ref: { $link: 'bafy' } }, name: 'report.pdf' } },
        { status: 201 },
      ),
    )
    await renderComposer(<Composer skey="s1" onSent={() => {}} />)
    const sendButton = screen.getByRole('button', { name: 'Send' })
    expect(sendButton).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Message'), '   ')
    expect(sendButton).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Message'), 'Hi')
    expect(sendButton).toBeEnabled()
    await userEvent.clear(screen.getByLabelText('Message'))
    expect(sendButton).toBeDisabled()
    await userEvent.upload(
      screen.getByLabelText('Files to attach'),
      new File(['%PDF'], 'report.pdf', { type: 'application/pdf' }),
    )
    await vi.waitFor(() => expect(sendButton).toBeEnabled())
  })

  it('offers Clear once there is something, and clearing drops the text and attachments', async () => {
    let signal: AbortSignal | null | undefined
    serve((_url, init) => {
      signal = init?.signal
      return new Promise<Response>(() => {})
    })
    await renderComposer(<Composer skey="s1" onSent={() => {}} />)
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
    await renderComposer(<Composer skey="s" onSent={() => {}} />)
    const click = vi.spyOn(screen.getByLabelText('Files to attach'), 'click')
    await userEvent.click(screen.getByRole('button', { name: 'Attach files' }))
    expect(click).toHaveBeenCalled()
  })

  it('says it is editing, and stops on Cancel or Escape', async () => {
    const onCancel = vi.fn()
    await renderComposer(
      <Composer skey="s" initialText="Old" onSent={() => {}} onCancel={onCancel} />,
    )
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
    const fetch = serve()
    await renderComposer(<Composer skey="s" onSent={() => {}} />)
    await userEvent.type(screen.getByLabelText('Message'), 'a{Shift>}{Enter}{/Shift}b')
    expect(screen.getByLabelText('Message')).toHaveValue('a\nb')
    expect(writes(fetch)).toEqual([])
  })

  it('adds a newline on Enter on a touch screen, leaving Send to send', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(hover: none)' }))
    const fetch = serve()
    await renderComposer(<Composer skey="s" onSent={() => {}} />)
    await userEvent.type(screen.getByLabelText('Message'), 'a{Enter}b')
    expect(screen.getByLabelText('Message')).toHaveValue('a\nb')
    expect(writes(fetch)).toEqual([])
  })

  it('leaves Enter to an input method while it composes', async () => {
    const fetch = serve(async () =>
      Response.json({ rkey: 'u1', replyRkey: 'u1.r0', status: 'claimed' }, { status: 201 }),
    )
    const onSent = vi.fn()
    await renderComposer(<Composer skey="s" onSent={onSent} />)
    const box = screen.getByLabelText('Message')
    await userEvent.type(box, 'nihon')
    fireEvent.keyDown(box, { key: 'Enter', isComposing: true })
    await userEvent.type(box, 'go{Enter}')
    await vi.waitFor(() => expect(onSent).toHaveBeenCalled())
    const [, init] = writes(fetch)[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toMatchObject({ parts: [{ text: 'nihongo' }] })
  })

  it('refuses to send, even with an inherited model, when the user has no models at all', async () => {
    const fetch = stubFetch(undefined, { '/api/models': { models: [], defaultModel: null } })
    await renderAt(
      <Composer skey="s" inherited={{ provider: 'p', id: 'smart' }} onSent={() => {}} />,
    )
    expect(await screen.findByText(/No models are available to you/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Message'), 'Hello{Enter}')
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
    expect(await optionsOf(screen.getByLabelText('Model'))).not.toContain('Default model')
    await userEvent.type(screen.getByLabelText('Message'), 'Hello{Enter}')
    expect(writes(fetch)).toEqual([])
    await choose(screen.getByLabelText('Model'), 'Basic')
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
    await userEvent.type(screen.getByLabelText('Message'), '{Enter}')
    await vi.waitFor(() => expect(writes(fetch)).toHaveLength(1))
    const init = (writes(fetch)[0] as [string, RequestInit])[1]
    expect(JSON.parse(String(init.body))).toMatchObject({
      generation: { model: { provider: 'p', id: 'basic' } },
    })
  })
})
