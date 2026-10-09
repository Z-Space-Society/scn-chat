import { useState } from 'react'
import ReactMarkdown, { type Components, type Options } from 'react-markdown'
import remarkGfm from 'remark-gfm'

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
      <button type="button" onClick={() => setShown(true)}>
        Load image
      </button>
    </span>
  )
}

/** The components that Markdown node names render as. */
export const markdownComponents: Components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
  img: ({ src, alt }) => {
    if (typeof src !== 'string' || !src) return null
    return <MarkdownImage src={src} alt={alt} />
  },
}

interface Props {
  text: string
}

/** Assistant text as Markdown. Raw HTML in it is not rendered. */
export function Markdown(props: Props) {
  return (
    <div className="markdown">
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
