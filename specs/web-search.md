# Web Search and Fetch

## Summary

Two plugins give the model access to the web through tool calls. `@scn-chat/plugin-web-search` registers `web_search`, which queries a search engine and returns titles, URLs, and snippets. `@scn-chat/plugin-web-fetch` registers `web_fetch`, which downloads a page and returns its readable text as Markdown. The model decides when to call them. The admin picks a default search engine and key in the admin area, and a user can override it with their own engine and key unless the admin locks it. Search is off until a user or the admin turns it on. Fetch is on whenever the admin lists the plugin, limited by an optional domain allow or deny list. Users can switch either tool off in their settings when the admin allows it. Both tools cite what they used, which the web UI shows as source links, and both are marked untrusted, so core wraps their output before the model sees it.

This spec also adds things to core that any tool plugin can use: per-user tool switches, a network-guarded `fetch` for tools, a way for tools to cite sources, wrapping of untrusted tool output, a cache that lasts one turn, and access to file ingesters.

## Motivation

A chat assistant without web access cannot answer anything past its training cutoff or read a link the user pastes. Every comparable app offers search and fetch. CLAUDE.md requires them to be plugins, not core.

Search engines differ in cost, privacy, and quality, so the choice belongs to the admin and, if they want, to each user. An admin with no budget can run DuckDuckGo or a SearXNG instance, and a user who pays for Kagi can use their own key.

Today tools only run when a message lists them in `generation.tools`, and the web client never does, so a registered tool is never offered to the model. Tools need a default state and a per-user setting instead.

## Design

### Core: tool switches

`Tool` in `@scn-chat/plugin-api` gains two optional fields:

```ts
interface Tool<Input = unknown> {
  // existing fields
  /** Offered to the model when the message names no tools and the user has not switched it. */
  defaultEnabled?: boolean // default false
  /** Whether users may switch the tool on and off in their settings. */
  userToggle?: boolean // default false
  /** Output comes from outside the user's control, such as the web, and is wrapped before the model sees it. */
  untrusted?: boolean // default false
}
```

A tool is enabled for a user when the user has a stored choice for it and `userToggle` is true, and otherwise when `defaultEnabled` is true. A tool without `userToggle` always follows its default, so an admin can force a tool on or off through the plugin's options.

User choices live in a new app database table, alongside plugin settings:

```
user_tool_settings (did, tool, enabled, updated_at), primary key (did, tool)
```

The turn runner picks tools as follows:

- `generation.tools` present, including an empty list: unchanged. The named tools are used, an unknown name fails the turn, and naming tools for a model without the `tools` capability fails the turn.
- `generation.tools` absent: the user's enabled tools. If the model lacks the `tools` capability, no tools are sent and the turn does not fail.

Tool sources keep today's behavior and are only used when named in `generation.tools`.

The settings API grows:

- `GET /api/plugins/settings` returns, for each plugin, a `tools` list of `{ name, description, enabled, userToggle }` for the tools it registered. A plugin appears when it has user settings or at least one tool with `userToggle`.
- `PUT /api/plugins/:id/tools/:name` with `{ enabled: boolean }` stores the user's choice. It returns 404 for a tool the plugin did not register, and 400 when the tool has no `userToggle`.
- `DELETE /api/plugins/:id/settings` does not touch tool choices.

The plugin host records which plugin registered each tool so the routes can check ownership.

In the web UI, each plugin's settings block shows a checkbox per tool with `userToggle`, labeled with the tool name, above the plugin's generated form. Changing it saves immediately.

### Core: tool context

`ToolContext` gains three members:

```ts
type ToolContext = {
  user: string
  conversation: string
  /** The user's roles when the turn started. */
  roles: string[]
  signal: AbortSignal
  /** Fetch for URLs from users or the model, refused for private network addresses. */
  fetch: typeof globalThis.fetch
  /** Add a source link to the reply. */
  cite(source: { url: string; title?: string }): void
  /** Scratch space for this tool during this turn. */
  turnCache: Map<string, unknown>
}
```

