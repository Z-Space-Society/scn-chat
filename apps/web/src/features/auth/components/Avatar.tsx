import { useState } from 'react'
import { cn } from '../../../shared/cn.ts'

interface Props {
  src: string | null
  name: string
  /** Classes for its size and its letter's, which default to the sidebar's. */
  className?: string
}

/**
 * An avatar's thumbnail from Bluesky's CDN, or the name's first letter when there is none or it
 * fails to load, as it does for an account the CDN hasn't indexed. Bluesky isn't told which page
 * asked for it.
 */
export function Avatar(props: Props) {
  const [failed, setFailed] = useState(false)
  const avatar = cn('size-8 flex-none rounded-small text-small', props.className)
  if (props.src && !failed)
    return (
      <img
        src={props.src}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        // The picture keeps its size, with a hairline in a shade of its own colors drawn inside.
        className={cn(avatar, 'object-cover outline-1 outline-image-edge -outline-offset-1')}
      />
    )
  return (
    <span
      aria-hidden="true"
      className={cn(
        avatar,
        'grid place-items-center border border-line bg-raised font-semibold text-muted',
      )}
    >
      {props.name.replace(/^@/, '').charAt(0).toUpperCase()}
    </span>
  )
}
