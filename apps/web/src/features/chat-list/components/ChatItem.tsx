import { noop, useMutation } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { memo, type ReactNode, useRef, useState } from 'react'
import { api, json, read } from '../../../shared/api.ts'
import { cn } from '../../../shared/cn.ts'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { useAppForm } from '../../../shared/form.tsx'
import { MoreIcon, PencilIcon, TagIcon, TrashIcon } from '../../../shared/icons.tsx'
import { Button } from '../../../shared/ui/Button.tsx'
import { MenuItem } from '../../../shared/ui/MenuItem.tsx'
import { floating } from '../../../shared/ui/menu.ts'
import { sidebarRow } from '../../../shared/ui/sidebar.ts'
import { useDismiss } from '../../../shared/useDismiss.ts'
import { usePlacement } from '../../../shared/usePlacement.ts'
import type { ChatListItem } from '../../../store/core.ts'

/** The lexicon's limits on a chat's tags. */
const MAX_TAGS = 32
const MAX_TAG_LENGTH = 64

/** Tags typed as a comma-separated list, trimmed, deduplicated, and within the lexicon's limits. */
export function parseTags(text: string): string[] {
  const tags = text
    .split(',')
    .map((tag) => tag.trim().slice(0, MAX_TAG_LENGTH))
    .filter(Boolean)
  return [...new Set(tags)].slice(0, MAX_TAGS)
}

type Mode = 'idle' | 'menu' | 'rename' | 'tags' | 'delete'

interface Props {
  chat: ChatListItem
  /** Whether a reply arrived that the user hasn't seen on this device. */
  unseen: boolean
  /** Called after the chat changes on the server, to bring the change into the local copy. */
  onChanged: () => Promise<void>
  onDeleted: (skey: string) => void
}

/** One chat in the sidebar: its title and state on one line, and a menu to rename, tag, or delete it. */
// Memoized, since a change to one chat or a page loading rerenders the list, and each row
// would otherwise rerender with it. Its callbacks are the list's own, the same for every row.
export const ChatItem = memo(function ChatItem(props: Props) {
  const [mode, setMode] = useState<Mode>('idle')
  const skey = props.chat.skey
  const title = props.chat.title || 'New chat'
  const cancel = () => setMode('idle')
  // Done once the change is saved, then brought into the local copy.
  const changed = async () => {
    setMode('idle')
    await props.onChanged()
  }

  if (mode === 'rename')
    return (
      <EditChat
        skey={skey}
        label="Title"
        placeholder="Title"
        text={props.chat.title ?? ''}
        required
        toChange={(text) => ({ title: text.trim() })}
        onSaved={changed}
        onCancel={cancel}
      />
    )
  if (mode === 'tags')
    return (
      <EditChat
        skey={skey}
        label="Tags, separated by commas"
        placeholder="work, travel"
        text={props.chat.tags.join(', ')}
        toChange={(text) => ({ tags: parseTags(text) })}
        onSaved={changed}
        onCancel={cancel}
      />
    )
  if (mode === 'delete')
    return (
      <DeleteChat
        skey={skey}
        title={title}
        onDeleted={async () => {
          props.onDeleted(skey)
          await props.onChanged()
        }}
        onCancel={cancel}
      />
    )

  return (
    <li
      data-replying={props.chat.pending || undefined}
      data-unseen={props.unseen || undefined}
      className="relative"
    >
      <div className="group/row relative">
        <Link
          to="/chat/$skey"
          params={{ skey }}
          // The menu button takes the row's end on hover or focus, and from the start on touch.
          className={cn(
            sidebarRow,
            'touch:pe-8 text-row-ink group-focus-within/row:pe-8 group-hover/row:pe-8',
          )}
        >
          {/* A chat with a reply not yet seen is a step bolder and darker, as unread mail is. */}
          <span
            dir="auto"
            className="min-w-0 flex-1 truncate in-data-unseen:font-semibold in-data-unseen:text-ink-strong"
          >
            {title}
          </span>
          {props.chat.pending && <ChatState>Replying</ChatState>}
          {!props.chat.pending && props.unseen && <ChatState>New reply</ChatState>}
        </Link>
        <MoreButton
          title={title}
          open={mode === 'menu'}
          onToggle={() => setMode(mode === 'menu' ? 'idle' : 'menu')}
          onClose={cancel}
          onPick={setMode}
        />
      </div>
    </li>
  )
})

const alert = 'mt-1 px-row-inset text-small'

interface StateProps {
  children: string
}

/**
 * A chat's state as a green dot at the row's end, breathing while it replies and still for a reply
 * not yet seen, which gives way to the menu button. The words stay for screen readers.
 */
function ChatState(props: StateProps) {
  return (
    <span className="touch:hidden size-1.75 flex-none in-data-replying:animate-breathe rounded-full bg-accent-mark group-focus-within/row:hidden group-hover/row:hidden motion-reduce:animate-none">
      <span className="sr-only">{props.children}</span>
    </span>
  )
}

interface MoreProps {
  title: string
  open: boolean
  onToggle: () => void
  onClose: () => void
  onPick: (mode: Mode) => void
}

/**
 * The menu button, shown on hover, on focus, and while its menu is open, and the menu it opens,
 * floating over the list by it. Escape or a click outside closes the menu.
 */
