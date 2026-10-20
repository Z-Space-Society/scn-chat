import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act, type ReactNode, useState } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ComposerFrame } from '../../../../src/features/conversation/components/ComposerFrame.tsx'
import { ConversationFrame } from '../../../../src/features/conversation/components/ConversationFrame.tsx'
import { EditComposer } from '../../../../src/features/conversation/components/EditComposer.tsx'
import { ReplyComposer } from '../../../../src/features/conversation/components/ReplyComposer.tsx'
import { takeText } from '../../../../src/features/conversation/lib/composer-handoff.ts'
import { stubFetch } from '../../../helpers/fetch.ts'
import { renderAt } from '../../../helpers/router.tsx'

let advance: () => void

interface LoadingProps {
  /** What takes the frames' place once they have given way, the composer unless given. */
  composer?: ReactNode
}

/** The page as it loads: the page's frame, then the conversation's, then the composer. */
function Loading(props: LoadingProps) {
  const [stage, setStage] = useState(0)
  advance = () => setStage((current) => current + 1)
  if (stage < 2) return <ComposerFrame key={stage} waiting={false} />
  return props.composer ?? <ReplyComposer send={async () => {}} />
}

const box = () => screen.getByLabelText<HTMLTextAreaElement>('Message')

beforeEach(() => {
  stubFetch(undefined, {
    '/api/models': { models: [], defaultModel: { provider: 'p', id: 'smart' } },
  })
  // The last test's frame handed its draft on as it was cleaned up.
  takeText()
})
afterEach(() => vi.unstubAllGlobals())

describe('ComposerFrame', () => {
  it('takes typing before the composer loads, with Send and the model waiting', async () => {
    await renderAt(<ComposerFrame waiting={false} />)
    await userEvent.type(box(), 'Hello')
    expect(box()).toHaveValue('Hello')
    expect(box()).toHaveAttribute('placeholder', 'Ask anything')
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Attach files' })).toBeDisabled()
    expect(screen.getByLabelText('Model')).toBeDisabled()
  })

  it('adds a line on Enter, with nothing to send it', async () => {
    await renderAt(<ComposerFrame waiting={false} />)
    await userEvent.type(box(), 'a{Enter}b')
    expect(box()).toHaveValue('a\nb')
  })

  it("says nothing in an open chat's box until its messages say whether it replies", async () => {
    await renderAt(<ComposerFrame waiting />)
    expect(box()).toHaveAttribute('placeholder', '')
  })

  it('hands the text, cursor, and focus on to each box that takes its place', async () => {
    await renderAt(<Loading />)
    await userEvent.type(box(), 'Hello world')
    box().setSelectionRange(0, 5)
    act(() => advance())
    expect(box()).toHaveValue('Hello world')
    expect(box()).toHaveFocus()
    act(() => advance())
    expect(box()).toHaveValue('Hello world')
    expect(box()).toHaveFocus()
    expect([box().selectionStart, box().selectionEnd]).toEqual([0, 5])
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled())
  })

  it('hands on nothing when nothing was typed and the box was left alone', async () => {
    await renderAt(<Loading />)
    act(() => advance())
    act(() => advance())
    expect(box()).toHaveValue('')
    expect(box()).not.toHaveFocus()
  })

  it('leaves its draft to a composer that starts empty, not one editing a message', async () => {
    const editing = <EditComposer text="Earlier" onCancel={() => {}} send={async () => {}} />
    await renderAt(<Loading composer={editing} />)
    await userEvent.type(box(), 'Hello')
    act(() => advance())
    act(() => advance())
    expect(box()).toHaveValue('Earlier')
    expect(takeText()?.text).toBe('Hello')
  })

  it('keeps what was typed into the page the server sent as the page hydrates', async () => {
    const page = <ConversationFrame open={false} immediate />
    const container = document.createElement('div')
    document.body.append(container)
    container.innerHTML = renderToString(page)
    const sent = container.querySelector('textarea') as HTMLTextAreaElement
    sent.focus()
    fireEvent.input(sent, { target: { value: 'Typed early' } })
    const errors = vi.fn()
    const root = await act(async () => hydrateRoot(container, page, { onRecoverableError: errors }))
    expect(errors).not.toHaveBeenCalled()
    expect(container.querySelector('textarea')).toBe(sent)
    expect(sent).toHaveValue('Typed early')
    expect(sent).toHaveFocus()
    act(() => root.unmount())
    container.remove()
    expect(takeText()?.text).toBe('Typed early')
  })
})
