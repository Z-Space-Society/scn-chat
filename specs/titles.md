# Titles

## Summary

After the first reply in a conversation finishes, SCN Chat asks a model for a short title and writes it to the conversation's info record with `titleSource: "generated"`. This is the first turn hook, shipped as the `@scn-chat/plugin-titles` plugin. It never replaces a title the user wrote, and it respects the user's `generateTitles` preference.

## Motivation

A chat list of "New chat" entries is useless. Automatic titles are standard in ChatGPT, Claude, and Open WebUI. Building titles as a plugin also proves the hook system works for a real feature.

## Design

### Plugin

`plugins/titles` exports a factory:

```ts
titles({ model?: ModelRef, maxWords?: number })
```

- `model` picks the model used for titles, for example a cheap admin model. When it is left out, the title uses the same model and credentials that wrote the reply.
- `maxWords` defaults to 6.

The plugin registers one `turn:after` action.

### When a title is generated

The handler generates a title only when all of these are true:

1. The reply's status is `complete`.
2. The conversation's info record has no `title`.
3. `info.titleSource` is not `"user"`.
4. The user's preferences do not set `generateTitles` to `false`. A missing preferences record counts as `true`.
5. The conversation's content is not encrypted.

The turn context from the chat-turns spec carries the conversation info and the user's preferences, so the handler makes no extra reads.

### Generating

The handler calls `ctx.models.generateText` for the user. The system prompt asks for a title of at most `maxWords` words, with no quotes and no trailing punctuation, in the language of the conversation. The input is the text parts of the triggering user message and the reply, each cut to 2,000 characters. Reasoning, tool calls, and attachments are left out. The call sets effort to `none`, so a reasoning model spends its output on the title, and allows 1,000 output tokens for models that reason anyway.

The output is cleaned up before writing. Whitespace is collapsed, surrounding quotes and trailing periods are removed, and the result is cut to the lexicon's 300 graphemes. An empty result is treated as a failure.

### Writing

The handler calls `ctx.conversations.updateInfo` with `title` and `titleSource: "generated"`. The storage layer re-reads the info record before writing. If the user has set a title in the meantime, the update is skipped.

### Failure

A failed model call or an empty result logs a warning with the conversation URI and the error, and no title is written. An empty result's error names the model's finish reason. A title is a nice-to-have, so a failure never affects the turn. The next completed reply tries again, since the conversation still has no title.

## Scope Boundaries

- No title regeneration after the first one succeeds.
- No titles for encrypted conversations.
- No UI beyond showing the title. Renaming a chat is part of the web-ui spec, and sets `titleSource: "user"`.

## Edge Cases and Decisions

- The default title model is the one that wrote the reply, so a BYO-key user's titles bill to their own key, and nothing breaks when no cheap admin model is configured.
- A title the user writes while generation is running wins, because the write re-checks `titleSource`.
- Direct-PDS clients get titles too, since the hook runs for every turn the server generates, whatever started it.

## Acceptance Criteria

- [ ] A completed first reply in an untitled conversation produces a title with `titleSource: "generated"`.
- [ ] No title is generated when the info record already has a title.
- [ ] No title is generated when `titleSource` is `"user"`, even with no title set.
- [ ] No title is generated when the user's preferences set `generateTitles` to `false`.
- [ ] A missing preferences record allows titles.
- [ ] No title is generated for replies with status `error`, `cancelled`, or `pending`.
- [ ] A configured `model` option is used instead of the reply's model.
- [ ] Quotes, trailing periods, and extra whitespace are removed, and long output is cut to 300 graphemes.
- [ ] A failed model call logs a warning, writes nothing, and the turn stays `complete`.
- [ ] A later completed reply retries after an earlier failure.
- [ ] A user title written during generation is not overwritten.