function MoreButton(props: MoreProps) {
  const more = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const position = usePlacement(props.open, more, menu, 'end')
  useDismiss(props.open, [more, menu], props.onClose)

  return (
    <>
      <button
        ref={more}
        type="button"
        aria-label={`More for ${props.title}`}
        aria-expanded={props.open}
        onClick={props.onToggle}
        className="absolute end-0.75 top-1/2 inline-flex -translate-y-1/2 cursor-pointer rounded-row p-0.75 text-muted opacity-0 touch:opacity-100 transition-opacity duration-(--dur-feedback) hover:bg-row-active focus-visible:opacity-100 active:bg-row-active group-hover/row:opacity-100 aria-expanded:opacity-100"
      >
        <MoreIcon />
      </button>
      {props.open && (
        <div
          ref={menu}
          style={position}
          className={cn(floating, 'fixed z-50 flex w-44 flex-col gap-0.5')}
        >
          <MenuItem onClick={() => props.onPick('rename')}>
            <PencilIcon /> Rename
          </MenuItem>
          <MenuItem onClick={() => props.onPick('tags')}>
            <TagIcon /> Edit tags
          </MenuItem>
          <MenuItem danger onClick={() => props.onPick('delete')}>
            <TrashIcon /> Delete
          </MenuItem>
        </div>
      )}
    </>
  )
}

interface EditChatProps {
  skey: string
  label: string
  placeholder: string
  /** What the field starts from. */
  text: string
  /** Whether Save waits for something other than spaces, as a title does and tags don't. */
  required?: boolean
  /** The change to the chat the typed text makes. */
  toChange: (text: string) => { title?: string; tags?: string[] }
  onSaved: () => Promise<void>
  onCancel: () => void
}

/**
 * Renaming or tagging a chat, as a card in its place. The card holds its own save, so a row that
 * isn't being changed holds none.
 */
function EditChat(props: EditChatProps) {
  const saving = useMutation({
    mutationFn: (text: string) =>
      read(
        api.chats.conversations[':skey'].$patch(
          { param: { skey: props.skey } },
          json(props.toChange(text)),
        ),
      ),
    onSuccess: props.onSaved,
  })
  return (
    <EditCard error={<ErrorAlert error={saving.error} className={alert} />}>
      <EditForm
        label={props.label}
        placeholder={props.placeholder}
        text={props.text}
        required={props.required}
        onSave={(text) => saving.mutateAsync(text).catch(noop)}
        onCancel={props.onCancel}
      />
    </EditCard>
  )
}

interface DeleteChatProps {
  skey: string
  title: string
  onDeleted: () => Promise<void>
  onCancel: () => void
}

/** Confirming a chat's delete, as a card in its place, holding the delete itself. */
function DeleteChat(props: DeleteChatProps) {
  const deleting = useMutation({
    mutationFn: () =>
      read(api.chats.conversations[':skey'].$delete({ param: { skey: props.skey } })),
    onSuccess: props.onDeleted,
  })
  return (
    <EditCard error={<ErrorAlert error={deleting.error} className={alert} />}>
      {/* The PDS holds the only copy, so deleting is for good. */}
      <p className="mb-2 text-ink">Delete “{props.title}” for good?</p>
      <div className="flex gap-1.5">
        <Button
          tone="danger"
          size="small"
          disabled={deleting.isPending}
          onClick={() => deleting.mutate()}
        >
          Delete chat
        </Button>
        <Button size="small" onClick={props.onCancel}>
          Cancel
        </Button>
      </div>
    </EditCard>
  )
}

interface EditCardProps {
  error: ReactNode
  children: ReactNode
}

/** Renaming, tagging, or confirming a delete takes the chat's place in the list, as a card. */
function EditCard(props: EditCardProps) {
  return (
    <li className="mt-0.75 mb-1.5 rounded-editor border border-line bg-raised p-2.5 text-small">
      {props.children}
      {props.error}
    </li>
  )
}

interface EditFormProps {
  label: string
  placeholder: string
  /** What the field starts from. */
  text: string
  required?: boolean
  /** Save the text, resolving once it is saved or has failed. Its caller shows a failure. */
  onSave: (text: string) => Promise<unknown>
  onCancel: () => void
}

/** A field to change a chat's title or tags, with Save and Cancel. Escape cancels too. */
function EditForm(props: EditFormProps) {
  const form = useAppForm({
    defaultValues: { text: props.text },
    onSubmit: ({ value }) => props.onSave(value.text),
  })
  return (
    <form.AppForm>
      <form.Form>
        <form.AppField name="text">
          {(field) => (
            <field.TextField
              aria-label={props.label}
              placeholder={props.placeholder}
              // The field opens because the user asked to edit.
              autoFocus
              onKeyDown={(e) => e.key === 'Escape' && props.onCancel()}
              className="mb-2 w-full"
            />
          )}
        </form.AppField>
        <div className="flex gap-1.5">
          {/* An empty title isn't saved, since the chat would then never be titled for it. */}
          <form.Subscribe selector={(state) => props.required && state.values.text.trim() === ''}>
            {(empty) => (
              <form.SubmitButton size="small" disabled={empty}>
                Save
              </form.SubmitButton>
            )}
          </form.Subscribe>
          <Button size="small" onClick={props.onCancel}>
            Cancel
          </Button>
        </div>
      </form.Form>
    </form.AppForm>
  )
}
