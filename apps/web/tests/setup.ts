import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(cleanup)

// index.html carries the app name, filled in by the server.
const appName = document.createElement('meta')
appName.name = 'application-name'
appName.content = 'SCN Chat'
document.head.append(appName)

// jsdom has no ResizeObserver. Tests that need resize callbacks stub their own.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

// jsdom has no scrolling. The router restores scroll positions on navigation.
window.scrollTo = () => {}