- `fetch` is the server's guarded fetch, or plain `fetch` when `ALLOW_PRIVATE_NETWORKS` is set. The guard checks the connected socket's address and refuses redirects. A caller that passes `redirect: 'manual'` gets the redirect back and follows it itself, so each hop goes through the guard again. URLs the admin set in a plugin's options are trusted, and plugins use plain `fetch` for them.
- `roles` are the user's roles, worked out once when the turn starts, so a tool can gate what the admin pays for, such as an admin key.
- `turnCache` is a map private to the tool, created when the turn starts and dropped when it ends, whether it completes, errors, or is cancelled. Nothing in it outlives the turn, as the founding principle requires.
- `cite` adds a `sourcePart` to the reply being written, through the same accumulator that handles provider `source` events. Only `http` and `https` URLs are accepted, and others are dropped. A URL already cited in the reply, by a tool or by the provider, is not added again. Titles are cut to the lexicon's 300 graphemes.

### Core: ingesters for plugins

`PluginContext.ingesters` gains two methods next to `register`:

```ts
ingesters: {
  register(ingester: Ingester): void
  /** Whether any registered ingester accepts the MIME type. */
  accepts(mimeType: string): boolean
  /** Extract text with the ingester that attachments would use, or undefined when none accepts the type. */
  ingest(file: IngestInput): Promise<{ text: string } | undefined>
}
```

The ingester is picked as for attachments: the highest priority one that accepts the MIME type. A plugin that needs a file type depends on the type, not on another plugin, so an OCR plugin can take over PDFs without the caller changing.

`ctx.tools.register` becomes generic over the tool's input type, so a tool with a real input schema registers without a cast.

The plugin API version stays 1, since every change is additive. `@scn-chat/plugin-api/testing` adds `toolContextForTest({ fetch?, user?, conversation? })`, which returns a `ToolContext` and the list of citations it recorded.

### Plugin: web search

`plugins/web-search` exports a factory and an `optionsSchema`, edited in the admin area:

| Option | Default | Meaning |
|---|---|---|
| `engine` | required | `duckduckgo`, `brave`, `tavily`, `searxng`, or `kagi`. |
| `apiKey` | | Secret. Required for brave, tavily, and kagi. |
| `baseURL` | | Required for searxng. |
| `adminEngineRoles` | `['user']` | The roles that may search with the admin's engine and key. |
| `enabledByDefault` | `false` | |
| `userToggle` | `true` | |
| `userEngines` | `true` | |
| `maxResults` | `5` | 1 to 20. |

There is no default engine, so options without `engine` are refused, as do options that name an engine needing a key without one, or `searxng` without `baseURL`.

When `userEngines` is true, the plugin has user settings:

| Field | Type | Notes |
|---|---|---|
| `engine` | enum: `default` plus every registered engine ID | Default `default`, which means the admin's engine. |
| `apiKey` | string, optional, secret | The user's key for their engine. Shown only for engines that need a key. |
| `baseURL` | URL string, optional | The user's SearXNG instance. Shown only for engines that need a base URL. |

Each call resolves an engine this way:

1. User engine `default`, or user engines off: the admin's engine, key, and `baseURL`, with plain `fetch`.
2. Any other user engine: the user's key and `baseURL`. When the user picked the admin's engine and left a field blank, the admin's value fills it. A user `baseURL` is reached through `context.fetch`. A missing required key or `baseURL` is a tool error such as "Add your Kagi API key in the web search settings."

The admin's engine, key, and `baseURL` are only used for users holding a role in `adminEngineRoles`, from `context.roles`. Anyone else gets a tool error: "Add your own search engine in the web search settings to search the web." with user engines on, or "Web search isn't available to you." with them off. The admin's values never fill a blank for them either.

The tool:

- Name `web_search`. Description: "Search the web. Returns a title, URL, and snippet for each result.", followed by the query operators the admin's engine supports, such as "Supported operators: site:example.com, \"exact phrase\", -term."
- Input `{ query: string }`, 1 to 400 characters.
- Output `{ results: { title: string; url: string; snippet: string }[] }`, at most `maxResults` entries, with snippets cut to 500 characters and HTML tags stripped.
- It cites every result.
- Requests time out after 15 seconds, combined with `context.signal`.

