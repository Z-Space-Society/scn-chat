import { Link } from '@tanstack/react-router'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '../../../shared/cn.ts'
import { ChatIcon } from '../../../shared/icons.tsx'
import { plural } from '../../../shared/plural.ts'
import { parseDate, shortTime } from '../../../shared/time.ts'
import { Button } from '../../../shared/ui/Button.tsx'
import { sidebarRow, sidebarScroll } from '../../../shared/ui/sidebar.ts'
import { MATCH_END, MATCH_START, type SearchResult } from '../../../store/search.ts'
import { ChatRowsSkeleton } from './ChatListSkeleton.tsx'

const MATCH = new RegExp(`(${MATCH_START}[^${MATCH_END}]*${MATCH_END})`)

interface SnippetProps {
  text: string
}

/** A snippet with its marked matches as highlight elements. */
export function Snippet(props: SnippetProps) {
  // Each piece is keyed by where it starts in the text, which no other piece shares.
  const pieces: { piece: string; start: number }[] = []
  let start = 0
  for (const piece of props.text.split(MATCH)) {
    pieces.push({ piece, start })
    start += piece.length
  }
  return (
    <>
      {pieces.map(({ piece, start }) =>
        piece.startsWith(MATCH_START) ? <mark key={start}>{piece.slice(1, -1)}</mark> : piece,
      )}
    </>
  )
}

/** Enough of a node of the HTML syntax tree to find and split its text. */
type HtmlNode = {
  type: string
  value?: string
  tagName?: string
  properties?: object
  children?: HtmlNode[]
}

// A link the snippet cut through, before it parses: its URL running into the snippet's end, its
// opening bracket cut off, or its closing bracket cut off.
const CUT_URL_END = /\]\([^)\s]*?(?=…?$)/
const CUT_LINK_START = /^([^[]*?)\]\([^)\s]*\)/
const CUT_LINK_END = /!?\[(?![^\]]*\])/g

/** Drops what is left of a link the snippet cut through, keeping its text. */
function dropCutLinks(text: string): string {
  return text.replace(CUT_URL_END, '').replace(CUT_LINK_START, '$1').replace(CUT_LINK_END, '')
}

