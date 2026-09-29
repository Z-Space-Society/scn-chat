import { nsid } from '@scn-chat/lexicons'
import type {
  BranchMessage,
  InfoRecord,
  ModelRef,
  ToolContext,
  TurnContext,
} from '@scn-chat/plugin-api'
import { isStepCount, jsonSchema, streamText, type ToolSet, tool } from 'ai'
import { type Account, getAccount } from '../auth/accounts.ts'
import type { Db } from '../db/index.ts'
import type { Logger } from '../logger.ts'
import type { PluginHost } from '../plugins/host.ts'
import { isToolEnabled, readToolChoices } from '../plugins/user-tools.ts'
import type { ModelCatalog } from '../providers/catalog.ts'
import { mapEffort } from '../providers/effort.ts'
import { safeErrorMessage } from '../safe-error.ts'
import type { ChatService } from '../storage/chat-service.ts'
import { RecordExists } from '../storage/record-store.ts'
import { type JsonRecord, parseSpaceUri } from '../storage/records.ts'
import type { ChatServices } from '../storage/services.ts'
import type { SyncEventBus, SyncEvents } from '../sync/events.ts'
import { encode, PartAccumulator } from './accumulator.ts'
import {
  type BlobReader,
  branchTo,
  buildInstructions,
  fillBasePrompt,
  lastReplyModel,
  TurnInputError,
  timeZoneOf,
  toModelMessages,
} from './prompt.ts'
import type { StreamHub } from './stream-hub.ts'
import { wrapUntrusted } from './untrusted.ts'

export type TurnBlobs = {
  reader(account: Account, skey: string): BlobReader
  put(account: Account, bytes: Uint8Array, mimeType: string): Promise<JsonRecord>
}

export type TurnRunnerDeps = {
  db: Db
  services: ChatServices
  catalog: ModelCatalog
  host?: PluginHost
  hub: StreamHub
  blobs: TurnBlobs
  config: {
    ratePerMinute: number
    maxSteps: number
    timeoutMs: number
    backfillWindowMs: number
    systemPrompt: string
  }
  appName: string
  /** Fetch function passed to tools for retrieving URLs. */
  toolFetch: typeof fetch
  logger: Logger
  now?: () => number
}

export type StartResult = {
  status: 'claimed' | 'queued' | 'exists' | 'skipped'
  replyRkey?: string
}

const MAX_RECORD_BYTES = 900_000
const defs = (name: string) => `${nsid.defs}#${name}`
const replyKey = (userRkey: string, attempt: number) => `${userRkey}.r${attempt}`

type QueuedTurn = { skey: string; userRkey: string; replyRkey: string; attempt: number }

type Loaded = {
  account: Account
  chats: ChatService
  info: JsonRecord | null
  preferences: JsonRecord | null
  messages: Map<string, BranchMessage>
}

/** Runs every turn, whether the web UI or a direct write asked for it. */
export class TurnRunner {
  private readonly deps: TurnRunnerDeps
  private readonly running = new Map<string, AbortController>()
  private readonly startTimes = new Map<string, number[]>()
  private readonly queued = new Map<string, QueuedTurn[]>()
  private readonly drainTimers = new Map<string, NodeJS.Timeout>()
  private readonly background = new Set<Promise<void>>()

  constructor(deps: TurnRunnerDeps) {
    this.deps = deps
  }

  private now(): number {
    return (this.deps.now ?? Date.now)()
  }

  /** Resolves once every turn started so far has finished, for tests and shutdown. */
  async idle(): Promise<void> {
    while (this.background.size) await Promise.allSettled([...this.background])
  }

  streamKey(did: string, skey: string, replyRkey: string): string {
    return `${did}/${skey}/${replyRkey}`
  }

  private async account(did: string): Promise<Account> {
    const account = await getAccount(this.deps.db, did)
    if (!account) throw new Error(`No account for ${did}`)
    return account
  }

  private async load(did: string, skey: string): Promise<Loaded> {
    const account = await this.account(did)
    const chats = this.deps.services.forAccount(account)
    const [conversation, preferences] = await Promise.all([
      chats.getConversation(skey),
      chats.getPreferences(),
    ])
    const messages = new Map<string, BranchMessage>()
    for (const message of conversation.messages) {
      messages.set(message.rkey, {
        rkey: message.rkey,
        author: did,
        record: message.value as never,
      })
    }
    return { account, chats, info: conversation.info?.value ?? null, preferences, messages }
  }

