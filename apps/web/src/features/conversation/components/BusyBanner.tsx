import { appName } from '../../../shared/app-name.ts'
import { useStore, useStoreState } from '../../../store/react.tsx'

/** The fallback message when the current tab can't open the local store. */
export function BusyBanner() {
  const store = useStore()
  const state = useStoreState()
  const claim = () => void store.claim()
  if (state === 'busy')
    return (
      <Banner message={`${appName()} is busy in another tab.`} action="Use here" onAction={claim} />
    )
  if (state === 'failed')
    return (
      <Banner
        message={`${appName()} couldn't open this device's copy of your chats.`}
        action="Try again"
        onAction={claim}
      />
    )
  return null
}

interface BannerProps {
  message: string
  action: string
  onAction: () => void
}

function Banner(props: BannerProps) {
  return (
    <div role="status" className="banner">
      {props.message}{' '}
      <button type="button" onClick={props.onAction}>
        {props.action}
      </button>
    </div>
  )
}
