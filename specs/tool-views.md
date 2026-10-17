# Tool Views

## Summary

A reply's tool calls show as what they did, not as JSON. Each tool can have a view in the web app, looked up by tool name in one table, with today's display as the fallback for every tool without one. A web search shows as "Searched the web" with its query, and opens onto its results as linked titles with their snippets. A page fetch shows as "Read a page" with its address, and opens onto the page's title and the text the model read. The live line over a working reply and the summary of its finished steps use the same words. Every tool call has one derived status, which its badge, its row, and the live line all read.

This is the tool-view part of [[extending]], split out and decided in full. It changes only the web app.

## Motivation

`web_search` and `web_fetch` are the tools every user sees, and today a call to either is a function name and a glimpse of JSON. Opened, it shows its input and output as pretty-printed JSON:

```
③  web_search  {"query":"best espresso grinder 2026"}
     Input   { "query": "best espresso grinder 2026" }
     Output  { "results": [ { "title": "…", "url": "…", "snippet": "…" }, … ] }
```

That is right for a programmer debugging a tool and wrong for everyone else. Every chat app surveyed in [[extending]] maps tool names to components with a generic fallback, and Vercel's AI SDK course teaches the same pattern as generative UI: the tool's result drawn as a component once it is available, with the raw view kept for failures.

The steps list already pairs each call with its result, numbers the steps, colors them by state, and times them, so what is missing is how one tool step reads. The status is also derived in the view today from whether the step is the last of a live block, so when a model calls two tools at once, the first shows "no result" while it is still running.

## Design

### The table of tool views

`parts/tools/index.ts` holds `toolViews`, keyed by tool name, and `toolEntry(tool)`, which gives a tool's entry or the default:

```ts
export const toolViews: Record<string, ToolEntry> = {
  web_search: webSearch,
  web_fetch: webFetch,
}

interface ToolEntry {
  /** What the step did, on its row and in the finished summary: "Searched the web". */
  label: string
  /** What it is doing while it runs, on the live line: "Searching the web". */
  activity: string
  /** Whether the label is the tool's own name, shown as code. */
  code?: boolean
  /** The few words of the call's input, as its JSON text, that its row shows. */
  glimpse(input: string): string
  /** The step's body once opened. */
  View: ComponentType<ToolViewProps>
}

interface ToolViewProps {
  call: Part
  result: Part | undefined
  status: ToolStatus
  record: Record<string, unknown>
  blobUrl: BlobUrl
}
```

A tool missing from the table uses the default entry, whose label is the tool's name shown as code, whose activity is "Running <tool>", whose glimpse is `inputGlimpse`, and whose view is `DefaultToolView` in `parts/tools/default/`, the Input and Output display.

Each view lives in `parts/tools/<tool>/index.tsx`, with its parsing beside it. Views share `parts/tools/ui.tsx`, with `PageTitle` for a page's title linking to it over its site, `StepCode` for text in a scrolling code box, and `ToolNote` for a quiet line such as "Searching…", and `parseJson`. Adding a view is one folder and one line in `toolViews`.

### Tool status

`toolStatus(result, record)` in `parts/tool-status.ts` derives one value per call:

| Status | When | Badge |
|---|---|---|
| `running` | No result yet, and the message is still `pending` | running |
| `done` | A result without `isError` | none |
| `error` | A result with `isError` | failed |
| `incomplete` | No result, and the message is no longer `pending`, because it was stopped, failed, or finished without one | incomplete |

The step's `data-state`, its badge, the numbered circle's color, its timer, and whether the live line names it all read this value. Every call without a result in a pending message is `running`, so calls made at once all show as running until each result arrives. "incomplete" replaces today's "no result".

### A tool step

A tool step is a `<details>` as today. Its row reads:

- **chevron, label, glimpse, badge, elapsed**: "Searched the web *best espresso grinder 2026*", with the glimpse muted and truncated. A tool without a view hides it once open, since its body shows the input in full.

