import { api, read } from '../../shared/api.ts'
import type { StoreClient } from '../../store/client.ts'

/** Go to the login page with a full page load, so nothing from the ended session stays in memory. */
export const toLogin = () => location.assign('/login')

/**
 * Sign out on the server, then delete this device's copy of the chats, when it has one, and go to
 * the login page. A failure to delete stops short of leaving, so it can be shown.
 */
export async function signOut(localCopy?: StoreClient) {
  await read(api.auth.logout.$post())
  await localCopy?.deleteLocalCopy()
  toLogin()
}
