import type { ModelRef } from '@scn-chat/lexicons'
import type { ReactNode, Ref } from 'react'
import type { OutgoingMessage } from '../chat.ts'
import * as Composer from './Composer.tsx'
import { messagePlaceholder } from './composer-parts.tsx'

interface Props {
  /** Send the message, which the composer clears once this resolves. */
  send: (message: OutgoingMessage) => Promise<unknown>
  /** The message this one answers, or none for a chat's first message. */
  parent?: string
  /**
   * Whether the chat's messages are still on their way, so it isn't known yet whether the message
   * starts the chat or replies. The box says neither, and nothing sends until they arrive.
   */
  waiting?: boolean
  /** The model last used at or above `parent`, which the server falls back to. */
  inherited?: ModelRef | null
  /** Stop the reply running at the end of the branch, offered in place of Send until it ends. */
  onStop?: () => void
  /** What floats just above the box, such as a button that jumps to the latest message. */
  above?: ReactNode
  ref?: Ref<Composer.ComposerHandle>
}

/**
 * The message box for a new message, starting a chat or replying at the end of its branch: one
 * white card floating at the bottom of the panel, over the conversation fading under it, with
 * quotes and attachments at its top, the text, and a toolbar of Attach, the model and effort, and
 * Send, which nests in the card's corner as the main action. While a reply runs, Stop takes Send's
 * place. It carries on from the frame that stood in for it while the page loaded.
 */
// The ref is kept out of `props`: React Compiler treats an object holding a ref as one, so reading
// any other prop in render would stop it memoizing the composer.
export function ReplyComposer({ ref, ...props }: Props) {
  const composer = Composer.useComposer(
    {
      send: props.send,
      parent: props.parent,
      inherited: props.inherited,
      waiting: props.waiting,
      running: Boolean(props.onStop),
    },
    ref,
  )
  Composer.useFrameHandoff(composer)
  return (
    <Composer.Provider value={composer}>
      <Composer.Form>
        {props.above}
        <Composer.Card>
          <Composer.Quotes />
          <Composer.Attachments />
          <Composer.Input placeholder={messagePlaceholder(props)} />
          <Composer.Clear />
          <Composer.Toolbar>
            <Composer.Attach />
            <Composer.Model />
            <Composer.Effort />
            {props.onStop ? <Composer.Stop onClick={props.onStop} /> : <Composer.Send />}
          </Composer.Toolbar>
        </Composer.Card>
        <Composer.Notices />
      </Composer.Form>
    </Composer.Provider>
  )
}