Opening it shows the tool's view. A tool view decides for itself when to fall back to the default body, which is today's Input and Output, or Error, with the Full output link when the output was moved to a blob. Every view falls back on an error result, an output moved to `outputBlob`, and an output that does not parse as the shape it expects, so a change in a plugin's output never hides what the tool did.

### The live line and the finished summary

- **Live:** "Searching the web…" in place of "Running web_search…", from the entry's `activity`. Reasoning stays "Thinking…", and the gap after a result stays "Reading the results…".
- **Finished:** `stepsSummary` names tool steps by their `label`, through a `labelOf` it is given, counting repeats as now: "Thought for 12s · Searched the web ×2 · Read a page". The footer button over a finished reply's steps reads the same.

### The web search view

`parts/tools/web-search/` reads the call's input as `{ query }` and the result's `output` as the JSON the plugin returns, `{ results: [{ title, url, snippet }] }`, with `snippet` optional.

- **Glimpse:** the query.
- **Running:** the body says "Searching…" in muted text.
- **Done:** a list of results, in the order returned. Each is:
  - its title, as a link to its URL, opening in a new tab with `rel="noreferrer"`
  - the URL's host without a leading `www.`, muted, under the title
  - its snippet as plain text, cut to two lines
- **Many results:** the first seven show, over a quiet "Show 3 more" button, which shows the rest in place and becomes "Show less". A list that would hide only one result shows all eight instead. Opening it moves focus to the first link it showed. The list starts folded each time it is drawn.
- **No results:** "No results."
- **A result whose URL is not `http` or `https`:** its title as plain text, with no link and no host.
- **Fallback:** the default body, for an error, an output in a blob, or an output that is not an object with a `results` array whose items each have a string `title` and `url`, and a string `snippet` or none.

### The web fetch view

`parts/tools/web-fetch/` reads the call's input as `{ url }` and the result's `output` as the JSON the plugin returns, `{ url, title?, content, offset, nextOffset?, totalCharacters }`.

- **Label:** "Read a page". **Activity:** "Reading a page".
- **Glimpse:** the requested URL's host, path, and query, without the scheme, a leading `www.`, or a bare `/` path.
- **Running:** the body says "Reading…" in muted text.
- **Done:**
  - the page's title, or its host when it has none, as a link to the final URL, opening in a new tab with `rel="noreferrer"`
  - the final URL's host, muted, under the title, as the search view shows it
  - when the page's text is longer than this call read, a muted line: "Characters 20,001–40,000 of 48,213", from `offset` to `nextOffset`, or to `totalCharacters` when the read ran to the end
  - the text the model read, as plain text in today's scrolling code box
- **Fallback:** the default body, as for search, and for an output without a string `url` and `content` and numeric `offset` and `totalCharacters`, or with a `title` that isn't a string or a `nextOffset` that isn't a number.

### Untrusted output

Tool output comes from the web. Tool views show it as text, never as HTML or Markdown, open links in a new tab with `rel="noreferrer"`, link only `http` and `https` URLs, load no images, and take each block's direction from its own text with `dir="auto"`, as the row's glimpse does. The default view's Input and Output are JSON, so they stay left to right. Search results show no favicons, since loading one tells the site, or a favicon service, what the user searched for.

## Scope Boundaries

- No changes to the server, the lexicons, or the plugins. The views read the output the plugins already return.
- No views for other tools. Tools from tool sources, such as future MCP servers, use the default view.
- No favicons, page previews, or images from tool output.
- No inline citation markers. Sources carry no position in the text.
- No change to the source links at the end of a reply.
- No tool approval.
- No plugin API for the web app. Forkers add a view by editing the table, as ADR 0002 records.

## Edge Cases and Decisions

