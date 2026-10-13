import { noop } from '@tanstack/react-query'
import { type ReactNode, useRef, useState } from 'react'
import { cn } from '../../../shared/cn.ts'
import { useAppForm } from '../../../shared/form.tsx'
import { ListIcon, MoreIcon, PencilIcon, ShareIcon, SyncIcon } from '../../../shared/icons.tsx'
import { Button } from '../../../shared/ui/Button.tsx'
import { MenuItem } from '../../../shared/ui/MenuItem.tsx'
import { floating } from '../../../shared/ui/menu.ts'
import { SkeletonText } from '../../../shared/ui/Skeleton.tsx'
import { useDismiss } from '../../../shared/useDismiss.ts'
import { useMe } from '../../auth/session.ts'
import { SharePanel } from '../../sharing/components/SharePanel.tsx'
import type { OutlineEntry } from '../lib/outline.ts'
import { PromptStack } from './PromptStack.tsx'

interface Props {
  skey: string
  /** The chat's title, or nothing while it is on its way. */
  title: string | undefined
  /** The user's messages on the branch on screen, to jump between. */
  outline: OutlineEntry[]
  /** Rename the conversation, resolving once the new title is saved. Its caller shows a failure. */
  onRename: (title: string) => Promise<unknown>
  onSync: () => void
}

/** What opens under the header, or the jump stack over the whole chat. One at a time. */
type Panel = 'jump' | 'share' | 'menu' | 'rename' | null

/** Panels that close when the reader presses elsewhere. Forms stay open until closed. */
const light: Panel[] = ['jump', 'menu']

/**
 * The conversation's title bar, which stays out of the way of the reading: the title, which renames
 * the chat when clicked, then a quiet toolbar of Jump to, Share, and a menu holding rename and sync.
 * It spans the whole panel with no edge of its own, and the panel's color fades out below it, so
 * the messages pass under it softly.
 */
export function ConversationHeader(props: Props) {
  const me = useMe()
  const [panel, setPanel] = useState<Panel>(null)
  const header = useRef<HTMLElement>(null)
  const close = () => setPanel(null)
  const toggle = (next: Panel) => setPanel(panel === next ? null : next)
  useDismiss(panel !== null, [header], close, { outside: light.includes(panel) })

  return (
    <header
      ref={header}
      className={cn(
        // Out of the centered column to the panel's edges.
        'group/header sticky top-0 isolate z-1 mx-[calc((100%-100cqi)/2)] flex min-h-bar items-center gap-4 px-2.75 transition-[padding-inline-start] duration-(--dur-slide) ease-slide before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:-bottom-6 before:-z-1 before:bg-panel motion-reduce:transition-none before:[mask-image:linear-gradient(black_calc(100%-(--spacing(10))),transparent)]',
        // The title moves aside for the sidebar's toggle as the sidebar slides away, and back, and
        // stays clear of it on a narrow screen, where the sidebar is a drawer.
        'in-data-sidebar-collapsed:ps-[calc(--spacing(2.75)+var(--spacing-toggle)+--spacing(1.5))] max-wide:ps-[calc(--spacing(2.75)+var(--spacing-toggle)+--spacing(1.5))]',
      )}
    >
      {props.title === undefined && (
        // The title on its way, a line where the title's text will be.
        <span className="min-w-0 flex-1 px-2.25 py-1.25 text-ui">
          <SkeletonText className="w-40 max-w-full" />
        </span>
      )}
      {props.title !== undefined && panel === 'rename' && (
        <RenameForm
          title={props.title}
          onRename={(title) => props.onRename(title).then(close, noop)}
          onCancel={close}
        />
      )}
      {props.title !== undefined && panel !== 'rename' && (
        // The title is set a step quieter than a heading, so the messages lead, and reads as plain
        // text until hovered or focused, when a faint pencil shows beside it.
        <h2 className="flex min-w-0 flex-1 font-medium text-ink-strong text-ui">
          <button
            type="button"
            title="Rename"
            onClick={() => setPanel('rename')}
            className="group/title inline-flex max-w-full cursor-text items-center gap-1.5 whitespace-nowrap rounded-small px-2.25 py-1.25 hover:bg-row-hover focus-visible:bg-row-hover"
          >
            <span dir="auto" className="truncate">
              {props.title}
            </span>
            <PencilIcon className="text-muted opacity-0 transition-opacity duration-(--dur-feedback) group-hover/title:opacity-100 group-focus-visible/title:opacity-100" />
          </button>
        </h2>
      )}
      {/* The controls share one toolbar in the faint tint of the sidebar's New chat, so they read as
          a single quiet tool. */}
      <div className="flex flex-none items-center gap-0.5 rounded-[calc(var(--radius-row)+--spacing(0.5))] bg-row-hover p-0.5">
        <ToolButton
          label="Jump to a message"
          open={panel === 'jump'}
          onClick={() => toggle('jump')}
          // Jump to's stack fades out on its own, so its button lets go the moment a message is
          // picked, rather than once the stack has faded.
          className="transition-[scale] group-has-[[data-leaving]]/header:bg-transparent group-has-[[data-leaving]]/header:text-muted motion-reduce:transition-none"
        >
          <ListIcon />
        </ToolButton>
        {me.storageMode === 'space' && (
          <ToolButton label="Share" open={panel === 'share'} onClick={() => toggle('share')}>
            <ShareIcon />
          </ToolButton>
        )}
        <ToolButton label="More" open={panel === 'menu'} onClick={() => toggle('menu')}>
          <MoreIcon />
        </ToolButton>
      </div>
      {panel === 'jump' && <PromptStack entries={props.outline} onClose={close} />}
      {panel === 'share' && (
        <SharePanel skey={props.skey} ownerDid={me.did} onClose={close} className={dropdown} />
      )}
      {panel === 'menu' && (
        <div className={cn(floating, dropdown, 'flex w-44 flex-col gap-0.5')}>
          <MenuItem onClick={() => setPanel('rename')}>
            <PencilIcon /> Rename
          </MenuItem>
          <MenuItem
            onClick={() => {
              close()
              props.onSync()
            }}
          >
            <SyncIcon /> Sync this chat
          </MenuItem>
        </div>
      )}
    </header>
  )
}

