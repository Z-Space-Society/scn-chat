import { noop } from '@tanstack/react-query'
import { useState } from 'react'
import { useAppForm } from '../../../shared/form.tsx'
import { useMe } from '../../auth/session.ts'
import { ShareControl } from '../../sharing/components/ShareControl.tsx'

interface Props {
  skey: string
  title: string
  /** Rename the conversation, resolving once the new title is saved. Its caller shows a failure. */
  onRename: (title: string) => Promise<unknown>
  onSync: () => void
}

/** The conversation's title, with its rename, sync, and share controls. */
export function ConversationHeader(props: Props) {
  const me = useMe()
  return (
    <header>
      <Title title={props.title} onRename={props.onRename} />
      <button type="button" onClick={props.onSync}>
        Sync
      </button>
      {me.storageMode === 'space' && <ShareControl skey={props.skey} ownerDid={me.did} />}
    </header>
  )
}

interface TitleProps {
  title: string
  onRename: (title: string) => Promise<unknown>
}

/** The title, or a form to rename it. */
function Title(props: TitleProps) {
  const [renaming, setRenaming] = useState(false)
  if (!renaming)
    return (
      <h2>
        {props.title}{' '}
        <button type="button" onClick={() => setRenaming(true)}>
          Rename
        </button>
      </h2>
    )
  return (
    <RenameForm
      title={props.title}
      onRename={(title) => props.onRename(title).then(() => setRenaming(false), noop)}
    />
  )
}

interface RenameFormProps {
  title: string
  onRename: (title: string) => Promise<void>
}

function RenameForm(props: RenameFormProps) {
  const form = useAppForm({
    defaultValues: { title: props.title },
    onSubmit: ({ value }) => props.onRename(value.title),
  })
  return (
    <form.AppForm>
      <form.Form>
        <form.AppField name="title">
          {(field) => <field.TextField aria-label="Title" />}
        </form.AppField>
        <form.SubmitButton>Save</form.SubmitButton>
      </form.Form>
    </form.AppForm>
  )
}
