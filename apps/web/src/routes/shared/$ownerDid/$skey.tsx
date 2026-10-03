import { createFileRoute } from '@tanstack/react-router'
import { validateBranchSearch } from '../../../lib/search-params.ts'
import { SharedPage } from '../../../pages/SharedPage.tsx'

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
