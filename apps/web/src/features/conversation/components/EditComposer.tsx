import type { ModelRef } from '@scn-chat/lexicons'
import type { ReactNode, Ref } from 'react'
import type { OutgoingMessage } from '../chat.ts'
import * as Composer from './Composer.tsx'
import { messagePlaceholder } from './composer-parts.tsx'

interface Props {
  /** The edited message's text, which the box starts with. */
  text: string
  /** Send the edit, as a new version of the message. */
  send: (message: OutgoingMessage) => Promise<unknown>
  /** The message the edited one answers, which the edit answers too. */
  parent?: string
  /** The model last used at or above `parent`, which the server falls back to. */
  inherited?: ModelRef | null
  /** Stop editing, from the note that says the composer is editing, and on Escape. */
  onCancel: () => void
  /** What floats just above the box, such as a button that jumps to the latest message. */
  above?: ReactNode
  ref?: Ref<Composer.ComposerHandle>
}

/**
 * The message box editing an earlier message: the reply composer's card, starting from the
 * message's text, under a note that it is editing with a way back. Sending adds a new version.
 */
// The ref is kept out of `props`, as in the reply composer, so React Compiler still memoizes this.
export function EditComposer({ ref, ...props }: Props) {
  const composer = Composer.useComposer(
    { send: props.send, parent: props.parent, inherited: props.inherited, initialText: props.text },
    ref,
  )
  return (
    <Composer.Provider value={composer}>
      <Composer.Form>
        {props.above}
        <Composer.EditingNote onCancel={props.onCancel} />
        <Composer.Card>
          <Composer.Quotes />
          <Composer.Attachments />
          <Composer.Input placeholder={messagePlaceholder(props)} onEscape={props.onCancel} />
          <Composer.Clear />
          <Composer.Toolbar>
            <Composer.Attach />
            <Composer.Model />
            <Composer.Effort />
            <Composer.Send title="Send as a new version" />
          </Composer.Toolbar>
        </Composer.Card>
        <Composer.Notices />
      </Composer.Form>
    </Composer.Provider>
  )
}
