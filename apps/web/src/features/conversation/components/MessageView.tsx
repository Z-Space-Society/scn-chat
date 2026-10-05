import { type ReactNode, useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { StreamedReply } from '../lib/reply-stream.ts'

type Part = Record<string, unknown> & { $type: string }
type Blob = { ref: { $link: string }; mimeType: string }

export interface MessageViewProps {
  id?: string
  record: Record<string, unknown>
  /** What a pending reply shows in place of "Thinking...", such as its stream. */
  pending?: ReactNode
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

interface MarkdownImageProps {
  src: string
  alt?: string
}

/** An image from model output, loaded only on click, since loading it could leak the chat through its URL. */
function MarkdownImage(props: MarkdownImageProps) {
  const [shown, setShown] = useState(false)
  if (shown) return <img src={props.src} alt={props.alt ?? ''} referrerPolicy="no-referrer" />
  return (
    <span className="image-placeholder">
      {props.alt && <>{props.alt} </>}
      <code>{props.src}</code>{' '}
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

const remarkPlugins = [remarkGfm]

interface MarkdownProps {
  text: string
}

/** Assistant text as Markdown. Raw HTML in it is not rendered. */
function Markdown(props: MarkdownProps) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={remarkPlugins} components={markdownComponents}>
        {props.text}
      </ReactMarkdown>
    </div>
  )
}

interface TextProps {
  text: string
  role: unknown
}

function Text(props: TextProps) {
  return props.role === 'assistant' ? (
    <Markdown text={props.text} />
  ) : (
    <p className="text">{props.text}</p>
  )
}

interface PartViewProps {
  part: Part
  role: unknown
  blobUrl: MessageViewProps['blobUrl']
}

function PartView(props: PartViewProps) {
  switch (kind(props.part)) {
    case 'textPart':
      return <Text text={props.part.text as string} role={props.role} />
    case 'reasoningPart':
      return (
        <details>
          <summary>Reasoning</summary>
          <p className="text">{(props.part.text as string | undefined) ?? ''}</p>
        </details>
      )
    case 'toolCallPart':
      return (
        <details>
          <summary>Tool call: {props.part.tool as string}</summary>
          <pre>{props.part.input as string}</pre>
        </details>
      )
    case 'toolResultPart':
      return (
        <details>
          <summary>{props.part.isError ? 'Tool error' : 'Tool result'}</summary>
          <pre>{props.part.output as string}</pre>
        </details>
      )
    case 'sourcePart':
      return (
        <a href={props.part.url as string} target="_blank" rel="noreferrer">
          {(props.part.title as string | undefined) ?? (props.part.url as string)}
        </a>
      )
    case 'imagePart': {
      const image = props.part.image as Blob
      return (
        <img
          src={props.blobUrl(image.ref.$link, image.mimeType)}
          alt={(props.part.alt as string | undefined) ?? ''}
        />
      )
    }
    case 'filePart': {
      const file = props.part.file as Blob
      return (
        <a href={props.blobUrl(file.ref.$link)}>
          {(props.part.name as string | undefined) ?? 'Attached file'}
        </a>
      )
    }
    default:
      // Skip part types this view doesn't know about.
      return null
  }
}

interface SiblingPickerProps {
  siblings: NonNullable<MessageViewProps['siblings']>
}

/** Arrows to step between alternative versions of a message. */
function SiblingPicker(props: SiblingPickerProps) {
  return (
    <span className="siblings">
      <button
        type="button"
        aria-label="Previous version"
        disabled={props.siblings.index === 0}
        onClick={() => props.siblings.onPick(props.siblings.index - 1)}
      >
        ‹
      </button>
      {props.siblings.index + 1} / {props.siblings.count}
      <button
        type="button"
        aria-label="Next version"
        disabled={props.siblings.index === props.siblings.count - 1}
        onClick={() => props.siblings.onPick(props.siblings.index + 1)}
      >
        ›
      </button>
    </span>
  )
}

interface StreamingReplyProps {
  streaming: StreamedReply
}

/** The reasoning and text streamed so far, shown until the reply's record arrives. */
export function StreamingReply(props: StreamingReplyProps) {
  return (
    <>
      {props.streaming.reasoning && (
        <details>
          <summary>Reasoning</summary>
          <p className="text">{props.streaming.reasoning}</p>
        </details>
      )}
      {props.streaming.text && <Markdown text={props.streaming.text} />}
    </>
  )
}

interface StatusProps extends Pick<MessageViewProps, 'record' | 'pending'> {}

/** A line for a message that is still thinking, failed, or was stopped. */
function Status(props: StatusProps) {
  switch (props.record.status) {
    case 'pending':
      return props.pending === undefined ? <p>Thinking...</p> : null
    case 'error':
      return (
        <p role="alert">Error{props.record.error ? `: ${props.record.error as string}` : ''}</p>
      )
    case 'cancelled':
      return <p>Stopped.</p>
    default:
      return null
  }
}

/** One message: its parts, its state, sibling controls, and actions. */
export function MessageView(props: MessageViewProps) {
  const record = props.record
  const content = record.content as { $type: string; parts?: Part[] }
  const encrypted = content.$type.endsWith('#encryptedContent')
  const parts = content.parts ?? []
  const sources = parts.filter((part) => kind(part) === 'sourcePart')
  const shown = withKeys(parts.filter((part) => kind(part) !== 'sourcePart'))
  return (
    <article id={props.id} className={`message ${record.role as string}`}>
      <header>
        <strong>{record.role === 'user' ? 'You' : 'Assistant'}</strong>
        {props.siblings && props.siblings.count > 1 && <SiblingPicker siblings={props.siblings} />}
      </header>
      {shown.map(({ part, key }) => (
        <PartView key={key} part={part} role={record.role} blobUrl={props.blobUrl} />
      ))}
      {record.status === 'pending' && props.pending}
      {sources.length > 0 && (
        <ul>
          {sources.map((part) => (
            <li key={part.url as string}>
              <PartView part={part} role={record.role} blobUrl={props.blobUrl} />
            </li>
          ))}
        </ul>
      )}
      {encrypted && <p>This message is encrypted.</p>}
      <Status record={record} pending={props.pending} />
      {props.actions && <footer>{props.actions}</footer>}
    </article>
  )
}