Each engine is an adapter behind one interface, in its own file under `plugins/web-search/src/engines/`. `engines/index.ts` exports the list of engines, and everything else derives from it: the `engine` enum in the options and user settings schemas, the key and base URL checks at startup, the JSON Forms rules that show the key and base URL fields, and the error messages, which use the engine's `name`. Adding an engine is a new file, one line in the list, and a test with a recorded response. Removing one is the reverse. Nothing outside `engines/` names a specific engine.

```ts
type SearchEngine = {
  id: string
  name: string
  needsKey: boolean
  needsBaseURL: boolean
  /** Query operators the engine supports, listed in the tool description. */
  operators: string[]
  request(search: { query: string; count: number; apiKey?: string; baseURL?: string }): {
    url: string
    init?: RequestInit
  }
  /** Results from the response body. Throws when the body is not a results page. */
  parse(body: string): SearchResult[]
  /** A message for an error status, when the engine needs a better one than the default. */
  describeError?(status: number): string | undefined
}

type SearchResult = { title: string; url: string; snippet: string }
```

An adapter only builds the request and maps the response. Shared code in `src/search.ts` sends the request with the app's user agent and a 15 second timeout, picks the fetch, maps HTTP and network errors to messages, reads the body, strips HTML and entities from titles and snippets, cuts snippets and the result count, and cites the results. `createWebSearch(engines)` in `src/index.ts` builds the plugin from any engine list, and the package's default export is built from `engines/index.ts`.

| Engine | Request | Results |
|---|---|---|
| DuckDuckGo | `POST https://html.duckduckgo.com/html/` with form field `q` | Parsed with `linkedom`: each `.result` without `.result--ad`, title and link from `a.result__a`, snippet from `.result__snippet`. Links of the form `//duckduckgo.com/l/?uddg=<url>` are unwrapped. |
| Brave | `GET https://api.search.brave.com/res/v1/web/search?q=&count=`, header `X-Subscription-Token` | `web.results[]` with `title`, `url`, `description` |
| Tavily | `POST https://api.tavily.com/search` with `{ query, max_results, search_depth: "basic" }`, header `Authorization: Bearer <key>` | `results[]` with `title`, `url`, `content` |
| SearXNG | `GET <baseURL>/search?q=&format=json` | `results[]` with `title`, `url`, `content`, sliced to the count |
| Kagi | `GET https://kagi.com/api/v0/search?q=&limit=`, header `Authorization: Bot <key>` | `data[]` entries with `t: 0`, with `title`, `url`, `snippet` |

Responses are validated with zod. A response that does not match is a tool error naming the engine. HTTP errors become tool errors the model can read and report:

- 401 or 403: "The Brave API key was rejected." For SearXNG, a 403 says the instance must enable the JSON format.
- 429: "Brave's rate limit was reached."
- Anything else: "Brave search failed (HTTP 500)."

For DuckDuckGo, a non-200 status or a page without the results container is an error saying DuckDuckGo blocked the search, not an empty result. Keys never appear in errors or logs.

### Plugin: web fetch

`plugins/web-fetch` exports a factory and an `optionsSchema`:

```yaml
- package: '@scn-chat/plugin-web-fetch'
  options:
    allowDomains: []     # optional; when set, only these domains may be fetched
    denyDomains: []      # optional; these domains are never fetched
    userToggle: true     # default true
    maxCharacters: 20000 # default 20000
    maxBytes: 5000000    # default 5 MB, for pages
    maxFileBytes: 20000000 # default 20 MB, for files passed to ingesters
    timeoutSeconds: 20   # default 20
```

Listing the plugin enables the tool, so `web_fetch` has `defaultEnabled: true`. It has no user settings beyond its tool switch.

A domain entry matches that host and its subdomains, so `example.com` covers `docs.example.com`. Entries are lowercased hostnames without a scheme or path, and anything else fails startup. The deny list is checked first. When the allow list is non-empty, a host outside it is refused. The lists apply to every hop of a redirect.

