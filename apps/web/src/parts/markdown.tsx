import { cjk } from '@streamdown/cjk'
import {
  type ComponentProps,
  type MouseEvent,
  memo,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { ThemedToken, TokensResult } from 'shiki'
import {
  type Components,
  defaultRehypePlugins,
  extractTableDataFromElement,
  type MathPlugin,
  Streamdown,
  tableDataToCSV,
  tableDataToMarkdown,
  tableDataToTSV,
  useIsCodeFenceIncomplete,
} from 'streamdown'
import { cn } from '../shared/cn.ts'
import { DownloadIcon } from '../shared/icons.tsx'
import { Button, IconButton } from '../shared/ui/Button.tsx'
import { CopyButton, CopyIconSwap } from '../shared/ui/CopyButton.tsx'
import { ActionMenu, blockAction, blockActions } from './BlockActions.tsx'
import { codeFilename, downloadText } from './download.ts'

/*
 * The model's text, rendered by Streamdown, which completes the Markdown a stream leaves half
 * written, such as an open fence or a link still being typed, and renders a long reply block by
 * block, so the blocks already written don't render again as text arrives. Every element is one of
 * ours, styled by markdown.css, since Streamdown's own are styled for another theme.
 */

/** Without rehype-raw, so HTML in the model's text is not rendered. */
const { raw: _raw, ...safeRehypePlugins } = defaultRehypePlugins
const rehypePlugins = Object.values(safeRehypePlugins)

/** Emphasis beside Chinese, Japanese, and Korean punctuation, and math once it loads. */
const withoutMath: Plugins = { cjk }
interface Plugins {
  cjk: typeof cjk
  math?: MathPlugin
}
let withMath: Plugins | null = null
let mathLoading: Promise<Plugins> | null = null

function loadMath() {
  if (!mathLoading)
    mathLoading = import('./math.ts').then((module) => {
      const plugins = { cjk, math: module.math }
      withMath = plugins
      return plugins
    })
  return mathLoading
}

/** The plugins for a text, with math once it holds some and KaTeX has loaded. */
function usePlugins(text: string) {
  const hasMath = text.includes('$$')
  const [loaded, setLoaded] = useState(withMath)
  useEffect(() => {
    if (!hasMath || loaded) return
    let live = true
    void loadMath().then((plugins) => {
      if (live) setLoaded(plugins)
    })
    return () => {
      live = false
    }
  }, [hasMath, loaded])
  if (hasMath && loaded) return loaded
  return withoutMath
}

/** Links and pictures open nothing on their own, so the link confirmation and controls are off. */
const linkSafety = { enabled: false }

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
      <Button size="small" onClick={() => setShown(true)}>
        Load image
      </Button>
    </span>
  )
}

type Highlighter = typeof import('./highlight.ts')

let loading: Promise<Highlighter> | null = null
/** The highlighter once it has loaded, so a block can highlight before it is first drawn. */
let loaded: Highlighter | null = null

/** Shiki and the theme, loaded the first time a code block renders. */
function loadHighlighter() {
  if (!loading)
    loading = import('./highlight.ts').then((module) => {
      loaded = module
      return module
    })
  return loading
}

/**
 * The code's tokens once its language's grammar loads, or null to show it plain. Code still
 * streaming highlights as it grows. Finished code Shiki has highlighted before is colored from its
 * block's first frame, as when a reply's record replaces its stream, rather than drawn plain and
 * then again in color. Other code is highlighted a moment after it first draws, since Shiki
 * answers through a promise even once its grammar has loaded.
 */
function useHighlight(code: string, language: string, incomplete: boolean) {
  const [result, setResult] = useState<TokensResult | null>(() =>
    loaded && language && !incomplete ? loaded.highlighted(code, language) : null,
  )
  useLayoutEffect(() => {
    if (!language) return
    let live = true
    const show = (next: TokensResult) => {
      if (live) setResult(next)
    }
    const run = (module: Highlighter) => {
      const ready = module.highlight(code, language, incomplete, show)
      if (ready) show(ready)
    }
    // Before the browser paints, when Shiki is here already.
    if (loaded) run(loaded)
    else void loadHighlighter().then(run)
    return () => {
      live = false
    }
  }, [code, language, incomplete])
  return result
}

