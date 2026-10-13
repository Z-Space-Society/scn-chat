import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react'
import type { OutlineEntry } from '../lib/outline.ts'

interface Props {
  /** The user's messages on the branch on screen, oldest first. */
  entries: OutlineEntry[]
  /** Called when a message is picked, or the reader clicks past the messages. */
  onClose: () => void
}

const promptOf = (entry: OutlineEntry) => entry.text.trim() || 'Attachments only'

/** The message being read: the last of the user's whose top is above a third of the window. */
function readingNow(entries: OutlineEntry[]): string | null {
  let current = entries[0]?.rkey ?? null
  for (const entry of entries) {
    const element = document.getElementById(`m-${entry.rkey}`)
    if (element && element.getBoundingClientRect().top <= window.innerHeight / 3)
      current = entry.rkey
  }
  return current
}

/** Mark a message as just landed on, restarting its glow if it was already landed on. */
function land(rkey: string) {
  const message = document.getElementById(`m-${rkey}`)
  if (!message) return
  delete message.dataset.landed
  // Reading the layout between the two lets the glow start over.
  void message.offsetWidth
  message.dataset.landed = ''
  message.addEventListener('animationend', () => delete message.dataset.landed, { once: true })
}

/** Up and Down, Home and End move between the messages. */
function moveFocus(event: KeyboardEvent<HTMLButtonElement>) {
  const buttons = Array.from(
    event.currentTarget.closest('ol')?.querySelectorAll<HTMLButtonElement>('button') ?? [],
  )
  const at = buttons.indexOf(event.currentTarget)
  const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: buttons.length - 1 }[event.key]
  if (to === undefined) return
  event.preventDefault()
  buttons[Math.max(0, Math.min(to, buttons.length - 1))]?.focus()
}

/**
 * The user's messages on the branch on screen, stacked as their bubbles on a layer over the chat,
 * which blurs and fades behind it, under a title that says what the stack is for. The layer fills
 * the panel under the header's title and buttons, and the bubbles fade out under the header as the
 * messages do. Each is clamped to two lines, and the one being read carries a ring. Picking one
 * scrolls the chat to it behind the layer, fades the layer away, and makes the message's bubble
 * glow a moment, leaving the branch as it is.
 */
export function PromptStack(props: Props) {
  const title = useId()
  const layer = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLElement>(null)
  const [current] = useState(() => readingNow(props.entries))
  // The message picked, which the chat has jumped to behind the layer as it fades away.
  const [picked, setPicked] = useState<string | null>(null)

  // Scrolling the list itself, since scrolling the message into view would move the chat too.
  useEffect(() => {
    const row = list.current?.querySelector<HTMLButtonElement>('[aria-current] button')
    if (!list.current || !row) return
    list.current.scrollTop = row.offsetTop - list.current.clientHeight / 2
    row.focus({ preventScroll: true })
  }, [])

  // Once the layer has faded, it closes.
  useEffect(() => {
    if (!picked || !layer.current) return
    let left = false
    Promise.all(layer.current.getAnimations().map((animation) => animation.finished)).then(() => {
      if (left) return
      props.onClose()
    })
    return () => {
      left = true
    }
  }, [picked, props.onClose])

  // The chat jumps while the layer still hides it, then shows through as the layer fades, with
  // the message's bubble already glowing.
  const jump = (rkey: string) => {
    document.getElementById(`m-${rkey}`)?.scrollIntoView({ block: 'start' })
    land(rkey)
    // Without the Web Animations API there is no fade to wait for.
    if (!layer.current?.getAnimations) {
      props.onClose()
      return
    }
    setPicked(rkey)
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape closes the layer from the keyboard.
    // biome-ignore lint/a11y/noStaticElementInteractions: a click past the messages closes the layer, as a click outside a menu does.
    <div
      ref={layer}
      data-leaving={picked ? '' : undefined}
      onClick={(event) => !(event.target as Element).closest('button') && props.onClose()}
      className="absolute inset-x-0 top-0 -z-1 flex h-dvh animate-layer-in flex-col bg-panel/70 backdrop-blur-md data-leaving:pointer-events-none data-leaving:animate-layer-out motion-reduce:animate-none"
    >
      {/* The title holds still under the header, in the column the messages stack in, while they
          scroll and fade out under it. */}
      <p
        id={title}
        className="mx-auto w-full max-w-column px-gutter pt-[calc(var(--spacing-bar)+--spacing(2))] font-medium text-caption text-section-ink"
      >
        Jump to a message
      </p>
      <nav
        aria-labelledby={title}
        ref={list}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain [mask-image:linear-gradient(transparent,black_--spacing(6))]"
      >
        <ol className="mx-auto flex max-w-column animate-layer-settle flex-col items-end gap-2 px-gutter pt-6 pb-12 motion-reduce:animate-layer-in">
          {props.entries.map((entry) => (
            <li
              key={entry.rkey}
              aria-current={entry.rkey === current ? 'location' : undefined}
              className="group/entry max-w-39/50"
            >
              <button
                type="button"
                dir="auto"
                onKeyDown={moveFocus}
                onClick={() => jump(entry.rkey)}
                className="group-aria-[current]/entry:inset-ring-(length:--control-edge) block cursor-pointer rounded-bubble bg-bubble px-5 py-2.5 text-start font-medium text-accent-strong hover:bg-accent-soft-hover group-aria-[current]/entry:inset-ring-accent-mark"
              >
                {/* The clamp goes on the text, since a button's own box neither clamps nor stops
                    short of its padding. */}
                <span className="line-clamp-2 [overflow-wrap:anywhere]">{promptOf(entry)}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
    </div>
  )
}
