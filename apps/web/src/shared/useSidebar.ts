import { useSyncExternalStore } from 'react'

/** Below the theme's wide breakpoint the sidebar is a drawer over the page, not a column beside it. */
export const NARROW = '(width < 45rem)'

const KEY = 'scn-chat:sidebar-collapsed'
const listeners = new Set<() => void>()

/**
 * Whether the sidebar is collapsed on a wide screen, a preference kept in this browser, and
 * whether the drawer is open on a narrow one, which starts closed on each page load.
 */
type SidebarState = { collapsed: boolean; drawerOpen: boolean }

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

let state: SidebarState = { collapsed: false, drawerOpen: false }
let loaded = false

function current(): SidebarState {
  if (!loaded && typeof window !== 'undefined') {
    loaded = true
    state = { ...state, collapsed: readCollapsed() }
  }
  return state
}

function set(next: Partial<SidebarState>) {
  state = { ...current(), ...next }
  if (next.collapsed !== undefined)
    try {
      localStorage.setItem(KEY, next.collapsed ? '1' : '0')
    } catch {
      // Without storage the choice lasts until the page reloads.
    }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const isNarrow = () => typeof window !== 'undefined' && window.matchMedia(NARROW).matches

const SERVER_STATE: SidebarState = { collapsed: false, drawerOpen: false }

/** The sidebar's state, and actions that act on the drawer or the column depending on width. */
export function useSidebar() {
  const sidebar = useSyncExternalStore(subscribe, current, () => SERVER_STATE)
  return {
    ...sidebar,
    /** Show or hide the sidebar: the drawer on a narrow screen, the column on a wide one. */
    toggle: () => {
      if (isNarrow()) set({ drawerOpen: !current().drawerOpen })
      else set({ collapsed: !current().collapsed })
    },
    /** Close the drawer, as after picking a chat. The column on a wide screen stays as it is. */
    closeDrawer: () => {
      if (current().drawerOpen) set({ drawerOpen: false })
    },
  }
}
