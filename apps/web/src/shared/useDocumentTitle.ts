import { useEffect } from 'react'
import { appName } from './site.ts'

/**
 * Show a page's own title, such as a chat's, in the browser tab before the app's name while the
 * page is open. The router's head sets the tab's title from each route's static data, and knows
 * nothing of titles that live in the browser store, so this sets `document.title` itself. Leaving
 * the page puts back the title it replaced, unless the router has set another since. Nothing
 * changes while the title is on its way.
 */
export function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    if (title === undefined) return
    const before = document.title
    const ours = `${title} · ${appName()}`
    document.title = ours
    return () => {
      if (document.title === ours) document.title = before
    }
  }, [title])
}
