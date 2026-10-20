import { useQuery } from '@tanstack/react-query'
import { type ReactNode, use } from 'react'
import { Skeleton, SkeletonText } from '../../../shared/ui/Skeleton.tsx'
import { profileQuery } from '../queries.ts'
import { MeContext } from '../session.ts'
import { Avatar } from './Avatar.tsx'

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
  const me = use(MeContext)
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
