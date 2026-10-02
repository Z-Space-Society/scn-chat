import { createFileRoute } from '@tanstack/react-router'
import { validateBranchSearch } from '../../../lib/search-params.ts'
import { SharedPage } from '../../../pages/SharedPage.tsx'
import { useSession } from '../../../session.tsx'

export const Route = createFileRoute('/shared/$ownerDid/$skey')({
  validateSearch: validateBranchSearch,
  component: Shared,
})

function Shared() {
  const { ownerDid, skey } = Route.useParams()
  const signedIn = useSession().state === 'signed-in'
  return <SharedPage ownerDid={ownerDid} skey={skey} signedIn={signedIn} />
}
