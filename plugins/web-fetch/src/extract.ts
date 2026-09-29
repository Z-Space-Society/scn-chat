import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'
import TurndownService from 'turndown'

const CLUTTER = 'script, style, nav, header, footer, noscript, template, iframe'

/** Point links and images at absolute URLs, so the model can fetch the content. */
function absolutize(document: ReturnType<typeof parseHTML>['document'], base: string) {
  for (const [selector, attribute] of [
    ['a[href]', 'href'],
    ['img[src]', 'src'],
  ] as const) {
    for (const element of document.querySelectorAll(selector)) {
      const value = element.getAttribute(attribute) ?? ''
      if (URL.canParse(value, base)) element.setAttribute(attribute, new URL(value, base).href)
    }
  }
}

/** The page's title and main text as Markdown, without navigation, scripts, and other clutter. */
export function htmlToMarkdown(html: string, url: string): { title?: string; markdown: string } {
  const { document } = parseHTML(html)
  const title = document.title?.trim() || undefined
  for (const element of document.querySelectorAll(CLUTTER)) element.remove()
  absolutize(document, url)
  const article = new Readability(parseHTML(document.toString()).document as never).parse()
  if (!article?.content) return { title, markdown: '' }
  const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })
  return {
    title: article.title?.trim() || title,
    markdown: turndown.turndown(article.content).trim(),
  }
}
