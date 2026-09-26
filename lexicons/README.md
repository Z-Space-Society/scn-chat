# Lexicons

SCN Chat's record types use the `network.sharedcomputer.chat` domain. Each conversation is stored in its own atproto space, written in the conversation owner's repo.

## Spaces

| Space type | Key | Holds |
|---|---|---|
| `conversation` | TID | `info`, `message` |
| `settings` | `self` | `preferences` |

Each conversation's URI is `at://{ownerDid}/space/network.sharedcomputer.chat.conversation/{tid}`. Sharing is done via the space's read policy.

The system prompt for a conversation is built from the user's custom instructions followed by the conversation system prompt.

## Writing a conversation by hand

A conversation can be held by writing records directly to the PDS without interacting with an appview.

- Write a `message` with `role: "user"`, a TID key, and a `generation` object to ask for a reply. Messages without `generation` won't trigger a reply.
- The reply is written with the key `{userMessageKey}.r{attempt}`, where `attempt` comes from the `generation` object and defaults to 0.
- To regenerate, update the user message with `attempt` raised by one. Earlier replies stay as siblings. Order them by attempt number, since `.r10` sorts before `.r2`.
- When the app picks up a turn, it first writes the reply with `status: "pending"` and empty content, then updates it when generation ends. The write fails if the key already exists, so only one generation runs per attempt.
- Only messages authored by the space owner trigger replies.
- The default model is the model last used in the chat, or the user's default if this is the first message.
- `parent` holds the key of the previous message. Two messages with the same parent are an edit or a regeneration.

## Example

A user message asking for a reply, written with the key `3lzmxqvzwnk2a`:

```json
{
  "$type": "network.sharedcomputer.chat.message",
  "role": "user",
  "content": {
    "$type": "network.sharedcomputer.chat.defs#plainContent",
    "parts": [
      { "$type": "network.sharedcomputer.chat.defs#textPart", "text": "What's the weather in Vancouver?" }
    ]
  },
  "generation": {
    "model": { "provider": "anthropic", "id": "claude-opus-5-5" },
    "effort": "high",
    "tools": ["web_search"]
  },
  "createdAt": "2026-09-26T17:00:00.000Z"
}
```

The finished reply, at the key `3lzmxqvzwnk2a.r0`:

```json
{
  "$type": "network.sharedcomputer.chat.message",
  "role": "assistant",
  "parent": "3lzmxqvzwnk2a",
  "content": {
    "$type": "network.sharedcomputer.chat.defs#plainContent",
    "parts": [
      { "$type": "network.sharedcomputer.chat.defs#toolCallPart", "callId": "c1", "tool": "web_search", "input": "{\"query\":\"vancouver weather\"}" },
      { "$type": "network.sharedcomputer.chat.defs#toolResultPart", "callId": "c1", "output": "Rain, 12C" },
      { "$type": "network.sharedcomputer.chat.defs#textPart", "text": "Rainy, around 12C." }
    ]
  },
  "model": { "provider": "anthropic", "id": "claude-opus-5-5" },
  "effort": "high",
  "status": "complete",
  "usage": { "inputTokens": 412, "outputTokens": 38 },
  "createdAt": "2026-09-26T17:00:04.000Z"
}
```