interface LineProps {
  text: string
  /** The line's tokens, which may be from the code before its newest text arrived. */
  tokens: ThemedToken[] | undefined
}

/**
 * A line's tokens, when the highlight has reached it, or its plain text until then. Memoized, so a
 * streaming block renders only its newest lines as it grows: the highlighter carries the tokens of
 * finished lines over from one highlight to the next.
 */
const Line = memo(function Line(props: LineProps) {
  const tokens = props.tokens
  if (!tokens || tokens.map((token) => token.content).join('') !== props.text) return props.text
  return (
    <>
      {tokens.map((token, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a line's tokens have no identity beyond their place.
        <span key={i} style={{ color: token.color ?? token.htmlStyle?.color }}>
          {token.content}
        </span>
      ))}
    </>
  )
})

interface CodeBlockProps {
  className?: string
  children?: ReactNode
}

/**
 * A fenced code block, highlighted once its language loads, with buttons in its corner that copy
 * its code and download it as a file named for its language. While its fence is still streaming it
 * highlights as it grows, and has nothing to copy or download yet.
 */
function CodeBlock(props: CodeBlockProps) {
  const incomplete = useIsCodeFenceIncomplete()
  const language = /language-(\S+)/.exec(props.className ?? '')?.[1] ?? ''
  // The fence's closing newline is not part of the code.
  const code = String(props.children ?? '').replace(/\n$/, '')
  const result = useHighlight(code, language, incomplete)
  const lines = code.split('\n')
  return (
    <div className="code-block group/block relative" data-language={language || undefined}>
      {/* Code reads left to right whatever the text around it. */}
      <pre dir="ltr">
        <code>
          {lines.map((line, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: lines have no identity beyond their place.
            <span key={i} className="line">
              <Line text={line} tokens={result?.tokens[i]} />
              {i < lines.length - 1 && '\n'}
            </span>
          ))}
        </code>
      </pre>
      {!incomplete && (
        <div className={blockActions}>
          <CopyButton icon text={code} className={blockAction} />
          <IconButton
            aria-label="Download"
            onClick={() => downloadText(code, codeFilename(language), 'text/plain')}
            className={blockAction}
          >
            <DownloadIcon />
          </IconButton>
        </div>
      )}
    </div>
  )
}

/** Copy text, to be told once it is copied. */
const copyText = (text: string) => navigator.clipboard.writeText(text)

/**
 * A table across the column, with menus in its corner that copy it as Markdown, CSV, or TSV, or download it as CSV or
 * Markdown, read from the table as it shows when chosen.
 */
function TableBlock(props: ComponentProps<'table'>) {
  const table = useRef<HTMLTableElement>(null)
  const data = () => extractTableDataFromElement(table.current as HTMLTableElement)
  return (
    <div className="table-block group/block relative">
      <div className="table-scroll">
        <table ref={table} {...props} />
      </div>
      <div className={blockActions}>
        <ActionMenu
          label="Copy table"
          done="Copied"
          icon={(copied) => <CopyIconSwap copied={copied} />}
          items={[
            { label: 'Markdown', run: () => copyText(tableDataToMarkdown(data())) },
            { label: 'CSV', run: () => copyText(tableDataToCSV(data())) },
            { label: 'TSV', run: () => copyText(tableDataToTSV(data())) },
          ]}
        />
        <ActionMenu
          label="Download table"
          icon={() => <DownloadIcon />}
          items={[
            {
              label: 'CSV',
              run: () => downloadText(tableDataToCSV(data()), 'table.csv', 'text/csv'),
            },
            {
              label: 'Markdown',
              run: () => downloadText(tableDataToMarkdown(data()), 'table.md', 'text/markdown'),
            },
          ]}
        />
      </div>
    </div>
  )
}

