import { Badge } from '../../../shared/ui/Badge.tsx'

const tones: Record<string, 'good' | 'danger'> = { loaded: 'good', failed: 'danger' }

interface Props {
  /** `loaded`, `disabled`, or `failed`. */
  status: string
}

/** A plugin's state as a badge: green once loaded, red when it failed, grey when disabled. */
export function PluginStatus(props: Props) {
  return (
    <Badge tone={tones[props.status]}>
      {props.status.charAt(0).toUpperCase() + props.status.slice(1)}
    </Badge>
  )
}
