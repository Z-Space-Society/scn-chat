import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useDocumentTitle } from '../../src/shared/useDocumentTitle.ts'

interface ProbeProps {
  title: string | undefined
}

function Probe(props: ProbeProps) {
  useDocumentTitle(props.title)
  return null
}

beforeEach(() => {
  const meta = document.createElement('meta')
  meta.name = 'application-name'
  meta.content = 'SCN Chat'
  document.head.append(meta)
  document.title = 'SCN Chat'
})
afterEach(() => document.head.querySelector('meta[name="application-name"]')?.remove())

describe('useDocumentTitle', () => {
  it("puts the page's title before the app's name, and the old title back on leaving", () => {
    const { rerender, unmount } = render(<Probe title="Tile quotes" />)
    expect(document.title).toBe('Tile quotes · SCN Chat')
    rerender(<Probe title="Floors" />)
    expect(document.title).toBe('Floors · SCN Chat')
    unmount()
    expect(document.title).toBe('SCN Chat')
  })

  it('changes nothing while the title is on its way', () => {
    const { rerender } = render(<Probe title={undefined} />)
    expect(document.title).toBe('SCN Chat')
    rerender(<Probe title="Tile quotes" />)
    expect(document.title).toBe('Tile quotes · SCN Chat')
  })

  it('keeps a title the router set since, as for the next page', () => {
    const { unmount } = render(<Probe title="Tile quotes" />)
    document.title = 'Settings · SCN Chat'
    unmount()
    expect(document.title).toBe('Settings · SCN Chat')
  })
})
