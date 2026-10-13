import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Markdown } from '../../src/parts/markdown.tsx'

describe('Markdown', () => {
  it('colors code by the theme, a token at a time, once its language loads', async () => {
    const { container } = render(<Markdown text={'```ts\nconst a = 1\n```'} />)
    await waitFor(() =>
      expect(container.querySelector('.code-block .line > span')).toHaveStyle({
        color: 'var(--color-code-token-keyword)',
      }),
    )
    expect(container.querySelector('.code-block')).toHaveTextContent('const a = 1')
  })

  it('shows code in a language it does not know as plain text', async () => {
    const { container } = render(<Markdown text={'```nonsense\nsome words\n```'} />)
    await waitFor(() =>
      expect(container.querySelector('.code-block')).toHaveTextContent('some words'),
    )
  })

  it('completes the Markdown a stream leaves half written', () => {
    const bold = render(<Markdown text="Use **spacers and" streaming />)
    expect(bold.container.querySelector('strong')).toHaveTextContent('spacers and')
    bold.unmount()
    // A link still being written reads as its text, with nowhere to go yet.
    const { container } = render(<Markdown text="See [the guide](https://exa" streaming />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(container).toHaveTextContent('See the guide')
  })

  it('leaves Markdown as written once the text is done', () => {
    const { container } = render(<Markdown text="Prices start at 5* and go up" />)
    expect(container.querySelector('em, strong')).toBeNull()
  })

  it('offers no Copy for a code block whose fence is still streaming', () => {
    render(<Markdown text={'```ts\nconst a ='} streaming />)
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull()
  })

  it('renders math between double dollars once KaTeX loads', async () => {
    const { container } = render(<Markdown text={'$$x^2$$'} />)
    await waitFor(() => expect(container.querySelector('.katex')).not.toBeNull())
  })

  it('shows HTML in the text as the text it is, never as elements', () => {
    const { container } = render(<Markdown text={'<b>bold</b> <img src="https://x.test/a.png">'} />)
    expect(container.querySelector('b, img')).toBeNull()
    expect(container).toHaveTextContent('<b>bold</b>')
  })
})