The tool:

- Name `web_fetch`. Description: "Fetch a web page or document, such as a PDF, and return its main text. Long pages come in parts; call again with nextOffset for the next part."
- Input `{ url: string; offset?: number }`. The URL must be `http` or `https`, and `offset` is a character position, default 0.
- The request always goes through `context.fetch`, since the model chose the URL. It is a `GET` with the header `User-Agent: <app name> (+<public URL>)`. Redirects are followed by hand, up to 5 hops, and each hop's host is checked against the domain lists.
- Page types are `text/html`, `application/xhtml+xml`, `text/plain`, `text/markdown`, and `application/json`. Their body is read up to `maxBytes`, and the rest is dropped. It is decoded with the charset from `Content-Type`, defaulting to UTF-8.
- Any other type is a file. When `ctx.ingesters.accepts` says yes, the body is read up to `maxFileBytes` and passed to `ctx.ingesters.ingest`. A file over `maxFileBytes` is a tool error, since a cut file cannot be parsed. When no ingester accepts the type, it is a tool error naming the type, raised before the body is read.
- HTML is parsed with `linkedom`. `script`, `style`, `nav`, `header`, `footer`, `noscript`, `template`, and `iframe` elements are removed, and links and images are made absolute against the final URL. `@mozilla/readability` then extracts the main content, and `turndown` converts it to Markdown. Readability returns nothing only for an empty page, which gives empty content. Other page types and ingested text are returned as text.
- The extracted text is kept in `context.turnCache` under the requested URL, so asking for another part of the same URL in the same turn does not download it again. A later turn downloads it again.
- The text is served in parts of `maxCharacters`, starting at `offset`. A part ends at the last line break in its second half when there is one, and otherwise at `maxCharacters`.
- Output `{ url: string; title?: string; content: string; offset: number; nextOffset?: number; totalCharacters: number }`, where `url` is the final URL after redirects and `nextOffset` is present when text remains. An `offset` past the end is a tool error giving `totalCharacters`.
- It cites the final URL with the page title.
- An HTTP status of 400 or more is a tool error: "Fetching https://example.com failed (HTTP 404)." A private network refusal or a domain list refusal is a tool error saying the address is not allowed.

### Prompt injection

Fetched pages and search snippets can carry instructions aimed at the model. No library detects this reliably, so the defenses are structural:

- **Marking, in core.** Both tools set `untrusted: true`, and tools from tool sources, such as future MCP servers, are always untrusted. The turn runner wraps an untrusted tool's output before the model sees it, between `<untrusted_tool_output id="<boundary>">` and `</untrusted_tool_output id="<boundary>">`, with a first line saying the content is data from outside the user's control and instructions inside it must not be followed. The boundary is 16 random bytes in hex, new for every result. A page cannot guess it, so it cannot close the wrapper early, and the text needs no stripping. Plugins do not wrap anything themselves.
- **Where wrapping happens.** Records store the raw output. The runner wraps it in the AI SDK tool's `toModelOutput` during a turn, and wraps it again with a fresh boundary when a later turn replays the branch. A replayed result from a tool that is no longer registered is treated as untrusted.
- **Limiting reach.** The domain lists let an admin confine fetch to known sites. The guarded fetch keeps the model away from private networks.
- **No silent exfiltration in the UI.** The web UI loads Markdown images in assistant text only when the user clicks, after showing the full URL, as the web-ui spec describes, so injected output cannot leak the chat through an image URL.

The remaining channel is the model putting conversation text into a URL it fetches. The allow list is the admin's control for that.

### Config and docs

- Both plugins describe their options with titles for the admin form. Web search marks its admin `apiKey` secret, and shows the key and base URL only for engines that use them.
- `docs/plugins.md` documents `defaultEnabled`, `userToggle`, `context.fetch`, `context.cite`, `untrusted`, and `toolContextForTest`.
- The web search README notes that Brave's free credit requires crediting Brave Search on the site, and that DuckDuckGo is scraped and best effort.

