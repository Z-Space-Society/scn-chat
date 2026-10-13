import { useQuery } from '@tanstack/react-query'
import { type ReactNode, useContext, useState } from 'react'
import { Skeleton, SkeletonText } from '../../../shared/ui/Skeleton.tsx'
import { profileQuery } from '../queries.ts'
import { MeContext } from '../session.ts'

interface Props {
  /** A small mark on the avatar's corner, such as a status dot. */
  badge?: ReactNode
}

/**
 * Who is signed in: their avatar, display name, and handle, from their public profile. It shows
 * nothing outside a signed-in session, skeletons while the profile loads, and the handle alone if
 * it can't.
 * It is phrasing content, so it can sit inside a button.
 */
export function AccountCard(props: Props) {
  const me = useContext(MeContext)
  const { data: profile, isPending } = useQuery({ ...profileQuery, enabled: me !== null })
  if (!me) return null
  if (isPending)
    return (
      <span title={me.did} className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className="relative inline-flex flex-none">
          <Skeleton className="size-8" />
          {props.badge}
        </span>
        <span className="sr-only">{me.handle ?? me.did}</span>
        <SkeletonText className="w-24 text-small leading-[1.2]" />
      </span>
    )
  const handle = me.handle ? `@${me.handle}` : me.did
  const name = profile?.displayName ?? me.handle ?? me.did
  return (
    <span title={me.did} className="flex min-w-0 flex-1 items-center gap-2.5">
      {/* The avatar holds the badge on its corner. */}
      <span className="relative inline-flex flex-none">
        <Avatar key={profile?.avatar} src={profile?.avatar ?? null} name={name} />
        {props.badge}
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-[1.2]">
        <strong className="truncate font-semibold text-ink-strong text-small">{name}</strong>
        {profile?.displayName && (
          <small className="truncate text-caption text-muted">{handle}</small>
        )}
      </span>
    </span>
  )
}

interface AvatarProps {
  src: string | null
  name: string
}

const avatar = 'size-8 flex-none rounded-small'

/**
 * The avatar's thumbnail from Bluesky's CDN, or the name's first letter when there is none or it
 * fails to load, as it does for an account the CDN hasn't indexed. Bluesky isn't told which page
 * asked for it.
 */
function Avatar(props: AvatarProps) {
  const [failed, setFailed] = useState(false)
  if (props.src && !failed)
    return (
      <img
        src={props.src}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        // The picture keeps its size, with a hairline in a shade of its own colors drawn inside.
        className={`${avatar} object-cover outline-1 outline-image-edge -outline-offset-1`}
      />
    )
  return (
    <span
      aria-hidden="true"
      className={`${avatar} grid place-items-center border border-line bg-raised font-semibold text-muted text-small`}
    >
      {props.name.replace(/^@/, '').charAt(0).toUpperCase()}
    </span>
  )
}
