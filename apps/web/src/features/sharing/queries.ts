import { queryOptions } from '@tanstack/react-query'
import { api, read } from '../../shared/api.ts'

export const sharingQuery = (skey: string) =>
  queryOptions({
    queryKey: ['sharing', skey],
    queryFn: () => read(api.sharing.conversations[':skey'].sharing.$get({ param: { skey } })),
  })

export const sharedQuery = (ownerDid: string, skey: string) =>
  queryOptions({
    queryKey: ['shared', ownerDid, skey],
    queryFn: () =>
      read(api.sharing.shared[':ownerDid'][':skey'].$get({ param: { ownerDid, skey } })),
  })
