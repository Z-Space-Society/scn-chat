import { type ReactNode, useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { StreamedReply } from '../lib/reply-stream.ts'

type Part = Record<string, unknown> & { $type: string }
type Blob = { ref: { $link: string }; mimeType: string }

export type MessageViewProps = {
  id?: string
  record: Record<string, unknown>
  /** Text and reasoning streamed so far for a pending reply. */
  streaming?: StreamedReply
  blobUrl: (cid: string, mimeType?: string) => string
  siblings?: { index: number; count: number; onPick: (index: number) => void }
  actions?: ReactNode
}

const kind = (part: Part) => part.$type.split('#')[1]

/** What tells a part apart within its message, since only tool parts carry an id. */
function partIdentity(part: Part): string {
  const blob = (part.image ?? part.file) as Blob | undefined
  return `${part.$type}:${(part.callId ?? blob?.ref.$link ?? part.text ?? '') as string}`
}

/** A message's parts with stable keys, counting repeats of the same identity. */
function withKeys(parts: Part[]): { part: Part; key: string }[] {
  const seen = new Map<string, number>()
  return parts.map((part) => {
    const identity = partIdentity(part)
    const count = seen.get(identity) ?? 0
    seen.set(identity, count + 1)
    return { part, key: `${identity}#${count}` }
  })
}

/** An image from model output, loaded only on click, since loading it could leak the chat through its URL. */
function MarkdownImage({ src, alt }: { src: string; alt?: string }) {
  const [shown, setShown] = useState(false)
  if (shown) return <img src={src} alt={alt ?? ''} referrerPolicy="no-referrer" />
  return (
    <span className="image-placeholder">
      {alt && <>{alt} </>}
      <code>{src}</code>{' '}
      <button type="button" onClick={() => setShown(true)}>
        Load image
      </button>
    </span>
  )
}

const markdownComponents: Components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
  img: ({ src, alt }) =>
    typeof src === 'string' && src ? <MarkdownImage src={src} alt={alt} /> : null,
}

/** Assistant text as Markdown. Raw HTML in it is not rendered. */
function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {text}
      </ReactMarkdown>
    </div>
  )
}

function Text({ text, role }: { text: string; role: unknown }) {
  return role === 'assistant' ? <Markdown text={text} /> : <p className="text">{text}</p>
}

function PartView({
  part,
  role,
  blobUrl,
}: {
  part: Part
  role: unknown
  blobUrl: MessageViewProps['blobUrl']
}) {
  switch (kind(part)) {
    case 'textPart':
      return <Text text={part.text as string} role={role} />
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
export function MessageView({
  id,
  record,
  streaming,
  blobUrl,
  siblings,
  actions,
}: MessageViewProps) {
  const content = record.content as { $type: string; parts?: Part[] }
  const encrypted = content.$type.endsWith('#encryptedContent')
  const parts = content.parts ?? []
  const sources = parts.filter((part) => kind(part) === 'sourcePart')
  const shown = withKeys(parts.filter((part) => kind(part) !== 'sourcePart'))
  return (
    <article id={id} className={`message ${record.role as string}`}>
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
      {shown.map(({ part, key }) => (
        <PartView key={key} part={part} role={record.role} blobUrl={blobUrl} />
      ))}
      {streaming !== undefined && record.status === 'pending' && (
        <>
          {streaming.reasoning && (
            <details>
              <summary>Reasoning</summary>
              <p className="text">{streaming.reasoning}</p>
            </details>
          )}
          {streaming.text && <Markdown text={streaming.text} />}
        </>
      )}
      {sources.length > 0 && (
        <ul>
          {sources.map((part) => (
            <li key={part.url as string}>
              <PartView part={part} role={record.role} blobUrl={blobUrl} />
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