/**
 * The components that Markdown node names render as, every one of ours. Each block of prose takes
 * its direction from its own text, so a reply can mix scripts.
 */
/**
 * Follows a link within the text, such as a footnote and its way back, inside the same text, since
 * every reply numbers its footnotes from one and a plain jump would land in the first reply's.
 */
function jumpInText(event: MouseEvent<HTMLAnchorElement>) {
  const id = decodeURIComponent(event.currentTarget.hash.slice(1))
  const target = event.currentTarget.closest('.markdown')?.querySelector(`[id="${CSS.escape(id)}"]`)
  if (!target) return
  event.preventDefault()
  target.scrollIntoView({ block: 'center' })
}

export const markdownComponents: Components = {
  p: ({ node: _node, ...props }) => <p {...props} dir="auto" />,
  li: ({ node: _node, ...props }) => <li {...props} dir="auto" />,
  ul: ({ node: _node, ...props }) => <ul {...props} dir="auto" />,
  ol: ({ node: _node, ...props }) => <ol {...props} dir="auto" />,
  blockquote: ({ node: _node, ...props }) => <blockquote {...props} dir="auto" />,
  h1: ({ node: _node, ...props }) => <h1 {...props} dir="auto" />,
  h2: ({ node: _node, ...props }) => <h2 {...props} dir="auto" />,
  h3: ({ node: _node, ...props }) => <h3 {...props} dir="auto" />,
  h4: ({ node: _node, ...props }) => <h4 {...props} dir="auto" />,
  h5: ({ node: _node, ...props }) => <h5 {...props} dir="auto" />,
  h6: ({ node: _node, ...props }) => <h6 {...props} dir="auto" />,
  strong: ({ node: _node, ...props }) => <strong {...props} />,
  hr: ({ node: _node, ...props }) => <hr {...props} />,
  sup: ({ node: _node, ...props }) => <sup {...props} />,
  sub: ({ node: _node, ...props }) => <sub {...props} />,
  section: ({ node: _node, ...props }) => <section {...props} />,
  table: ({ node: _node, ...props }) => <TableBlock {...props} />,
  thead: ({ node: _node, ...props }) => <thead {...props} />,
  tbody: ({ node: _node, ...props }) => <tbody {...props} />,
  tr: ({ node: _node, ...props }) => <tr {...props} />,
  th: ({ node: _node, ...props }) => <th {...props} />,
  td: ({ node: _node, ...props }) => <td {...props} />,
  // A link still being written has no address yet, so it reads as its text until it does.
  a: ({ node: _node, href, ...props }) => {
    if (!href || href.startsWith('streamdown:')) return <span>{props.children}</span>
    // Streamdown's hardening gives every link a new tab, so a link within the text drops it.
    if (href.startsWith('#')) {
      const { target: _target, rel: _rel, ...inText } = props
      return <a {...inText} href={href} onClick={jumpInText} />
    }
    return <a {...props} href={href} target="_blank" rel="noreferrer" />
  },
  inlineCode: ({ node: _node, ...props }) => <code {...props} />,
  code: ({ className, children }) => <CodeBlock className={className}>{children}</CodeBlock>,
  img: ({ src, alt }) => {
    if (typeof src !== 'string' || !src) return null
    return <MarkdownImage src={src} alt={alt} />
  },
}

interface Props {
  text: string
  className?: string
  /** Whether the text is still being written, so its unfinished Markdown is completed as it goes. */
  streaming?: boolean
}

/** The model's text as Markdown, in a reply or its reasoning. Raw HTML in it is not rendered. */
export function Markdown(props: Props) {
  const plugins = usePlugins(props.text)
  return (
    <div className={cn('markdown', props.className)}>
      <Streamdown
        mode={props.streaming ? 'streaming' : 'static'}
        isAnimating={props.streaming}
        rehypePlugins={rehypePlugins}
        plugins={plugins}
        components={markdownComponents}
        controls={false}
        linkSafety={linkSafety}
      >
        {props.text}
      </Streamdown>
    </div>
  )
}