  /** Get the user's turn start times from the last minute, oldest first. */
  private recentStarts(did: string): number[] {
    let times = this.startTimes.get(did)
    if (!times) {
      times = []
      this.startTimes.set(did, times)
    }
    const cutoff = this.now() - 60_000
    while (times.length && (times[0] as number) <= cutoff) times.shift()
    return times
  }

  private scheduleDrain(did: string): void {
    if (this.drainTimers.has(did)) return
    const [oldest] = this.recentStarts(did)
    if (oldest === undefined) throw new Error(`Queued a turn for ${did} with no recent starts`)
    const wait = Math.max(50, oldest + 60_000 - this.now())
    const timer = setTimeout(() => {
      this.drainTimers.delete(did)
      const pending = this.queued.get(did) ?? []
      this.queued.set(did, [])
      for (const turn of pending) {
        const key = this.streamKey(did, turn.skey, turn.replyRkey)
        this.start(did, turn.skey, turn.userRkey).then(
          // A turn that no longer runs ends its queued stream.
          (result) => result.status === 'claimed' || this.deps.hub.end(key, result.status),
          (err: unknown) => {
            this.deps.logger.error({ err, did, skey: turn.skey }, 'could not start a queued turn')
            this.deps.hub.end(key, 'error')
          },
        )
      }
    }, wait)
    timer.unref()
    this.drainTimers.set(did, timer)
  }

  /** Start the turn a user message asks for, if it still needs one. */
  async start(did: string, skey: string, userRkey: string): Promise<StartResult> {
    const loaded = await this.load(did, skey)
    const userMessage = loaded.messages.get(userRkey)
    const record = userMessage?.record as unknown as JsonRecord | undefined
    const generation = record?.generation as
      | { model?: ModelRef; effort?: string; attempt?: number; tools?: string[] }
      | undefined
    if (record?.role !== 'user' || !generation) return { status: 'skipped' }
    const attempt = generation.attempt ?? 0
    const replyRkey = replyKey(userRkey, attempt)
    if (loaded.messages.has(replyRkey)) return { status: 'exists', replyRkey }
    const conversationUri = loaded.chats.conversationUri(skey)

    await this.deps.db
      .insertInto('turn_request')
      .values({
        conversation_uri: conversationUri,
        message_rkey: userRkey,
        attempt,
        owner_did: did,
        requested_at: new Date(this.now()).toISOString(),
      })
      .onConflict((oc) => oc.columns(['conversation_uri', 'message_rkey', 'attempt']).doNothing())
      .execute()

    const starts = this.recentStarts(did)
    if (starts.length >= this.deps.config.ratePerMinute) {
      const queue = this.queued.get(did) ?? []
      if (!queue.some((turn) => turn.skey === skey && turn.userRkey === userRkey))
        queue.push({ skey, userRkey, replyRkey, attempt })
      this.queued.set(did, queue)
      this.deps.hub.publish(this.streamKey(did, skey, replyRkey), { type: 'queued' })
      this.scheduleDrain(did)
      return { status: 'queued', replyRkey }
    }

    const branch = branchTo(loaded.messages, userRkey)
    const model =
      generation.model ??
      lastReplyModel(branch) ??
      (loaded.preferences?.defaultModel as ModelRef | undefined) ??
      this.deps.catalog.defaultModel()
    const effort = generation.effort ?? (loaded.preferences?.defaultEffort as string | undefined)
    const placeholder: JsonRecord = {
      $type: nsid.message,
      role: 'assistant',
      parent: userRkey,
      content: { $type: defs('plainContent'), parts: [] },
      status: 'pending',
      createdAt: new Date(this.now()).toISOString(),
      ...(model ? { model } : {}),
      ...(effort ? { effort } : {}),
    }
    try {
      await loaded.chats.createMessage(skey, replyRkey, placeholder)
    } catch (err) {
      if (err instanceof RecordExists) {
        await this.clearRequest(conversationUri, userRkey, attempt)
        return { status: 'exists', replyRkey }
      }
      throw err
    }
    starts.push(this.now())
    this.deps.hub.open(this.streamKey(did, skey, replyRkey))
    await this.deps.db
      .insertInto('turn_claim')
      .values({
        conversation_uri: conversationUri,
        reply_rkey: replyRkey,
        owner_did: did,
        claimed_at: new Date(this.now()).toISOString(),
      })
      .onConflict((oc) => oc.columns(['conversation_uri', 'reply_rkey']).doNothing())
      .execute()
    await this.clearRequest(conversationUri, userRkey, attempt)

    const work = this.generate(
      loaded,
      skey,
      userMessage as BranchMessage,
      replyRkey,
      placeholder,
      model,
      effort,
      generation,
    )
      .catch((err) =>
        this.deps.logger.error({ err, did, skey, replyRkey }, 'turn failed outside generation'),
      )
      .finally(() => this.background.delete(work))
    this.background.add(work)
    return { status: 'claimed', replyRkey }
  }