## Scope Boundaries

- No provider-native search tools, such as Anthropic's web search or Gemini grounding, and no tools that apply only to certain models.
- No per-conversation tool switches. The switch is a user setting.
- No switches for tool sources.
- No fetching of files that no installed ingester accepts.
- No JavaScript rendering, so pages that need a browser to show content return little.
- No caching beyond a turn. Every turn goes to the engine or the page again.
- No prompt injection classifier. A plugin could add one later through the `message:afterModel` hook or a wrapper tool.
- No display names for tools. Settings show the tool name.
- No search engines beyond the five listed, though adding one is a small change.
- Plugin settings and tool switches stay in the app database. Moving them to the user's PDS needs a generic plugin settings lexicon, which is future work.

## Edge Cases and Decisions

- The admin must name an engine, since none is right for every site: the free ones are scraped or self-hosted, and the rest need an account.
- Web search is off by default because DuckDuckGo, the no-key engine, is scraped and gets rate limited when every user's searches come from one server address.
- Tool switches are stored in the app database next to plugin settings for now. They are user data and belong on the PDS once a generic plugin settings lexicon exists.
- A missing `generation.tools` means "the user's enabled tools", and an explicit list, even an empty one, means exactly that list. Direct-PDS clients that name tools keep working unchanged.
- When tools come from the user's settings and the model cannot use tools, the turn runs without them instead of failing, since the user did not ask for tools on that message.
- Admin-configured URLs use plain `fetch`, and user or model URLs use the guarded one, so an admin's SearXNG on an internal network works without letting users reach internal services.
- The admin's key pays for searches unless the user picks an engine of their own. A user who picks the admin's engine without a key still uses the admin's key.
- Search cites every result it returns, not only the ones the model used. The model's use of them is not visible to the tool.
- Fetch has no default switch of its own. An admin who lists the plugin wants it on, and the domain lists are how they limit it.
- `userEngines: false` removes the engine fields from the user settings, so every user searches with the admin's engine and key.
- Untrusted content uses a random boundary rather than stripping wrapper tags from the page, since stripping can be defeated by nesting or case changes and the boundary cannot be guessed.
- Fetched HTML never reaches the browser as HTML. It becomes Markdown text on the server, the web UI shows tool output as text, and assistant Markdown renders no raw HTML, so pages have no XSS path.
- Fetch reaches file ingesters by MIME type rather than declaring a dependency on the PDF plugin, so whichever ingester handles a type, such as a future OCR plugin, works without changes.
- Long pages are paged by offset from a cache that lasts the turn. Keeping pages longer, as Hermes does on disk, would store what users read on the server.
- The search description lists the admin's engine's operators and is fixed at startup. A user who picks another engine sees the admin's list.
- Engines are a request builder and a response parser rather than a function that fetches, so HTTP, errors, timeouts, and the choice of fetch are written once.
- DuckDuckGo is scraped with `linkedom` in our own adapter, not through a scraping library, since both break when the page changes and our adapter is about 40 lines.

## Acceptance Criteria

Core:

- [ ] A tool with `defaultEnabled` is offered to the model when the message has no `generation.tools`.
- [ ] A tool without `defaultEnabled` is not offered unless named in `generation.tools`.
- [ ] A user's stored choice overrides the default for a tool with `userToggle`, and is ignored for a tool without it.
- [ ] An explicit `generation.tools`, including an empty list, is used exactly as today.
- [ ] Enabled tools are skipped without failing the turn when the model lacks the `tools` capability.
- [ ] `GET /api/plugins/settings` lists each plugin's tools with their enabled state and `userToggle`.
- [ ] `PUT /api/plugins/:id/tools/:name` stores the choice, returns 404 for another plugin's tool, and 400 for a tool without `userToggle`.
- [ ] The settings page shows a checkbox per switchable tool and saves changes.
- [ ] `context.fetch` refuses private network addresses, including through redirects, unless `ALLOW_PRIVATE_NETWORKS` is set.
- [ ] `context.cite` adds a `sourcePart` to the reply, ignores non-HTTP URLs, and skips URLs already cited.
- [ ] `context.turnCache` keeps values between calls of the same tool in a turn, is separate for each tool, and is empty in the next turn.
- [ ] `ctx.ingesters.ingest` uses the highest priority ingester for the type and returns undefined when none accepts it, and `accepts` agrees with it.

