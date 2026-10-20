import { isEffort } from './effort.ts'

const KEY = 'scn-chat:effort'
// The effort when storage is blocked, which then lasts until the page reloads.
let memory = ''

/** The effort last chosen in the composer on this device, or "" for Auto. */
export function lastEffort(): string {
  try {
    const value = localStorage.getItem(KEY) ?? ''
    return isEffort(value) ? value : ''
  } catch {
    return memory
  }
}

/** Keep the composer's effort for the next message. It is a convenience for this device. */
export function rememberEffort(value: string) {
  memory = value
  try {
    if (value) localStorage.setItem(KEY, value)
    else localStorage.removeItem(KEY)
  } catch {
    // Storage can be blocked, and `memory` holds the choice instead.
  }
}
