import { type ReactNode, useState } from 'react'
import ReactMarkdown, { type Components, type Options } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '../shared/cn.ts'
import { Button } from '../shared/ui/Button.tsx'
import { CopyButton } from '../shared/ui/CopyButton.tsx'

export const remarkPlugins: Options['remarkPlugins'] = [remarkGfm]

export const rehypePlugins: Options['rehypePlugins'] = []

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

/** A node of the Markdown syntax tree, enough to read its text. */
type TextNode = { type: string; value?: unknown; children?: TextNode[] }

/** The text inside a node of the Markdown syntax tree. */
const textOf = (node: TextNode): string =>
  node.type === 'text' ? String(node.value) : (node.children ?? []).map(textOf).join('')

interface CodeBlockProps {
  /** The code, to copy. */
  text: string
  children: ReactNode
}

/**
 * A fenced code block, with a button in its corner that copies its code, shown on hover like the
 * message actions, and always on a touch screen.
 */
function CodeBlock(props: CodeBlockProps) {
  return (
    <div className="code-block group/code relative">
      {/* Code reads left to right whatever the text around it. */}
      <pre dir="ltr">{props.children}</pre>
      <div className="absolute end-1.5 top-1.5 opacity-0 touch:opacity-100 transition-opacity duration-(--dur-feedback) focus-within:opacity-100 group-hover/code:opacity-100">
        <CopyButton text={props.text} className="rounded-badge px-2 py-0.5 text-caption" />
      </div>
    </div>
  )
}

/**
 * The components that Markdown node names render as. Each block of prose takes its direction from
 * its own text, so a reply can mix scripts.
 */
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
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
  pre: ({ node, children }) => (
    // The fence's closing newline is not part of the code.
    <CodeBlock text={node ? textOf(node as TextNode).replace(/\n$/, '') : ''}>{children}</CodeBlock>
  ),
  img: ({ src, alt }) => {
    if (typeof src !== 'string' || !src) return null
    return <MarkdownImage src={src} alt={alt} />
  },
}

interface Props {
  text: string
  className?: string
}

/** The model's text as Markdown, in a reply or its reasoning. Raw HTML in it is not rendered. */
export function Markdown(props: Props) {
  return (
    <div className={cn('markdown', props.className)}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={markdownComponents}
      >
        {props.text}
      </ReactMarkdown>
    </div>
  )
}
