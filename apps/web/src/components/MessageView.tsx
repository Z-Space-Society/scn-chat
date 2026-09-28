import type { ReactNode } from 'react'
import type { StreamedReply } from './useReplyStream.ts'

type Part = Record<string, unknown> & { $type: string }
type Blob = { ref: { $link: string }; mimeType: string }

export type MessageViewProps = {
  record: Record<string, unknown>
  /** Text and reasoning streamed so far for a pending reply. */
  streaming?: StreamedReply
  blobUrl: (cid: string, mimeType?: string) => string
  siblings?: { index: number; count: number; onPick: (index: number) => void }
  actions?: ReactNode
}

const kind = (part: Part) => part.$type.split('#')[1]

function PartView({ part, blobUrl }: { part: Part; blobUrl: MessageViewProps['blobUrl'] }) {
  switch (kind(part)) {
    case 'textPart':
      return <p className="text">{part.text as string}</p>
    case 'reasoningPart':
      return (
        <details>
          <summary>Reasoning</summary>
          <p className="text">{(part.text as string | undefined) ?? ''}</p>
        </details>
      )
    case 'toolCallPart':
      return (
        <details>
          <summary>Tool call: {part.tool as string}</summary>
          <pre>{part.input as string}</pre>
        </details>
      )
    case 'toolResultPart':
      return (
        <details>
          <summary>{part.isError ? 'Tool error' : 'Tool result'}</summary>
          <pre>{part.output as string}</pre>
        </details>
      )
    case 'sourcePart':
      return (
        <a href={part.url as string} target="_blank" rel="noreferrer">
          {(part.title as string | undefined) ?? (part.url as string)}
        </a>
      )
    case 'imagePart': {
      const image = part.image as Blob
      return (
        <img
          src={blobUrl(image.ref.$link, image.mimeType)}
          alt={(part.alt as string | undefined) ?? ''}
        />
      )
    }
    case 'filePart': {
      const file = part.file as Blob
      return (
        <a href={blobUrl(file.ref.$link)}>{(part.name as string | undefined) ?? 'Attached file'}</a>
      )
    }
    default:
      // Skip part types this view doesn't know about.
      return null
  }
}

/** One message: its parts, its state, sibling controls, and actions. */
export function MessageView({ record, streaming, blobUrl, siblings, actions }: MessageViewProps) {
  const content = record.content as { $type: string; parts?: Part[] }
  const encrypted = content.$type.endsWith('#encryptedContent')
  const parts = content.parts ?? []
  const sources = parts.filter((part) => kind(part) === 'sourcePart')
  return (
    <article className={`message ${record.role as string}`}>
      <header>
        <strong>{record.role === 'user' ? 'You' : 'Assistant'}</strong>
        {siblings && siblings.count > 1 && (
          <span className="siblings">
            <button
              type="button"
              disabled={siblings.index === 0}
              onClick={() => siblings.onPick(siblings.index - 1)}
            >
              ‹
            </button>
            {siblings.index + 1} / {siblings.count}
            <button
              type="button"
              disabled={siblings.index === siblings.count - 1}
              onClick={() => siblings.onPick(siblings.index + 1)}
            >
              ›
            </button>
          </span>
        )}
      </header>
      {parts
        .filter((part) => kind(part) !== 'sourcePart')
        .map((part, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a record's parts keep their order
          <PartView key={i} part={part} blobUrl={blobUrl} />
        ))}
      {streaming !== undefined && record.status === 'pending' && (
        <>
          {streaming.reasoning && (
            <details>
              <summary>Reasoning</summary>
              <p className="text">{streaming.reasoning}</p>
            </details>
          )}
          {streaming.text && <p className="text">{streaming.text}</p>}
        </>
      )}
      {sources.length > 0 && (
        <ul>
          {sources.map((part) => (
            <li key={part.url as string}>
              <PartView part={part} blobUrl={blobUrl} />
            </li>
          ))}
        </ul>
      )}
      {encrypted && <p>This message is encrypted.</p>}
      {record.status === 'pending' && streaming === undefined && <p>Thinking...</p>}
      {record.status === 'error' && (
        <p role="alert">Error{record.error ? `: ${record.error as string}` : ''}</p>
      )}
      {record.status === 'cancelled' && <p>Stopped.</p>}
      {actions && <footer>{actions}</footer>}
    </article>
  )
}