Web search:

- [ ] The engine enum and startup checks come from the engine list, so a test engine passed to the plugin's internal builder is selectable and validated with no other changes.
- [ ] Each engine adapter maps a recorded response to results, with HTML stripped and snippets cut to 500 characters.
- [ ] DuckDuckGo redirect links are unwrapped and ads are skipped.
- [ ] A DuckDuckGo block page is an error, not an empty result.
- [ ] Options without an engine, naming a keyed engine without a key, or SearXNG without a base URL, fail startup.
- [ ] With the user engine on `default`, the admin's engine and key are used.
- [ ] A user engine uses the user's key, falls back to the admin's key only for the admin's engine, and errors when a required key is missing.
- [ ] A user's SearXNG base URL goes through the guarded fetch, and the admin's does not.
- [ ] Rejected keys, rate limits, other HTTP errors, and malformed responses become tool errors naming the engine, without the key.
- [ ] Results are cut to `maxResults`, and each is cited.
- [ ] The tool description lists the admin's engine's operators.
- [ ] With `userEngines: false`, the plugin exposes no engine settings and always uses the admin's engine.
- [ ] A user outside `adminEngineRoles` can't search with the admin's engine, and the admin's key never fills a blank for them, but they can use their own engine.
- [ ] `context.roles` holds the user's roles when the turn started.
- [ ] The key field is shown only for engines that need a key, and the base URL field only for engines that need one, so neither shows for `default`.

Prompt injection:

- [ ] Output from a tool with `untrusted` is wrapped before the model sees it, both live and when replayed in a later turn.
- [ ] Output from tool sources, and replayed output from tools no longer registered, is wrapped.
- [ ] Output from a tool without `untrusted` is not wrapped.
- [ ] Stored tool result parts hold the raw output, without the wrapper.
- [ ] Each call uses a new random boundary, and a closing tag in the page text without that boundary does not end the wrapper.

Web fetch:

- [ ] The tool is enabled for users once the plugin is listed.
- [ ] A denied domain or one of its subdomains is refused, and with an allow list only listed domains and their subdomains are fetched.
- [ ] A redirect to a refused domain is refused, and more than 5 redirects is an error.
- [ ] Invalid domain list entries fail startup.
- [ ] An HTML page returns its title and article text as Markdown, and cites the final URL.
- [ ] A page without an article element still returns its text, without navigation or scripts, and with absolute links.
- [ ] Plain text and JSON are returned as text.
- [ ] Unsupported content types, HTTP errors, and non-HTTP URLs are tool errors.
- [ ] Text over `maxCharacters` comes in parts with `nextOffset`, and the last part has none.
- [ ] A second call for the same URL in the same turn is served from the turn cache without a download.
- [ ] An offset past the end is a tool error.
- [ ] Page bodies over `maxBytes` stop reading.
- [ ] A PDF is fetched and returned as the text from the ingester.
- [ ] A file type no ingester accepts is refused before its body is read, and a file over `maxFileBytes` is refused.
- [ ] A URL resolving to a private address is refused.

## Files

- `packages/plugin-api/src/index.ts`, `packages/plugin-api/src/testing.ts`
- `apps/server/src/turns/runner.ts`, `apps/server/src/turns/accumulator.ts`
- `apps/server/src/turns/prompt.ts`, for wrapping replayed untrusted output
- `apps/server/src/plugins/host.ts`, `apps/server/src/plugins/routes.ts`, `apps/server/src/plugins/user-tools.ts`
- `apps/server/src/db/migrations/0006_user_tool_settings.ts`
- `apps/web/src/pages/SettingsPage.tsx`
- `plugins/web-search/`, `plugins/web-fetch/`
- `docs/plugins.md`
