export type DomainLists = { allow: string[]; deny: string[] }

const covers = (domain: string, host: string) => host === domain || host.endsWith(`.${domain}`)

/** Return true if this host can be fetched. */
export function isHostAllowed(host: string, lists: DomainLists): boolean {
  const name = host.toLowerCase().replace(/\.$/, '')
  if (lists.deny.some((domain) => covers(domain, name))) return false
  return lists.allow.length === 0 || lists.allow.some((domain) => covers(domain, name))
}
