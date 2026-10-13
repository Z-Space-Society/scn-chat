import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { chooseTheme, storedTheme, themeKey, themeScript } from '../../src/shared/theme.ts'
import { Logo } from '../../src/shared/ui/Logo.tsx'

afterEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
})

describe('the theme choice', () => {
  it('is the system with nothing stored, or anything but light or dark', () => {
    expect(storedTheme()).toBe('system')
    localStorage.setItem(themeKey, 'sepia')
    expect(storedTheme()).toBe('system')
  })

  it('fixes light or dark on the page and keeps it on the device', () => {
    chooseTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(storedTheme()).toBe('dark')

    chooseTheme('system')
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(localStorage.getItem(themeKey)).toBeNull()
  })

  it('is applied by the head script before the app loads', () => {
    localStorage.setItem(themeKey, 'light')
    new Function(themeScript)()
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})

describe('Logo', () => {
  it('draws the bubble letters under the app name', () => {
    render(<Logo label="SCN Chat" />)
    const logo = screen.getByRole('img', { name: 'SCN Chat' })
    const paths = logo.querySelectorAll('path')
    expect(paths).toHaveLength(3)
    for (const path of paths) expect(path.getAttribute('d')).toMatch(/^M/)
  })
})