  private async clearRequest(conversationUri: string, userRkey: string, attempt: number) {
    await this.deps.db
      .deleteFrom('turn_request')
      .where('conversation_uri', '=', conversationUri)
      .where('message_rkey', '=', userRkey)
      .where('attempt', '=', attempt)
      .execute()
  }

  /** Stop a running turn, or drop a queued one. */
  async cancel(did: string, skey: string, replyRkey: string): Promise<boolean> {
    const key = this.streamKey(did, skey, replyRkey)
    const controller = this.running.get(key)
    if (controller) {
      controller.abort(new Error('cancelled'))
      return true
    }
    const queue = this.queued.get(did) ?? []
    const index = queue.findIndex((turn) => turn.skey === skey && turn.replyRkey === replyRkey)
    const [turn] = index >= 0 ? queue.splice(index, 1) : []
    if (!turn) return false
    const chats = this.deps.services.forAccount(await this.account(did))
    await this.clearRequest(chats.conversationUri(skey), turn.userRkey, turn.attempt)
    this.deps.hub.end(key, 'cancelled')
    return true
  }

  /** The tools switched on for the user, for messages that name none. */
  private async enabledTools(did: string): Promise<string[]> {
    const registered = this.deps.host?.tools.list() ?? []
    if (!registered.length) return []
    const choices = await readToolChoices(this.deps.db, did)
    return registered.filter((item) => isToolEnabled(item, choices)).map((item) => item.name)
  }

  /** Whether a tool's output is wrapped before the model sees it. Unknown tools count as untrusted. */
  private isUntrusted(name: string): boolean {
    const registered = this.deps.host?.tools.get(name)
    return !registered || registered.untrusted === true
  }

  private async tools(
    requested: string[],
    base: { user: string; conversation: string; signal: AbortSignal },
    accumulator: PartAccumulator,
  ) {
    if (!requested.length) return undefined
    const host = this.deps.host
    const set: ToolSet = {}
    // Each tool gets its own context, so its turn cache is private and lasts only this turn.
    const contextFor = (): ToolContext => ({
      ...base,
      fetch: this.deps.toolFetch,
      cite: (source) => accumulator.cite(source),
      turnCache: new Map(),
    })
    const wrapped = {
      toModelOutput: ({ output }: { output: unknown }) => ({
        type: 'text',
        value: wrapUntrusted(encode(output)),
      }),
    }
    for (const registered of host?.tools.list() ?? []) {
      if (!requested.includes(registered.name)) continue
      const context = contextFor()
      set[registered.name] = tool({
        description: registered.description,
        inputSchema: registered.inputSchema as never,
        execute: async (input: never) => registered.run(input, context),
        ...(registered.untrusted ? wrapped : {}),
      } as never)
    }
    for (const source of host?.toolSources.list() ?? []) {
      for (const definition of await source.list(base.user)) {
        const name = `${source.id}_${definition.name}`
        if (!requested.includes(name)) continue
        const context = contextFor()
        set[name] = tool({
          description: definition.description,
          inputSchema: jsonSchema(definition.inputSchema as never),
          execute: async (input: unknown) =>
            source.call(base.user, definition.name, input, context),
          ...wrapped,
        } as never)
      }
    }
    const missing = requested.filter((name) => !(name in set))
    if (missing.length)
      throw new TurnInputError(`These tools are not available: ${missing.join(', ')}`)
    return set
  }

  /** Move the largest tool outputs into blobs until the record fits a PDS write. */
  private async fitRecord(account: Account, record: JsonRecord): Promise<JsonRecord> {
    const content = record.content as { parts: Record<string, unknown>[] }
    const size = () => new TextEncoder().encode(JSON.stringify(record)).length
    const results = content.parts
      .filter(
        (part) =>
          part.$type === defs('toolResultPart') &&
          typeof part.output === 'string' &&
          !part.outputBlob,
      )
      .sort((a, b) => String(b.output).length - String(a.output).length)
    for (const part of results) {
      if (size() <= MAX_RECORD_BYTES) break
      const bytes = new TextEncoder().encode(String(part.output))
      part.outputBlob = await this.deps.blobs.put(account, bytes, 'text/plain')
      part.output = `Output stored as a blob (${bytes.length} bytes).`
    }
    if (size() > MAX_RECORD_BYTES) throw new Error('The reply is too large to store')
    return record
  }