- **Search results and source links both list the results.** The search plugin cites every result it returns, as [[web-search]] decided, so a search's results show in its step and again as the reply's source links. This spec keeps both. The source links are the reply's references, visible without opening its steps and on the shared page, and they also hold sources from providers' own search, which has no step. Citing only what the model read would need the plugins to change and would leave a reply answered from snippets alone with no sources.
- **One click to results.** A search step's body is its results, with no Input and Output headings, since its row already shows the query. A run of two or more steps stays folded inside its collapsed group, as [[extending]] decided, so results are two clicks away in a reply that also thought or called other tools.
- **The output's shape is checked, not trusted.** A view parses its output and falls back on any mismatch, rather than showing an error, so records written by an older or newer plugin still show what the tool did.
- **Status in one function.** Labels, badges, colors, and accessible names read one value, so they cannot disagree, which LibreChat learned after its labels and icons drifted apart.
- **Parallel calls.** Every call without a result in a pending message is running, so two calls made at once both breathe until their results arrive, where today only the last one does.
- **The glimpse stays once open for a tool with a view.** The default view shows the input in full, so its glimpse goes once open, as before. A tool's own view shows what the tool found, such as a search's results, and not the query, so the row keeps it.
- **A fetch's text stays plain.** The plugin returns the page as Markdown, but it is untrusted, so it shows as the text the model read rather than rendered.

## Acceptance Criteria

Each is checked by rendering a reply through `MessageView`, or `StreamingReply` in `PendingReply.tsx` for a pending one, with tool call and result parts in its record.

- [x] A tool call and its result render once, together, through the tool's view, or the default view when the tool has none.
- [x] A result with no matching call renders alone with the default view.
- [x] A tool's status is `running`, `done`, `error`, or `incomplete` as the table says, and its badge reads running, failed, incomplete, or nothing.
- [x] Two calls without results in a pending reply both show as running.
- [x] A finished reply's summary names tool steps by their label and counts repeats, as "Searched the web ×2".
- [x] A pending reply's live line says "Searching the web…" while a search runs, and a tool without a view says "Running <tool>…".
- [x] A web search step's row shows "Searched the web" and its query.
- [x] An open web search step lists its results as titles linking to their URLs in a new tab with `rel="noreferrer"`, each with its host and snippet as plain text.
- [x] A web search with more than eight results shows the first seven and a "Show 3 more" button, which shows the rest, moves focus to the first link it showed, and becomes "Show less". One with eight shows them all.
- [x] A web search with no results says "No results."
- [x] A search result with a non-HTTP URL shows its title without a link.
- [x] A running web search says "Searching…".
- [x] A web search falls back to the default view for an error, an output in a blob, and an output that does not parse as its shape.
- [x] A web fetch step's row shows "Read a page" and the URL's host and path, and opens onto the page's title linking to its final URL, its host, and the text read as plain text.
- [x] A web fetch that read part of a longer page says which characters it read of how many.
- [x] A web fetch falls back to the default view as a web search does.
- [x] HTML and Markdown in tool output show as text, and no images load.

## Files

- `apps/web/src/parts/tools/index.ts`: `toolViews` and `toolEntry`
- `apps/web/src/parts/tools/default/index.tsx`: `DefaultToolView`
- `apps/web/src/parts/tools/web-search/index.tsx`: the web search entry and view
- `apps/web/src/parts/tools/web-fetch/index.tsx`: the web fetch entry and view
- `apps/web/src/parts/tools/ui.tsx` and `json.ts`: what the views share
- `apps/web/src/parts/fold.ts`: `useFold`, which folds a list after seven items, shared with the reply's sources
- `apps/web/src/parts/tool-status.ts`: `toolStatus`
- `apps/web/src/parts/links.ts`: `siteOf`, which `SourceView` shares, and `isWebUrl`
- `apps/web/src/parts/types.ts`: `ToolEntry` and `ToolViewProps`
- `apps/web/src/parts/WorkSteps.tsx`: the tool step's row, the live line, and the body from the table
- `apps/web/src/parts/steps.ts`: `stepsSummary` naming steps by their label
- `apps/web/tests/features/conversation/components/MessageView.test.tsx`: the tests