const DELIMITER = /\*+|_+|~{2,}|`+/g
const isSpace = (char: string | undefined) => char === undefined || /\s/.test(char)
const isWord = (char: string | undefined) => char !== undefined && /[\p{L}\p{N}\p{Co}]/u.test(char)

/**
 * Drops the delimiters a snippet's cut left unpaired, which the parser keeps as literal text: a
 * run touching a word on one side, as in `…the **important`. A run between spaces, as in
 * `2 * 3`, or inside a word, as in `snake_case`, stays.
 */
function dropCutDelimiters(text: string): string {
  return text.replace(DELIMITER, (run, offset: number) => {
    const before = text[offset - 1]
    const after = text[offset + run.length]
    const between = (isSpace(before) && isSpace(after)) || (isWord(before) && isWord(after))
    return between ? run : ''
  })
}

/**
 * Splits text nodes at the marked matches, making each match a highlight element, and drops
 * the delimiters the snippet's cut left unpaired, except inside code.
 */
function markMatches(node: HtmlNode) {
  if (!node.children) return
  const code = node.tagName === 'code'
  node.children = node.children.flatMap((child): HtmlNode[] => {
    if (child.type !== 'text') {
      markMatches(child)
      return [child]
    }
    const text = child.value ?? ''
    return (code ? text : dropCutDelimiters(text))
      .split(MATCH)
      .filter(Boolean)
      .map((piece) =>
        piece.startsWith(MATCH_START)
          ? {
              type: 'element',
              tagName: 'mark',
              properties: {},
              children: [{ type: 'text', value: piece.slice(1, -1) }],
            }
          : { type: 'text', value: piece },
      )
  })
}

const remarkPlugins = [remarkGfm]
const rehypePlugins = [() => markMatches]
// Inline styling only, so the snippet stays one run of text. Other elements give way to their
// text, and images, which have none, drop out.
const inlineElements = ['strong', 'em', 'del', 'code', 'mark']

/** A snippet of a reply with its Markdown styled inline, as the reply shows it. */
export function MarkdownSnippet(props: SnippetProps) {
  return (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      allowedElements={inlineElements}
      unwrapDisallowed
    >
      {dropCutLinks(props.text)}
    </ReactMarkdown>
  )
}

interface ResultProps {
  result: SearchResult
}

/** The words of a matching message, its Markdown styled inline when the assistant wrote it. */
function MessageSnippet(props: ResultProps) {
  if (props.result.role === 'assistant') return <MarkdownSnippet text={props.result.snippet} />
  return <Snippet text={props.result.snippet} />
}

/** When, muted and a step bolder at the row's end, so it never reads as part of the words. */
function When(props: ResultProps) {
  const time = parseDate(props.result.time)
  if (!time) return null
  return (
    <time
      dateTime={props.result.time}
      className="ms-auto flex-none font-medium text-caption text-muted tabular-nums"
    >
      {shortTime(time)}
    </time>
  )
}

/**
 * Matches are words on a faint tint, in the text's own ink, without padding that would push the
 * text apart.
 */
const marks = '[&_mark]:rounded-mark [&_mark]:bg-match [&_mark]:font-medium [&_mark]:text-inherit'

interface ChatResultsProps {
  /** The chat's title match, when its title matched. */
  head: SearchResult | undefined
  matches: SearchResult[]
}

/** A chat's title once, with when for a title match, over its matching messages. */
function ChatResults(props: ChatResultsProps) {
  const first = props.head ?? props.matches[0]
  if (!first) return null
  return (
    <li>
      <Link
        to="/chat/$skey"
        params={{ skey: first.skey }}
        className={cn(sidebarRow, marks, 'gap-2')}
      >
        <ChatIcon />
        <span className="min-w-0 flex-1 truncate text-ink-strong" dir="auto">
          {props.head ? <Snippet text={props.head.snippet} /> : first.title || 'New chat'}
        </span>
        {props.head && <When result={props.head} />}
      </Link>
      {props.matches.length > 0 && (
        // The messages' text lines up with the title's, after its icon.
        <ul className="ms-[calc(var(--spacing-icon)+--spacing(2))] flex flex-col gap-0.5">
          {props.matches.map((result) => (
            <li key={result.rkey}>
              <Link
                to="/chat/$skey"
                params={{ skey: result.skey }}
                search={{ m: result.rkey ?? undefined }}
                className={cn(sidebarRow, marks, 'items-baseline gap-2 whitespace-normal py-1.5')}
              >
                <span className="line-clamp-2 min-w-0 flex-1 font-normal text-row-ink text-small leading-[1.4] [&_code]:rounded-badge [&_code]:bg-surface [&_code]:px-1 [&_code]:text-code [&_strong]:font-semibold [&_strong]:text-ink">
                  {result.role === 'user' && (
                    // Who said it, as a small grey badge before their words.
                    <span className="me-1.5 inline-block rounded-badge bg-row-active px-1.25 font-medium text-caption text-muted leading-[1.4]">
                      You<span className="sr-only">: </span>
                    </span>
                  )}
                  <MessageSnippet result={result} />
                </span>
                <When result={result} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

/** Each chat's title match and messages, in the order the chat first appears in the results. */
function byChat(results: SearchResult[]): (ChatResultsProps & { skey: string })[] {
  const chats = new Map<string, ChatResultsProps & { skey: string }>()
  for (const result of results) {
    const chat = chats.get(result.skey) ?? { skey: result.skey, head: undefined, matches: [] }
    if (result.rkey) chat.matches.push(result)
    else chat.head = result
    chats.set(result.skey, chat)
  }
  return [...chats.values()]
}

interface SearchResultsProps {
  /** What was searched for, to name it when nothing matches. */
  query: string
  results: SearchResult[]
  remaining: number
  /** Whether the first search is on its way, before which there are no results to tell of. */
  loading?: boolean
  /** Close the search, so the chats show again. */
  onClear: () => void
}

export function SearchResults(props: SearchResultsProps) {
  if (props.loading)
    return (
      <div className={sidebarScroll}>
        <ChatRowsSkeleton label="Searching" />
      </div>
    )
  return (
    <div className={sidebarScroll}>
      {props.remaining > 0 && (
        <p role="status" className="px-row-inset text-muted text-small">
          {plural(props.remaining, {
            one: 'Still downloading # chat.',
            other: 'Still downloading # chats.',
          })}
        </p>
      )}
      {props.results.length === 0 ? (
        <p className="px-row-inset text-muted text-small">
          No chats match “{props.query.trim()}”.{' '}
          <Button tone="link" onClick={props.onClear}>
            Clear search
          </Button>
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {byChat(props.results).map((chat) => (
            <ChatResults key={chat.skey} head={chat.head} matches={chat.matches} />
          ))}
        </ul>
      )}
    </div>
  )
}
