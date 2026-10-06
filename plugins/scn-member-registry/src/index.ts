import { definePlugin } from '@scn-chat/plugin-api'
import { z } from 'zod'

export const optionsSchema = z
  .object({
    url: z
      .url({ protocol: /^https$/ })
      .default('https://view.sharedcomputer.network')
      .meta({ title: 'Registry URL' }),
    token: z.string().min(32).meta({
      title: 'Members token',
      description: 'The value of a MEMBERS_TOKEN_* script variable on the registry.',
      secret: true,
    }),
    role: z.string().min(1).default('scn-member').meta({ title: 'Role for members' }),
  })
  .strict()

export type ScnMemberRegistryOptions = z.input<typeof optionsSchema>

const LIST_MEMBERS = 'network.sharedcomputer.membership.listMembers'
// Inside core's 10 second wait for sign-in hooks.
const FETCH_TIMEOUT_MS = 8_000

const memberList = z.object({ members: z.array(z.object({ did: z.string() })) })

/** An error and its cause, for the log. Never log the request URL, since it carries the token. */
function describe(err: unknown): string {
  if (!(err instanceof Error)) return String(err)
  const message = err.message.split('\n')[0] as string
  return err.cause instanceof Error ? `${message}: ${err.cause.message}` : message
}

/** Grant a role to every active member of the SCN member registry. */
export default function scnMemberRegistry(config: ScnMemberRegistryOptions) {
  const options = optionsSchema.parse(config)
  return definePlugin({
    id: 'scn-member-registry',
    name: 'SCN member registry',
    apiVersion: 1,
    setup(ctx) {
      const closed = new AbortController()
      let inFlight: Promise<Set<string> | undefined> | undefined

      async function fetchMembers(): Promise<string[]> {
        const url = new URL(`/xrpc/${LIST_MEMBERS}`, options.url)
        url.searchParams.set('activeOnly', 'true')
        url.searchParams.set('token', options.token)
        const res = await fetch(url, {
          signal: AbortSignal.any([closed.signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]),
        })
        const body: unknown = await res.json().catch(() => undefined)
        if (!res.ok) {
          const message = (body as { message?: unknown } | undefined)?.message
          throw new Error(`HTTP ${res.status}: ${typeof message === 'string' ? message : ''}`)
        }
        const parsed = memberList.safeParse(body)
        if (!parsed.success) throw new Error('The response is not a member list')
        return parsed.data.members.map((member) => member.did)
      }

      /** Bring the role in line with the registry, joining a sync already running. */
      function sync(): Promise<Set<string> | undefined> {
        inFlight ??= (async () => {
          try {
            const dids = await fetchMembers()
            const { removed } = await ctx.roles.syncMembers(options.role, dids)
            if (dids.length === 0 && removed > 0)
              ctx.logger.error(
                { removed },
                'The SCN member registry returned no members, so every member lost the role',
              )
            return new Set(dids)
          } catch (err) {
            if (!closed.signal.aborted)
              ctx.logger.warn(
                { error: describe(err) },
                'Could not sync the SCN member list, keeping the stored members',
              )
            return undefined
          } finally {
            inFlight = undefined
          }
        })()
        return inFlight
      }

      ctx.hooks.on('cron', async () => void (await sync()))
      ctx.hooks.on('signIn:before', async ({ did }) => {
        if ((await sync())?.has(did)) await ctx.roles.addMember(options.role, did)
      })
      ctx.onClose(() => closed.abort())
    },
  })
}
