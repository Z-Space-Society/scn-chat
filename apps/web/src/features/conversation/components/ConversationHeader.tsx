import { useState } from 'react'
import { useMe } from '../../auth/session.ts'
import { ShareControl } from '../../sharing/components/ShareControl.tsx'

interface Props {
  skey: string
  title: string
  /** Rename the conversation, calling `onSaved` once the new title is saved. */
  onRename: (value: string, onSaved: () => void) => void
  onSync: () => void
}

/** The conversation's title, with its rename, sync, and share controls. */
export function ConversationHeader(props: Props) {
  const me = useMe()
  const [renaming, setRenaming] = useState<string | null>(null)
  return (
    <header>
      {renaming === null ? (
        <h2>
          {props.title}{' '}
          <button type="button" onClick={() => setRenaming(props.title)}>
            Rename
          </button>
        </h2>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            props.onRename(renaming, () => setRenaming(null))
          }}
        >
          <input
            aria-label="Title"
            value={renaming}
            onChange={(e) => setRenaming(e.target.value)}
          />
          <button type="submit">Save</button>
        </form>
      )}
      <button type="button" onClick={props.onSync}>
        Sync
      </button>
      {me.storageMode === 'space' && <ShareControl skey={props.skey} ownerDid={me.did} />}
    </header>
  )
}
