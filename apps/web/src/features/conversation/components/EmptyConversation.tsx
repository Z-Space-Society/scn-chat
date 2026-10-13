import type { ReactNode } from 'react'
import { BulbIcon, PencilIcon, SparkleIcon } from '../../../shared/icons.tsx'
import { Button } from '../../../shared/ui/Button.tsx'
import { useMe } from '../../auth/session.ts'

/** Ways to start a chat, each the opening of a message for the user to finish. */
const STARTERS: { label: string; text: string; icon: ReactNode }[] = [
  { label: 'Explain a topic', text: "Explain this to me like I'm new to it: ", icon: <BulbIcon /> },
  { label: 'Draft a message', text: 'Help me write a message that ', icon: <PencilIcon /> },
  { label: 'Brainstorm ideas', text: 'Brainstorm ideas for ', icon: <SparkleIcon /> },
]

interface Props {
  /** Start the message with a starter's text. */
  onStart: (text: string) => void
}

/**
 * What a conversation with no messages shows: a soft illustration, a quiet greeting saying where
 * it is kept, and starters, ways to begin.
 */
export function EmptyConversation(props: Props) {
  const me = useMe()
  return (
    <div className="my-auto flex flex-col items-center py-8 text-center text-muted">
      <ChatsIllustration />
      <h2 className="font-semibold text-heading text-ink-strong leading-tight">
        What can I help with?
      </h2>
      <p className="mt-1.5 max-w-104 text-balance text-ui">
        Describe what you need, or drop in a file to start.{' '}
        {me.storageMode === 'space'
          ? 'This chat is saved to your own PDS.'
          : 'This chat is saved on this server until your PDS supports spaces.'}
      </p>
      <ul className="mt-5 flex flex-wrap justify-center gap-2">
        {STARTERS.map((starter) => (
          <li key={starter.label}>
            <Button onClick={() => props.onStart(starter.text)} className="[&_svg]:text-muted">
              {starter.icon}
              {starter.label}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Two soft speech bubbles: a light face inside a slightly darker rim. */
function ChatsIllustration() {
  const front = (
    <>
      <rect x="16" y="44" width="104" height="64" rx="22" />
      <path d="M30 98 22 120l26-14Z" />
    </>
  )
  return (
    <svg viewBox="0 0 168 132" aria-hidden="true" className="mb-5 h-auto w-36">
      <g className="fill-illo-back">
        <rect x="54" y="14" width="96" height="62" rx="22" />
        <path d="M122 72 146 92 140 66Z" />
      </g>
      <g className="fill-illo-rim stroke-6 stroke-illo-rim [stroke-linejoin:round]">{front}</g>
      <g className="fill-illo-face">{front}</g>
      <rect x="36" y="64" width="56" height="8" rx="4" className="fill-illo-rim" />
      <rect x="36" y="80" width="36" height="8" rx="4" className="fill-illo-rim" />
    </svg>
  )
}