  private async generate(
    loaded: Loaded,
    skey: string,
    userMessage: BranchMessage,
    replyRkey: string,
    placeholder: JsonRecord,
    model: ModelRef | undefined,
    effort: string | undefined,
    generation: { tools?: string[] },
  ): Promise<void> {
    const { account, chats } = loaded
    const did = account.did
    const conversationUri = chats.conversationUri(skey)
    const key = this.streamKey(did, skey, replyRkey)
    const controller = new AbortController()
    this.running.set(key, controller)
    const timeout = setTimeout(
      () => controller.abort(new Error('timeout')),
      this.deps.config.timeoutMs,
    )
    const accumulator = new PartAccumulator((event) => this.deps.hub.publish(key, event))
    const context: TurnContext = {
      user: did,
      conversation: {
        uri: conversationUri,
        ...(loaded.info ? { info: loaded.info as unknown as InfoRecord } : {}),
      },
      preferences: (loaded.preferences ?? undefined) as never,
      userMessage: { rkey: userMessage.rkey, record: userMessage.record },
      reply: { rkey: replyRkey, record: placeholder as never },
      ...(model ? { model } : {}),
      effort: effort as never,
      tools: [],
    }
    let status: 'complete' | 'error' | 'cancelled' = 'complete'
    let error: string | undefined
    try {
      if (!model)
        throw new Error('No model selected. Choose a model or set a default in your preferences.')
      const resolved = await this.deps.catalog.resolve(did, model)
      const hooks = this.deps.host?.hooks
      const branch = branchTo(loaded.messages, userMessage.rkey)
      const requested = generation.tools
      if (requested?.length && !resolved.capabilities.tools)
        throw new TurnInputError('This model cannot use tools. Choose a model that can.')
      const names = requested ?? (resolved.capabilities.tools ? await this.enabledTools(did) : [])
      const tools = await this.tools(
        names,
        { user: did, conversation: conversationUri, signal: controller.signal },
        accumulator,
      )
      context.tools = Object.keys(tools ?? {})
      const base = fillBasePrompt(this.deps.config.systemPrompt, {
        appName: this.deps.appName,
        timeZone: timeZoneOf(loaded.preferences, this.deps.logger),
        now: new Date(this.now()),
      })
      const initial = {
        instructions: buildInstructions(base, loaded.preferences, loaded.info),
        messages: branch,
      }
      const prompt = hooks ? await hooks.filter('messages:beforeModel', initial, context) : initial
      const messages = await toModelMessages(prompt.messages, {
        provider: resolved.provider,
        capabilities: resolved.capabilities,
        readBlob: this.deps.blobs.reader(account, skey),
        isUntrusted: (name) => this.isUntrusted(name),
      })
      const result = streamText({
        model: resolved.model,
        instructions: prompt.instructions || undefined,
        messages,
        tools,
        stopWhen: isStepCount(this.deps.config.maxSteps),
        reasoning: resolved.capabilities.reasoning
          ? mapEffort(effort, this.deps.logger)
          : undefined,
        abortSignal: controller.signal,
        providerOptions: resolved.provider.providerOptions as never,
      })
      for await (const chunk of result.stream) {
        if (chunk.type === 'abort') status = 'cancelled'
        const failure = accumulator.push(chunk)
        if (failure && status !== 'cancelled') {
          status = 'error'
          error = safeErrorMessage(failure)
        }
      }
      if (controller.signal.aborted && status === 'complete') status = 'cancelled'
    } catch (err) {
      if (controller.signal.aborted) status = 'cancelled'
      else {
        status = 'error'
        error = safeErrorMessage(err)
        this.deps.logger.warn({ err, did, skey, replyRkey }, 'turn ended with an error')
      }
    } finally {
      clearTimeout(timeout)
      this.running.delete(key)
    }

    let content: JsonRecord = { $type: defs('plainContent'), parts: accumulator.parts }
    if ((status === 'complete' || status === 'cancelled') && this.deps.host) {
      try {
        content = (await this.deps.host.hooks.filter(
          'message:afterModel',
          content as never,
          context,
        )) as never
      } catch (err) {
        this.deps.logger.warn({ err, did, skey, replyRkey }, 'message:afterModel filter failed')
        content = { $type: defs('plainContent'), parts: [] }
        status = 'error'
        error = safeErrorMessage(err)
      }
    }
    const usage = accumulator.lexiconUsage()
    let final: JsonRecord = {
      ...placeholder,
      content,
      status,
      ...(usage ? { usage } : {}),
      ...(error ? { error } : {}),
    }
    try {
      final = await this.fitRecord(account, final)
      await chats.putMessage(skey, replyRkey, final)
    } catch (err) {
      this.deps.logger.error({ err, did, skey, replyRkey }, 'could not write the finished reply')
      status = 'error'
      error = safeErrorMessage(err)
      final = { ...placeholder, status, error }
      try {
        await chats.putMessage(skey, replyRkey, final)
      } catch (fallbackErr) {
        // Leave the claim for recovery to mark the reply interrupted after a restart.
        this.deps.logger.error(
          { err: fallbackErr, did, skey, replyRkey },
          'could not write the error reply either',
        )
        this.deps.hub.publish(key, { type: 'status', status, error })
        return
      }
    }
    this.deps.hub.publish(key, { type: 'status', status, ...(error ? { error } : {}) })
    await this.deps.db
      .deleteFrom('turn_claim')
      .where('conversation_uri', '=', conversationUri)
      .where('reply_rkey', '=', replyRkey)
      .execute()
    if (this.deps.host) {
      await this.deps.host.hooks.action(
        'turn:after',
        { ...context, reply: { rkey: replyRkey, record: final as never } },
        this.deps.logger,
      )
    }
  }

