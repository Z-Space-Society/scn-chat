import { appName } from '../app-name.ts'
import { useStore, useStoreState } from '../store/react.tsx'

/** The fallback message when the current tab fails to take the local store from another tab in time. */
export function BusyBanner() {
  const store = useStore()
  const state = useStoreState()
  if (state !== 'busy') return null
  return (
    <div role="status" className="banner">
      {appName} is busy in another tab.{' '}
      <button type="button" onClick={() => void store.claim()}>
        Use here
      </button>
    </div>
  )
}
