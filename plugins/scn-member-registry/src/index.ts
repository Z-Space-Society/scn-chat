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
    // setTimeout can't wait longer than about 24.8 days, and fires at once past that.
    pollMinutes: z
      .number()
      .int()
      .min(1)
      .max(35_000)
      .default(5)
      .meta({ title: 'Minutes between checks' }),
  })
  .strict()

export type ScnMemberRegistryOptions = z.input<typeof optionsSchema>

const LIST_MEMBERS = 'network.sharedcomputer.membership.listMembers'
// Inside core's 10 second limit on a role source, so a sign-in can fall back to the last list.
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
      let members: Set<string> | undefined
      let inFlight: Promise<void> | undefined
      let timer: NodeJS.Timeout | undefined

      async function fetchMembers(): Promise<Set<string>> {
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
        return new Set(parsed.data.members.map((member) => member.did))
      }

      /** Fetch the member list, joining a fetch already running, then schedule the next one. */
      function refresh(): Promise<void> {
        inFlight ??= (async () => {
          try {
            const next = await fetchMembers()
            if (next.size === 0 && members?.size)
              ctx.logger.error(
                { previous: members.size },
                'The SCN member registry returned no members, so every member lost the role',
              )
            members = next
          } catch (err) {
            if (!closed.signal.aborted)
              ctx.logger.warn(
                { error: describe(err) },
                'Could not fetch the SCN member list, keeping the previous one',
              )
          } finally {
            inFlight = undefined
            clearTimeout(timer)
            if (!closed.signal.aborted)
              timer = setTimeout(refresh, options.pollMinutes * 60_000).unref()
          }
        })()
        return inFlight
      }

      const first = refresh()

      ctx.roleSources.register({
        id: 'scn-member-registry',
        async rolesFor({ did }, { signIn }) {
          await (signIn ? refresh() : members ? undefined : first)
          return members?.has(did) ? [options.role] : []
        },
      })

      ctx.onClose(() => {
        closed.abort()
        clearTimeout(timer)
      })
    },
  })
}
