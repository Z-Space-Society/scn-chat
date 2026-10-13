import { describe, expect, it } from 'vitest'
import { splitQuotes } from '../../src/parts/quotes.ts'

describe('splitQuotes', () => {
  it('splits quotes from the text under them, without their markers or the blank lines between', () => {
    expect(splitQuotes('> first line\n> second line\n\nAbout this:')).toEqual([
      { quote: true, text: 'first line\nsecond line' },
      { quote: false, text: 'About this:' },
    ])
  })

  it('keeps quotes separated by a blank line apart, and an empty quote line inside a quote', () => {
    expect(splitQuotes('> a\n>\n> b\n\n> c\n\nText')).toEqual([
      { quote: true, text: 'a\n\nb' },
      { quote: true, text: 'c' },
      { quote: false, text: 'Text' },
    ])
  })

  it('leaves text without quotes as one block, as written', () => {
    expect(splitQuotes('  indented\n\nnext >not a quote')).toEqual([
      { quote: false, text: '  indented\n\nnext >not a quote' },
    ])
  })
})
