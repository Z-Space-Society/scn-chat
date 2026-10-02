import { appName } from '../app-name.ts'
import { useStore, useStoreState } from '../store/react.tsx'

/** The fallback message when the current tab can't open the local store. */
export function BusyBanner() {
  const store = useStore()
  const state = useStoreState()
  if (state !== 'busy' && state !== 'failed') return null
  return (
    <div role="status" className="banner">
      {state === 'busy'
        ? `${appName()} is busy in another tab.`
        : `${appName()} couldn't open this device's copy of your chats.`}{' '}
      <button type="button" onClick={() => void store.claim()}>
        {state === 'busy' ? 'Use here' : 'Try again'}
      </button>
    </div>
  )
}
