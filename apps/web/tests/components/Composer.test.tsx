import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Composer, type ModelOption } from '../../src/components/Composer.tsx'
import { requests, stubFetch } from '../helpers/fetch.ts'

beforeEach(() => void stubFetch())
afterEach(() => vi.unstubAllGlobals())

const models: ModelOption[] = [
  {
    provider: 'p',
    id: 'smart',
    name: 'Smart',
    capabilities: { vision: true, reasoning: true, tools: true },
  },
  {
    provider: 'p',
    id: 'basic',
    name: 'Basic',
    capabilities: { vision: false, reasoning: false, tools: false },
  },
]

describe('Composer', () => {
  it('shows the effort select only for reasoning models', async () => {
    render(<Composer skey="s" models={models} onSent={() => {}} />)
    expect(screen.queryByLabelText('Effort')).toBeNull()
    await userEvent.selectOptions(screen.getByLabelText('Model'), 'p/smart')
    expect(screen.getByLabelText('Effort')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Model'), 'p/basic')
    expect(screen.queryByLabelText('Effort')).toBeNull()
  })

  it('stops offering images for models without vision', async () => {
    render(<Composer skey="s" models={models} onSent={() => {}} />)
    await vi.waitFor(() =>
      expect(screen.getByLabelText('Attach')).toHaveAttribute(
        'accept',
        'image/png,image/jpeg,application/pdf',
      ),
    )
    await userEvent.selectOptions(screen.getByLabelText('Model'), 'p/basic')
    expect(screen.getByLabelText('Attach')).toHaveAttribute('accept', 'application/pdf')
  })

  it('sends the text with the chosen model and effort on Enter', async () => {
    const fetch = stubFetch(async () =>
      Response.json({ rkey: 'u1', replyRkey: 'u1.r0', status: 'claimed' }, { status: 201 }),
    )
    const onSent = vi.fn()
    render(<Composer skey="s1" parent="p0" models={models} onSent={onSent} />)
    await userEvent.selectOptions(screen.getByLabelText('Model'), 'p/smart')
    await userEvent.selectOptions(screen.getByLabelText('Effort'), 'high')
    await userEvent.type(screen.getByPlaceholderText('Message'), 'Hello{Enter}')
    await vi.waitFor(() => expect(onSent).toHaveBeenCalledWith({ rkey: 'u1', replyRkey: 'u1.r0' }))
    const [url, init] = requests(fetch)[0] as [string, RequestInit]
    expect(String(url)).toBe('/api/conversations/s1/messages')
    expect(JSON.parse(String(init.body))).toMatchObject({
      parent: 'p0',
      parts: [{ text: 'Hello' }],
      generation: { model: { provider: 'p', id: 'smart' }, effort: 'high' },
    })
  })

  it('does not send on Enter while an attachment is still uploading', async () => {
    const fetch = stubFetch((url) =>
      url === '/api/attachments'
        ? new Promise<Response>(() => {})
        : Promise.resolve(Response.json({ rkey: 'u1', replyRkey: null, status: null })),
    )
    render(<Composer skey="s1" models={models} onSent={() => {}} />)
    const file = new File(['%PDF'], 'report.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText('Attach'), file)
    await userEvent.type(screen.getByPlaceholderText('Message'), 'Read this{Enter}')
    expect(requests(fetch).map(([url]) => url)).toEqual(['/api/attachments'])
  })

  it('adds a newline on Shift+Enter instead of sending', async () => {
    const fetch = stubFetch()
    render(<Composer skey="s" models={models} onSent={() => {}} />)
    await userEvent.type(screen.getByPlaceholderText('Message'), 'a{Shift>}{Enter}{/Shift}b')
    expect(screen.getByPlaceholderText('Message')).toHaveValue('a\nb')
    expect(requests(fetch)).toEqual([])
  })
})
