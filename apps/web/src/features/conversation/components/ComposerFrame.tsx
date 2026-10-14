import { useLayoutEffect, useRef } from 'react'
import { ModelSelect } from '../../models/components/ModelSelect.tsx'
import { leaveDraft, restoreDraft, takeDraft } from '../lib/composer-handoff.ts'
import {
  AttachButton,
  ComposerCard,
  ComposerDock,
  ComposerToolbar,
  MessageBox,
  messagePlaceholder,
  SendButton,
} from './composer-parts.tsx'

interface Props {
  /** Whether an open chat's messages are on their way, so the box can't yet say whether it replies. */
  waiting: boolean
}

/**
 * The composer while its code loads, as the server sends it: a box to type in, with the model on
 * its way and nothing to send yet. Typing works before any script runs, and Enter only adds a
 * line. The composer that takes its place carries on with the text, the cursor, and the focus.
 */
export function ComposerFrame(props: Props) {
  const box = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const element = box.current
    if (!element) return
    // A frame can take another's place, as the conversation's takes the page's.
    const draft = takeDraft()
    if (draft) restoreDraft(element, draft)
    // The box is still on the page as the frame gives way, so what it holds can be read then.
    return () => leaveDraft(element)
  }, [])
  return (
    <ComposerDock>
      <ComposerCard>
        <MessageBox ref={box} placeholder={messagePlaceholder({ waiting: props.waiting })} />
        <ComposerToolbar>
          <AttachButton disabled />
          <ModelSelect
            aria-label="Model"
            title="Model"
            quiet
            loading
            models={[]}
            value={null}
            onChange={() => {}}
          />
          <SendButton disabled />
        </ComposerToolbar>
      </ComposerCard>
    </ComposerDock>
  )
}
