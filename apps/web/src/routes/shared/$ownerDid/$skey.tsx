import { createFileRoute } from '@tanstack/react-router'
import { SharedPage } from '../../../features/sharing/pages/SharedPage.tsx'
import { validateBranchSearch } from '../../../shared/search-params.ts'

export const Route = createFileRoute('/shared/$ownerDid/$skey')({
  validateSearch: validateBranchSearch,
  // It reads the viewer's link from the browser, and shows only after the viewer signs in.
  ssr: false,
  component: Shared,
})

function Shared() {
  const { ownerDid, skey } = Route.useParams()
  const signedIn = Route.useRouteContext().session.state === 'signed-in'
  return <SharedPage ownerDid={ownerDid} skey={skey} signedIn={signedIn} />
}