  /** Reply with an error to a user message that failed validation. */
  async answerInvalid(event: SyncEvents['message:invalid'][0]): Promise<void> {
    const raw = event.raw
    if (raw.role !== 'user' || !raw.generation || typeof raw.generation !== 'object') return
    const attempt = Number((raw.generation as { attempt?: unknown }).attempt ?? 0)
    if (!Number.isInteger(attempt)) return
    const chats = this.deps.services.forAccount(await this.account(event.did))
    try {
      await chats.createMessage(event.skey, replyKey(event.rkey, attempt), {
        $type: nsid.message,
        role: 'assistant',
        parent: event.rkey,
        content: { $type: defs('plainContent'), parts: [] },
        status: 'error',
        error: `Your message is not a valid ${nsid.message} record: ${event.error}`.slice(0, 3000),
        createdAt: new Date(this.now()).toISOString(),
      })
    } catch (err) {
      if (!(err instanceof RecordExists)) throw err
    }
  }

  /** Start turns for direct writes that ask for a reply. */
  attach(events: SyncEventBus): void {
    events.on('message:changed', (event) => {
      const record = event.record
      if (record.role !== 'user' || !record.generation) return
      const recent =
        Date.parse(String(record.createdAt)) >= this.now() - this.deps.config.backfillWindowMs
      if (!event.live && !recent) return
      this.start(event.did, event.skey, event.rkey).catch((err) =>
        this.deps.logger.error(
          { err, did: event.did, skey: event.skey },
          'could not start turn from sync',
        ),
      )
    })
    events.on('message:invalid', (event) => {
      this.answerInvalid(event).catch((err) =>
        this.deps.logger.error({ err, did: event.did }, 'could not answer invalid message'),
      )
    })
  }

  /** After a restart, mark this server's interrupted replies and retry recent queued turns. */
  async recover(): Promise<void> {
    const claims = await this.deps.db.selectFrom('turn_claim').selectAll().execute()
    for (const claim of claims) {
      try {
        const chats = this.deps.services.forAccount(await this.account(claim.owner_did))
        const skey = chats.skeyOf(claim.conversation_uri)
        const reply = await chats.store.getRecord(
          claim.conversation_uri,
          nsid.message,
          claim.reply_rkey,
        )
        if (reply?.value.status === 'pending') {
          await chats.putMessage(skey, claim.reply_rkey, {
            ...reply.value,
            status: 'error',
            error: 'interrupted',
          })
        }
        await this.deps.db
          .deleteFrom('turn_claim')
          .where('conversation_uri', '=', claim.conversation_uri)
          .where('reply_rkey', '=', claim.reply_rkey)
          .execute()
      } catch (err) {
        // The claim stays, so the next restart tries again.
        this.deps.logger.warn({ err, claim }, 'could not mark an interrupted reply')
      }
    }
    const cutoff = new Date(this.now() - this.deps.config.backfillWindowMs).toISOString()
    await this.deps.db.deleteFrom('turn_request').where('requested_at', '<', cutoff).execute()
    const requests = await this.deps.db.selectFrom('turn_request').selectAll().execute()
    for (const request of requests) {
      const { skey } = parseSpaceUri(request.conversation_uri)
      await this.start(request.owner_did, skey, request.message_rkey).catch((err) =>
        this.deps.logger.warn({ err, request }, 'could not retry a queued turn'),
      )
    }
  }
}
