import { useState } from 'react'
import { useMe } from '../../auth/session.tsx'
import { ShareControl } from '../../sharing/components/ShareControl.tsx'

/** The conversation's title, with its rename, sync, and share controls. */
export function ConversationHeader({
  skey,
  title,
  onRename,
  onSync,
}: {
  skey: string
  title: string
  /** Rename the conversation, calling `onSaved` once the new title is saved. */
  onRename: (value: string, onSaved: () => void) => void
  onSync: () => void
}) {
  const me = useMe()
  const [renaming, setRenaming] = useState<string | null>(null)
  return (
    <header>
      {renaming === null ? (
        <h2>
          {title}{' '}
          <button type="button" onClick={() => setRenaming(title)}>
            Rename
          </button>
        </h2>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onRename(renaming, () => setRenaming(null))
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
      <button type="button" onClick={onSync}>
        Sync
      </button>
      {me.storageMode === 'space' && <ShareControl skey={skey} ownerDid={me.did} />}
    </header>
  )
}
