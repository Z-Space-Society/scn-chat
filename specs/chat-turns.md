# Chat Turns

## Summary

A turn is one user message and the assistant reply it asks for. The web UI starts a turn by posting a message. A direct-PDS client starts one by writing a user message with a `generation` object, which the server notices through sync. Either way, one function, `startTurn`, runs it. It claims the reply by writing a pending placeholder at the reply's deterministic key, resolves the model, builds the prompt from the conversation's branch, and streams the reply through the Vercel AI SDK. While generating, it forwards progress to the web UI over server-sent events. When the model finishes, it writes the final reply record. Regenerating, editing, and cancelling are variations on the same flow.

## Motivation

This is the core of the app. It has to honor the direct-write conventions in `lexicons/README.md` exactly, so a conversation behaves the same whether the web UI or a hand-written record started it. Claiming the reply with a create-only write at a deterministic key guarantees one generation per attempt, even when the web UI and sync notice the same message.

## Design

### Starting a turn from the web UI

`POST /api/conversations/:skey/messages` with:

```ts
{ parent?: string; parts: Part[]; generation?: { model?: ModelRef; effort?: Effort; tools?: string[] } }
```

`parts` are text parts plus the attachment parts returned by the attachments API. The server builds the user message record, with a new TID key, `role: "user"`, the parent, `content` as `plainContent`, the generation request with `attempt` 0, and `createdAt`. It writes the record with `createMessage`, then calls `startTurn` when a generation request is present. The response returns the user message key and the reply key.

An edit is a new message with the same parent as the one being edited. The web UI sends it through this same route.

`POST /api/conversations/:skey/messages/:rkey/regenerate` with an optional `model` and `effort` rewrites the user message with `putMessage`. It raises `generation.attempt` by one and applies the new model and effort. Then it calls `startTurn`.

`POST /api/conversations/:skey/messages/:rkey/cancel` aborts the running generation for that reply key, if this server is running it.

### Starting a turn from a direct write

Chat-turns listens for `message:changed` events from sync. It calls `startTurn` when all of these hold:

- The message is a create or an update of a `user` message authored by the conversation's owner.
- The message has a `generation` object.
- No message exists at the reply key for its current attempt.
- The event is live, or the message's `createdAt` is within the last `turns.backfillMinutes`, default 60.

A conversation's first sync is a backfill, which only starts turns for recent messages. A conversation created by another client still gets answered, while importing or migrating old messages never triggers a flood of generations.

Whether a reply exists is checked with `getRecord` at the reply key, through the record store.

A turn that has been requested but not yet claimed, for example one waiting for the rate limit, is recorded in a `turn_request` table: conversation URI, user message key, attempt, and time, with the first three as the primary key. The same turn requested twice, say by the safety net and a notification, is therefore queued once. The row is deleted when the reply is claimed. On startup, the server retries every row newer than `turns.backfillMinutes` and drops older ones, so a restart does not lose queued turns. The table holds references only, never content.

When sync emits `message:invalid` for a user message that carries a generation request, the server writes an error reply at `<key>.r<attempt>`, using the attempt from the raw record or 0. Its error message quotes the validation error, so the direct client sees why nothing was generated.

### startTurn

`startTurn(user, conversation, userMessageKey)` runs the turn in the background and returns once the reply is claimed:

1. **Load.** It reads the conversation's info record and every message from the record store, once per turn, and keeps them in memory only for the turn. The reply key is `<userMessageKey>.r<attempt>`, with `attempt` defaulting to 0.
2. **Choose the model.** The model reference is `generation.model`, else the model of the nearest completed assistant reply up the branch, else the user's `defaultModel` preference, else the admin default. The effort is `generation.effort`, else the `defaultEffort` preference.
3. **Rate limit.** A user may start `turns.ratePerMinute` turns per minute, default 10. Past that, the turn waits in an in-memory queue per user and starts when the limit allows, without claiming the reply yet. The web UI's stream shows a `queued` status meanwhile.
4. **Claim.** It calls `createMessage` at the reply key with a placeholder: `role: "assistant"`, the parent key, empty `plainContent` parts, the chosen model and effort, `status: "pending"`, and `createdAt`. If that throws `RecordExists`, another runner, possibly another deployment watching the same space, owns the attempt, and `startTurn` stops. On success it records the reply URI in a local `turn_claim` table.
5. **Resolve.** The providers spec resolves the model reference to an AI SDK model. A failure rewrites the placeholder with `status: "error"` and a message saying why.
6. **Build the prompt.** The branch is the chain of parents from the user message to the root. The instructions are the admin's base prompt, the `customInstructions` preference, and the conversation's `systemPrompt`, joined by blank lines. The base prompt is `turns.systemPrompt` with its placeholders filled: `{{appName}}`, `{{date}}`, `{{time}}`, and `{{timezone}}`, in the time zone from the user's `timezone` preference, or UTC when it is missing or unknown. The default names the app, gives the date, and says replies are rendered as Markdown without raw HTML and with images loaded only on click. An empty `turns.systemPrompt` leaves the base prompt out. Each message becomes an AI SDK message:
   - User text parts become text parts. Attachments follow the attachments spec.
   - Assistant replies with status `complete` or `cancelled` contribute their text parts, tool calls and results, and reasoning according to the provider's replay policy. Replies with status `error` or `pending` are skipped.
