import { useEffect, useState } from 'react'
import { api, json, read } from '../api.ts'

type Mode = 'private' | 'people' | 'public'

/** Who can read this conversation, and its link. */
export function ShareControl({ skey, ownerDid }: { skey: string; ownerDid: string }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('private')
  const [members, setMembers] = useState('')
  const [error, setError] = useState<string | null>(null)
  const link = `${location.origin}/s/${ownerDid}/${skey}`

  useEffect(() => {
    if (!open) return
    void read(api.sharing.conversations[':skey'].sharing.$get({ param: { skey } }))
      .then((settings) => {
        setMode(settings.mode)
        setMembers(settings.members.map((m) => m.handle ?? m.did).join(', '))
      })
      .catch((err: Error) => setError(err.message))
  }, [open, skey])

  const save = async () => {
    setError(null)
    const list = members
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean)
    try {
      await read(
        api.sharing.conversations[':skey'].sharing.$put(
          { param: { skey } },
          json({ mode, members: list }),
        ),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Saving failed')
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}>
        Share
      </button>
    )
  }
  return (
    <fieldset>
      <legend>Sharing</legend>
      <select
        aria-label="Sharing mode"
        value={mode}
        onChange={(e) => setMode(e.target.value as Mode)}
      >
        <option value="private">Private</option>
        <option value="people">Specific people</option>
        <option value="public">Anyone with an atproto account</option>
      </select>
      {mode === 'people' && (
        <input
          aria-label="People"
          placeholder="Handles, separated by commas"
          value={members}
          onChange={(e) => setMembers(e.target.value)}
        />
      )}
      <button type="button" onClick={() => void save()}>
        Save
      </button>
      {mode !== 'private' && <input aria-label="Link" readOnly value={link} />}
      <button type="button" onClick={() => setOpen(false)}>
        Close
      </button>
      {error && <p role="alert">{error}</p>}
    </fieldset>
  )
}
