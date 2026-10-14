import { useMutation } from '@tanstack/react-query'
import { useContext, useEffect, useState } from 'react'
import { cn } from '../../../shared/cn.ts'
import { CloudIcon, DriveIcon, SyncIcon } from '../../../shared/icons.tsx'
import { plural } from '../../../shared/plural.ts'
import { timeAgo } from '../../../shared/time.ts'
import type { HandoverState } from '../../../store/handover.ts'
import { useStoreState, useSyncIndex, useSyncStatus } from '../../../store/react.tsx'
import { MeContext } from '../../auth/session.ts'

/** The current time, ticking every half minute so "2 min ago" stays true. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

/** Checks the chat index for changes now. The dot and the panel share one, so both show how it went. */
export function useSyncNow() {
  const syncIndex = useSyncIndex()
  return useMutation({ mutationFn: syncIndex })
}

type SyncNow = ReturnType<typeof useSyncNow>

/** What this device's copy of the chats is doing, from the store's own state. */
function statusText(
  state: ReturnType<typeof useStoreState>,
  status: ReturnType<typeof useSyncStatus>,
  syncing: boolean,
  now: Date,
): string {
  if (state === 'busy') return 'Open in another tab'
  if (state === 'failed') return "Couldn't open this device's copy"
  if (syncing || !status) return 'Syncing…'
  if (status.remaining > 0)
    return plural(status.remaining, { one: 'Downloading # chat…', other: 'Downloading # chats…' })
  if (!status.syncedAt) return 'Syncing…'
  return `Synced ${timeAgo(new Date(status.syncedAt), now)}`
}

type DotState = HandoverState | 'synced' | 'syncing'

/** The dot's state: synced, catching up, or stuck. */
function dotState(
  state: ReturnType<typeof useStoreState>,
  status: ReturnType<typeof useSyncStatus>,
  syncing: SyncNow,
): DotState {
  if (state !== 'active') return state
  if (syncing.isError) return 'failed'
  if (syncing.isPending || !status?.syncedAt || status.remaining > 0) return 'syncing'
  return 'synced'
}

/** Where the chats live, and how current this device's copy is, in words and as a dot's state. */
function useSync(syncing: SyncNow) {
  const me = useContext(MeContext)
  const state = useStoreState()
  const status = useSyncStatus()
  const now = useNow()
  return {
    local: me?.storageMode === 'local',
    active: state === 'active',
    dot: dotState(state, status, syncing),
    text: syncing.isError ? "Couldn't sync" : statusText(state, status, syncing.isPending, now),
  }
}

/**
 * The dot's color for its state: green when synced, breathing while it catches up, grey when the
 * copy is open in another tab, and red when it failed.
 */
const dot = (state: DotState) =>
  cn(
    'rounded-full bg-accent-mark',
    state === 'syncing' && 'animate-breathe motion-reduce:animate-none',
    state === 'busy' && 'bg-faint',
    state === 'failed' && 'bg-danger',
  )

interface Props {
  syncing: SyncNow
}

/**
 * How current this device's copy of the chats is, as a dot on the account's avatar, ringed in the
 * sidebar's color so it reads as cut out of it. Hovering says so in words. It is phrasing content,
 * so it can sit inside the account button.
 */
export function SyncDot(props: Props) {
  const sync = useSync(props.syncing)
  return (
    <span
      data-state={sync.dot}
      title={sync.text}
      className={cn(
        dot(sync.dot),
        'absolute -end-0.75 -bottom-0.75 size-2.5 border-2 border-sidebar group-hover/account:border-row-hover-solid group-aria-expanded/account:border-row-hover-solid',
      )}
    >
      <span className="sr-only" aria-live="polite">
        {sync.text}
      </span>
    </span>
  )
}

/**
 * Where the user's chats live, their PDS or this server, then when this device's copy last synced,
 * led by the avatar's dot so the menu says what the dot means, with a button at its end that checks
 * for changes now, as one card heading the account menu in the faint tint of New chat. Its icon and
 * dot sit where the rows' icons do, so the words line up with the rows' labels.
 */
export function SyncPanel(props: Props) {
  const sync = useSync(props.syncing)
  return (
    <div
      data-state={sync.dot}
      className="group/sync mb-(--menu-pad) flex flex-col gap-0.75 rounded-row bg-row-hover ps-row-inset pe-1.25 pt-2 pb-1.25"
    >
      <p className="flex items-center gap-2.25 font-medium text-ink-strong leading-[1.35]">
        {sync.local ? <DriveIcon /> : <CloudIcon />}
        <span className="flex min-w-0 flex-col">
          {sync.local ? 'Stored on this server' : 'Stored on your PDS'}
          {sync.local && (
            <small className="font-medium text-caption text-muted">
              Your PDS doesn't support spaces yet
            </small>
          )}
        </span>
      </p>
      <div className="flex items-center gap-2.25 font-medium text-muted text-small leading-[1.35] group-data-[state=failed]/sync:text-danger">
        <span
          aria-hidden="true"
          className={cn(
            dot(sync.dot),
            'mx-[calc((var(--spacing-icon)-var(--spacing)*2)/2)] size-2 flex-none',
          )}
        />
        <span className="min-w-0 flex-1">{sync.text}</span>
        <button
          type="button"
          aria-label="Sync chats"
          title="Sync chats"
          disabled={!sync.active || props.syncing.isPending}
          onClick={() => props.syncing.mutate()}
          className="inline-flex size-8 flex-none cursor-pointer items-center justify-center rounded-row text-muted hover:not-disabled:bg-row-active hover:not-disabled:text-ink disabled:cursor-default disabled:opacity-40"
        >
          <SyncIcon />
        </button>
      </div>
    </div>
  )
}