7. **Filter.** It runs the `messages:beforeModel` hook.
8. **Generate.** It calls `streamText` with the model, instructions, messages, the tools for the turn, `stopWhen: isStepCount(turns.maxSteps)` (default 8), the mapped `reasoning` value, and an abort signal. The signal fires on cancel or after `turns.timeoutSeconds`, default 600. The tools are the ones named in `generation.tools`, or, when a message names none, the tools the user has switched on, as the web-search spec describes.
9. **Stream.** It reads `result.stream`, builds the reply's parts, and publishes events to the turn's stream buffer.
10. **Finish.** It builds the final record: parts in the order the model produced them, usage from `result.usage` (input, output, and `outputTokenDetails.reasoningTokens`), and a status. It runs the `message:afterModel` hook, then writes the record with `putMessage`. After that it runs the `turn:after` hook.

### Mapping stream parts to lexicon parts

| AI SDK stream parts | Lexicon part |
|---|---|
| `text-delta` runs between `text-start` and `text-end` | `textPart` |
| `reasoning-delta` runs between `reasoning-start` and `reasoning-end` | `reasoningPart` |
| `tool-call` | `toolCallPart`, with `input` JSON-encoded |
| `tool-result` or `tool-error` | `toolResultPart`, with `output` JSON-encoded unless already a string, and `isError` for errors |
| `source` with `sourceType: "url"` | `sourcePart` |

Other parts are ignored. When a stream part carries `providerMetadata`, it is JSON-encoded into the lexicon part's `providerData`. For text and reasoning, the metadata from the part's end event wins, since that is where providers attach signatures.

### Ending states

- **Complete.** The stream finished normally. Status `complete`.
- **Error.** The stream yielded an `error` part, or anything in the turn threw. Status `error`, with a short message from the error that never includes API keys or request headers. The partial parts are kept.
- **Cancelled.** The abort signal fired. Status `cancelled`, with the partial parts kept.
- **Too large.** If the final record's JSON is over 900 KB, the largest tool result outputs are uploaded as blobs and referenced from each part's `outputBlob`, and `output` keeps a short summary. If the record is still too large, the turn ends with status `error`.

On startup, the server rewrites any `pending` reply in its own `turn_claim` table as `error` with the message "interrupted", then clears the table. Pending replies claimed by other deployments are never touched.

### Streaming to the web UI

`GET /api/conversations/:skey/messages/:rkey/stream` is a server-sent event stream for a reply key, built with Hono's `streamSSE`. It first replays the events buffered so far, then sends live events:

| Event | Data |
|---|---|
| `part-start` | The part index and type |
| `delta` | The part index and appended text |
| `part` | A finished tool call, tool result, or source part |
| `queued` | The turn is waiting for the rate limit |
| `status` | The final status and error, if any |

The stream closes after `status`. If this server is not running that reply, the stream sends one `status` event with the reply's stored status and closes. The web UI then reads the record through the conversation API. A buffer is dropped a minute after its turn ends.

### Turn context

Hooks receive a turn context holding the user's DID, the conversation's URI and info, the user's preferences, the user message, the reply record as it stands, the resolved model reference and provider, the effort, and the names of the tools offered this turn. Tools are resolved before `messages:beforeModel` runs, so a plugin can add guidance for its own tools only when they are offered.

### Configuration