/** A panel dropping down from the header's right edge, over the messages, settling into place. */
const dropdown =
  'absolute end-2.75 top-[calc(100%-(--spacing(1.5)))] z-2 animate-panel-in motion-reduce:animate-fade-in'

interface ToolButtonProps {
  label: string
  open: boolean
  onClick: () => void
  className?: string
  children: ReactNode
}

/** An icon in muted ink that takes a firmer tint when hovered, focused, or open. */
function ToolButton(props: ToolButtonProps) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      aria-expanded={props.open}
      onClick={props.onClick}
      className={cn(
        'inline-flex size-7.5 cursor-pointer items-center justify-center rounded-row text-muted transition-colors duration-(--dur-feedback) hover:bg-row-active hover:text-ink focus-visible:bg-row-active aria-expanded:bg-row-active aria-expanded:text-ink',
        props.className,
      )}
    >
      {props.children}
    </button>
  )
}

interface RenameFormProps {
  title: string
  /** Save the new title, resolving once it is saved or has failed. */
  onRename: (title: string) => Promise<void>
  onCancel: () => void
}

/** Renaming swaps the title for a field the same size, with its buttons beside it. */
function RenameForm(props: RenameFormProps) {
  const form = useAppForm({
    defaultValues: { title: props.title },
    onSubmit: ({ value }) => props.onRename(value.title.trim()),
  })
  return (
    <form.AppForm>
      <form.Form className="flex min-w-0 flex-1 items-center gap-1.5">
        <form.AppField name="title">
          {(field) => (
            <field.TextField
              aria-label="Title"
              // The field opens because the user asked to rename.
              autoFocus
              className="min-w-0 max-w-112 flex-1 px-2.25 py-1.25 font-semibold text-ink-strong text-ui"
            />
          )}
        </form.AppField>
        {/* An empty title isn't saved. */}
        <form.Subscribe selector={(state) => state.values.title.trim() === ''}>
          {(empty) => (
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(submitting) => (
                <Button type="submit" size="small" className="h-8" disabled={empty || submitting}>
                  Save
                </Button>
              )}
            </form.Subscribe>
          )}
        </form.Subscribe>
        <Button size="small" className="h-8" onClick={props.onCancel}>
          Cancel
        </Button>
      </form.Form>
    </form.AppForm>
  )
}
