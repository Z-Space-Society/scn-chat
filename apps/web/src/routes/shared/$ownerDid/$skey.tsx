import { createFileRoute } from '@tanstack/react-router'
import {
  SharedError,
  SharedPage,
  SharedPageSkeleton,
} from '../../../features/sharing/pages/SharedPage.tsx'
import { sharedQuery } from '../../../features/sharing/queries.ts'
import { validateBranchSearch } from '../../../shared/search-params.ts'

export const Route = createFileRoute('/shared/$ownerDid/$skey')({
  validateSearch: validateBranchSearch,
  // It reads the viewer's link from the browser, and shows only after the viewer signs in.
  ssr: false,
  // Only a signed-in viewer may read the chat, so a signed-out one is asked to sign in instead.
  loader: ({ context, params }) =>
    context.session.state === 'signed-in'
      ? context.queryClient.query(sharedQuery(params.ownerDid, params.skey))
      : undefined,
  // The server sends the page's skeleton, so a reload never starts on a blank window.
  pendingComponent: SharedPageSkeleton,
  errorComponent: SharedError,
  component: Shared,
})

function Shared() {
  const { ownerDid, skey } = Route.useParams()
  const signedIn = Route.useRouteContext().session.state === 'signed-in'
  return <SharedPage ownerDid={ownerDid} skey={skey} signedIn={signedIn} />
}