The `turns` admin setting, from the admin-settings spec, holds `ratePerMinute`, `maxSteps`, `timeoutSeconds`, `backfillMinutes`, and `systemPrompt`. A turn reads them when it starts, so a change applies to the next turn. Each turn holds the plugin runtime it started with until it ends, as the admin-plugins spec describes, and the runner starts no turn for a user without access.

## Scope Boundaries

- No multi-instance deployment. Streams, cancellation, and rate limits are in-process.
- No built-in tools. Tools come from plugins.
- No tool approval prompts.
- No streaming for direct-PDS clients. They see the placeholder, then the finished record.
- No context window management beyond what the provider enforces.

## Edge Cases and Decisions

- The pending placeholder is written with a create-only call, so the web UI and sync noticing the same message produce one generation.
- Rebuilds and backfills only start turns for messages newer than the backfill window, so missed notifications are recovered without replaying history.
- A rate-limited turn is delayed, not answered with an error, so direct clients are not left with a dead-end reply.
- Several deployments can watch the same spaces. The create-only claim picks one winner, and each server only cleans up its own claims.
- Replies that errored or are still pending are left out of later prompts. Cancelled replies keep their partial content in the prompt.
- The model falls back to the last completed reply's model on the branch, so switching models sticks for later turns, as the lexicons README says.
- A turn interrupted by a restart becomes `error` with "interrupted" on the next startup, not a retry, because retrying could spend money twice.
- Claimed replies are recorded in a local `turn_claim` table, keyed by conversation and reply key.
- The stream channel opens as soon as a reply is claimed, so a browser subscribing right after sending never sees an unknown stream.
- Stream writes are chained and flushed before a stream closes, so the final status is never dropped.
- The send route returns the user message key, the reply key, and whether the turn was claimed, queued, or already answered.
- Tools from a tool source are named `<source id>_<tool name>`, since providers only accept letters, digits, underscores, and dashes.
- The default base prompt gives the date but not the time. The time changes every turn, and a changing start of the prompt defeats provider prompt caching for the whole conversation. Admins who want it can add `{{time}}`.
- The time zone is a preference so turns started from direct PDS writes still use it. The web app saves the browser's zone on sign-in and with every settings save.

## Acceptance Criteria

- [ ] Posting a message with a generation request writes the user message, a pending reply at `<key>.r0`, and then the final reply.
- [ ] Posting without a generation request writes only the user message.
- [ ] A direct-write user message with a generation request, seen through live sync, starts a turn.
- [ ] An old unanswered user message seen during a backfill does not start a turn.
- [ ] A message authored by someone other than the owner does not start a turn.
- [ ] When the web UI and sync both notice a message, exactly one generation runs.
- [ ] Regenerating raises the attempt and writes the reply at `<key>.r<attempt>`, keeping earlier replies.
- [ ] An edit creates a sibling message with the same parent and its own reply.
- [ ] Model resolution follows request, then last completed reply on the branch, then preferences, then the admin default.
- [ ] The prompt contains only the branch from the root to the user message, with custom instructions and the system prompt as instructions.
- [ ] The instructions start with the base prompt, with the date in the user's time zone, falling back to UTC for a missing or unknown zone.
- [ ] Hooks receive the names of the tools offered this turn.
- [ ] Error and pending replies are left out of the prompt.
- [ ] Stream parts map to lexicon parts as in the table, with tool input and output JSON-encoded.
- [ ] A provider error ends the turn with status `error`, a message without secrets, and the partial parts.
- [ ] Cancelling ends the turn with status `cancelled` and the partial parts.
- [ ] A turn past the timeout is cancelled.
- [ ] A final record over 900 KB moves the largest tool outputs into `outputBlob` blobs.
- [ ] The stream endpoint replays buffered events to a late subscriber, then sends live ones.
- [ ] Past the rate limit, the turn waits unclaimed and starts once the limit allows.
- [ ] A backfill starts turns for unanswered messages newer than the backfill window, and not for older ones.
- [ ] On startup, requested but unclaimed turns newer than the backfill window are retried, and older ones are dropped.
- [ ] The same unclaimed turn requested twice is queued once.
- [ ] A turn reads the conversation from the record store and stores no content server-side.
- [ ] An invalid direct-write message with a generation request gets an error reply quoting the validation error.
- [ ] On startup, pending replies this server claimed are marked `error` with "interrupted", and pending replies it did not claim are left alone.
- [ ] The `turn:after` hook runs after the final record is written, with the turn context.
