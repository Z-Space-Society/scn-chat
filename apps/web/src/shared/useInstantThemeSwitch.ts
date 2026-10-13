import { useEffect } from 'react'
import { showTheme, switchInstantly, themeKey, themeOf } from './theme.ts'

/**
 * Switches between light and dark at once when the system does, and when another tab on this
 * device changes the choice in Preferences, which this tab then shows too.
 */
export function useInstantThemeSwitch() {
  useEffect(() => {
    const scheme = window.matchMedia?.('(prefers-color-scheme: dark)')
    const onSchemeChange = () => switchInstantly(() => {})
    const onStorage = (event: StorageEvent) => {
      if (event.key === themeKey) showTheme(themeOf(event.newValue))
    }
    scheme?.addEventListener('change', onSchemeChange)
    window.addEventListener('storage', onStorage)
    return () => {
      scheme?.removeEventListener('change', onSchemeChange)
      window.removeEventListener('storage', onStorage)
    }
  }, [])
}
