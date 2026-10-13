/** The scheme a device shows: the system's light or dark, or one fixed in Preferences. */
export type ThemeChoice = 'system' | 'light' | 'dark'

export const themeKey = 'scn-chat:theme'

/**
 * Runs in the page's head before the first paint, so a fixed choice never flashes the other
 * scheme. It reads the store the same way storedTheme does.
 */
export const themeScript = `try{var t=localStorage.getItem('${themeKey}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`

export function themeOf(value: string | null): ThemeChoice {
  return value === 'light' || value === 'dark' ? value : 'system'
}

/** The choice stored on this device, or system when there is none or the store can't be read. */
export function storedTheme(): ThemeChoice {
  try {
    return themeOf(localStorage.getItem(themeKey))
  } catch {
    return 'system'
  }
}

/** Stores the choice on this device and shows it at once. */
export function chooseTheme(choice: ThemeChoice) {
  try {
    if (choice === 'system') localStorage.removeItem(themeKey)
    else localStorage.setItem(themeKey, choice)
  } catch {
    // The choice still applies to this page when it can't be kept.
  }
  showTheme(choice)
}

/** Sets the scheme the page's colors follow, through the data-theme attribute on the root. */
export function showTheme(choice: ThemeChoice) {
  switchInstantly(() => {
    const root = document.documentElement
    if (choice === 'system') delete root.dataset.theme
    else root.dataset.theme = choice
  })
}

/**
 * Changes the scheme with transitions held off until the new colors have painted. The colors follow
 * the scheme through light-dark(), so otherwise every color transition on the page would run
 * together and the switch would smear.
 */
export function switchInstantly(change: () => void) {
  const style = document.createElement('style')
  style.textContent = '*,*::before,*::after{transition:none !important}'
  document.head.append(style)
  change()
  // Reading layout makes the browser apply the new colors while transitions are off.
  void document.body.offsetHeight
  requestAnimationFrame(() => requestAnimationFrame(() => style.remove()))
}
