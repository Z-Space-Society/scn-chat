import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cn, themeNames } from '../../src/shared/cn.ts'

// Read from disk, since the test run leaves stylesheets empty when they are imported.
const src = join(import.meta.dirname, '../../src')
const files = readdirSync(src, { recursive: true, encoding: 'utf8' }).map((path) => ({
  path,
  text: () => readFileSync(join(src, path), 'utf8'),
}))
const theme = readFileSync(join(src, 'styles/theme.css'), 'utf8')
const sources = files.filter((file) => /\.tsx?$/.test(file.path))
const sheets = files.filter(
  (file) => file.path.endsWith('.css') && !/^styles\/(theme|legacy)\.css$/.test(file.path),
)

/** The names the theme defines in one Tailwind namespace, such as ui in --text-ui. */
function namesIn(namespace: string) {
  const pattern = new RegExp(`^\\s*--${namespace}-([a-z][a-z-]*):`, 'gm')
  return [...new Set(Array.from(theme.matchAll(pattern), (match) => match[1]))]
}

// A color, or a length or duration, written into a utility instead of taken from the theme.
const rawColor = /#[0-9a-f]{3,8}\b|\b(?:oklch|oklab|rgba?|hsla?|lab|lch)\(/i
const rawLength = /\d(?:px|rem|em|vh|vw|dvh|svh|ch|ms|s|%)(?![a-z])/i
// An arbitrary value such as p-[13px], or an arbitrary property such as [width:2rem].
const arbitrary = /(?:-|^|[\s'"`:])\[([^\]\s'"`]+)\]/g

describe('the theme', () => {
  it('lists every name tailwind-merge needs in cn', () => {
    expect(themeNames.text).toEqual(namesIn('text'))
    expect(themeNames.font).toEqual(namesIn('font'))
    expect(themeNames.radius).toEqual(namesIn('radius'))
    expect(themeNames.shadow).toEqual(namesIn('shadow'))
    expect(themeNames.spacing).toEqual(namesIn('spacing'))
    expect(themeNames.container).toEqual(namesIn('container'))
    expect(themeNames.ease).toEqual(namesIn('ease'))
    expect(themeNames.animate).toEqual(namesIn('animate'))
    expect(themeNames.breakpoint).toEqual(namesIn('breakpoint'))
  })

  it('lets cn tell a size from a color', () => {
    expect(cn('text-muted text-ui', 'text-small')).toBe('text-muted text-small')
    expect(cn('rounded-card p-2', 'rounded-row p-card-pad')).toBe('rounded-row p-card-pad')
  })
})

describe('components', () => {
  it('take colors and lengths from the theme, not arbitrary values', () => {
    const found = sources.flatMap(({ path, text }) =>
      Array.from(text().matchAll(arbitrary), (match) => match[1] ?? '')
        .filter((value) => rawColor.test(value) || rawLength.test(value))
        .map((value) => `${path}: [${value}]`),
    )
    expect(found).toEqual([])
  })
})

describe('stylesheets', () => {
  it('take colors from the theme', () => {
    const found = sheets.flatMap(({ path, text }) =>
      text()
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((line) => rawColor.test(line))
        .map((line) => `${path}: ${line.trim()}`),
    )
    expect(found).toEqual([])
  })
})
