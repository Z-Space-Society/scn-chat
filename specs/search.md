# Search

## Summary

Users can search the text of their own conversations: titles, their messages, and the assistant's replies. Search runs entirely in the browser, over the local SQLite database from the browser-store spec, using SQLite's FTS5 full-text index. The server has no search index and takes no part in searching. Results link to the matching message with a short highlighted snippet. This spec is part of phase 1 but is built after the initial build-out.

## Motivation

Chat history is only worth owning if you can find things in it. A PDS has no search API, and the server keeps no copy of chat content, so the index has to live on the user's device. The browser store already holds a copy of the user's chats, so search is an index over data already there.

## Design

### Index

Search adds two FTS5 tables to the browser store's schema and bumps its schema version, which rebuilds the local database on the next load:

- `message_fts` stores its own copy of each message's `text`, plus the conversation key, author, and message key as unindexed columns. It does not use an external content table, since the `message` table's composite key gives no stable rowid.
- `conversation_fts` indexes conversation titles the same way.

Both use the `unicode61` tokenizer with diacritics removed, so search behaves the same in any language. Triggers on `message` and `conversation` keep the index in step on insert, update, and delete.

Only plaintext is indexed: the text parts of messages. Reasoning, tool input and output, and attachment contents are left out. Encrypted messages have no text, so they never appear.

### Query

`search(query, { limit, offset })` in the browser-store worker:

- Words are ANDed, and a quoted phrase matches exactly.
- User input is tokenized and quoted before it reaches FTS5, so no character can be read as query syntax.
- Title matches rank first, then message matches by FTS5's `bm25` relevance, then newest first.
- Each result has the conversation key and title, the message key and role, a snippet of about 30 words from FTS5's `snippet` function, and the message's creation time.

Snippets mark matches with private-use characters, which the UI turns into highlight elements. Message text is never inserted as HTML.

### Coverage

Search covers every conversation the browser store has downloaded. On a new device, results fill in as the background download progresses, and the UI says how many conversations remain to download.

### Web UI

A search box above the chat list. Results replace the list while a query is active, and choosing one opens the conversation scrolled to that message.

## Scope Boundaries

- No server-side search or index.
- No searching other people's chats, including chats shared with the user.
- No semantic or vector search.
- No searching attachment contents or extracted PDF text.
- No search inside encrypted conversations.

## Edge Cases and Decisions

- The index lives in the browser, so the server never builds a copy of chat content for search.
- FTS5 tables store their own copy of the text instead of linking to `message` by rowid, which the composite key cannot keep stable.
- Search is local to each device. Each device builds its own index from the PDS.

## Acceptance Criteria

- [ ] A word from a user message finds that message.
- [ ] A word from an assistant reply finds that reply.
- [ ] A word in a conversation title finds the conversation, ranked above message matches.
- [ ] Multiple words match only messages containing all of them.
- [ ] A quoted phrase matches only that exact phrase.
- [ ] Query syntax characters in user input are treated as plain text and never cause an error.
- [ ] Editing or deleting a message updates or removes it from results.
- [ ] Snippets mark the matched words without inserting HTML.
- [ ] Search makes no server request.
- [ ] While the background download is running, the UI shows how many conversations remain.
