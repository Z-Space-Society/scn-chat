# Extending

## Summary

SCN Chat is extended by forking it and changing its code. This spec makes the web app easy to change that way, following what other AI chat apps converged on.

- **Tables of views.** One table of part views and one of tool views, with a fallback, so showing a tool's output differently means one component and one line. Runs of tool calls and reasoning fold into one collapsible group. The tool views, their status, and the views for web search and web fetch are their own spec, [[tool-views]].
- **Message actions.** A keyed list of actions, so a fork adds an action without editing the conversation's JSX. It gains Copy.
- **Markdown seam.** One file holds the Markdown components and plugin lists, and code blocks gain a copy button.
- **Smaller components.** The two largest components are split.
- **Forker guide.** `docs/extending.md` has a recipe for each common change.

Server plugins are unchanged.

Porting `design-reference` in the styling phase brought part of this in already: the `partViews` table, the steps group as `StepsView`, the keyed `messageActions` list with Copy, Copy on code blocks, the Markdown seam, now on Streamdown as ADR 0005 records, and the settings sections split one file each. What remains is the tool views, which [[tool-views]] describes, saying why a copy failed, splitting `ConversationView` the rest of the way, and the forker guide.

## Motivation

The people extending this project are programmers in their own fork, as ADR 0002 records. They need code they can find their way around and change safely, not a plugin API. Most of the web app is already plain components and hooks, but a few places make common changes harder than they should be:

- **Parts.** Every message part is drawn by one `switch` in `MessageView`. A fork that adds a server tool, which is the most common extension, has to edit that switch to show the tool's output as anything but JSON.
- **Tool calls.** A tool's call and its result are separate parts, shown as two unrelated `<details>`. The result names only the call's ID, so a view of a tool's output cannot tell which tool produced it. Nothing says whether a tool is still running, finished, or failed.
- **Message actions.** They are inline JSX in `ConversationView`, so adding one means editing that file. Copying a message, which every chat app offers, is missing.
- **Markdown.** Its setup is private to `MessageView`, so adding code highlighting, math, or diagrams means finding it there.
- **Large files.** `ConversationView` mixes the header, the message actions, and the composer wiring, and `SettingsPage` holds every settings section in one file of about 500 lines.
- **No guide.** Nothing tells a forker where things are or how a change usually goes.

A survey of Open WebUI, LibreChat, LobeHub, Vercel's ai-chatbot, and assistant-ui, in October 2026, found the same answers in most of them:

- a table, or an if-chain standing in for one, from part type and tool name to a component, with a generic fallback
- each tool call shown with its result as one row
- one derived status per tool call, which LibreChat added after its labels and icons drifted apart
- consecutive tool calls and reasoning folded into one collapsed group
- a map of Markdown node names to components
- message actions as a keyed list in LobeHub
- copy buttons on code blocks and messages everywhere

## Design

### Part views

`apps/web/src/parts/` holds the components that show message parts, `parts/index.ts` holds the part table, and `parts/tools/index.ts` the tool table:

```ts
/** The view for each kind of part, by the part's `$type` fragment, like `textPart`. */
export const partViews: Record<string, PartView> = {
  textPart: TextView,
  imagePart: ImageView,
  filePart: FileView,
  sourcePart: SourceView,
}

/** The view for each tool's call and result, by tool name, as [[tool-views]] describes. */
export const toolViews: Record<string, ToolEntry> = {
  web_search: webSearch,
  web_fetch: webFetch,
}

/** The view that folds a run of tool calls and reasoning into one group. */
export const StepsView: StepsView = Steps
```

- **Part views** get `{ part, record, blobUrl }`: the part as stored, the message record it belongs to, and the function that builds a blob's URL. A part's type comes from its lexicon, in its JSON form.
- **Tool views**, their entries, the default view, and the tool status are [[tool-views]].
- **Unknown kinds.** A part kind with no view is skipped, as now, so records written by newer clients still show what this one understands.
- **What stays in `MessageView`.** It keeps the message's layout: the header and sibling controls, the `pending` slot for a pending reply's stream, the list of source links at the end, the status lines, and the actions. Only drawing parts moves into the tables.

### Steps

The styling phase brought `StepsView` over from the design: `parts/WorkSteps.tsx`, with the grouping in `parts/steps.ts`, shows every run of reasoning and tool parts as numbered steps, and reasoning has no part view of its own. [[tool-views]] gives it `toolStatus` and the tool views. A run of two or more consecutive steps, where a step is a reasoning part or a tool call with its result, is shown inside `StepsView`. It renders a collapsed `<details>` whose summary counts the steps and says whether any tool is running, with each step's own view inside. A single step is shown on its own. The group is one replaceable component, so the designer or a fork can change how runs look without touching `MessageView`.

### Message actions

`components/message-actions.tsx` holds a keyed list of the actions shown under a message:

```ts
export const messageActions: MessageAction[] = [copy, edit, regenerate, stop]
```

An action is `{ id, Action }`. `Action` is a component that gets the message's `rkey` and record, and the conversation's operations: start an edit, regenerate with a model, stop a reply, and the model list. It renders its control, or nothing when it does not apply to that message. `ConversationView` renders the list in order for each message. The existing actions keep their behavior:

- Edit is on user messages.
- Stop is on pending replies.
- Regenerate, with its model select, is on finished replies.

Copy is new. It is on every message that is not pending, copies the message's text with the clipboard API, and says "Copied" briefly or shows why copying failed. The shared view shows no actions, as now.

### Markdown

`parts/markdown.tsx` holds the Markdown renderer and its configuration as the seam for changing it:

- Streamdown renders it, as ADR 0005 explains, with its CJK and math plugins and the default rehype plugins less rehype-raw.
- `markdownComponents` maps Markdown node names to components, every one of ours:
  - Links open in a new tab, and a link still being written reads as its text.
  - Images load only on click.
  - Code blocks are highlighted, with a Copy button that copies the block's text.

Adding diagrams is a Streamdown plugin, such as `@streamdown/mermaid`, and possibly a component in this one file. The guide shows the recipe. Highlighting and math came with the styling phase, since their colors belong to the theme.

### Component boundaries

- `ConversationView` keeps the branch, the stream overlay, and the message list. The title, rename, sync, and share controls move to `ConversationHeader`, and the actions move to `message-actions.tsx`.
- `pages/SettingsPage.tsx` becomes `features/settings/pages/`, with `SettingsLayout.tsx` for the sidebar and one file per section: `PreferencesSettings.tsx`, `ApiKeySettings.tsx`, `PluginSettings.tsx`, and `SyncSettings.tsx`. The routes import from there.
- Apart from the actions above, these are moves. Behavior, markup, and labels stay the same, so the existing tests pass with only their imports changed.

### The forker guide

`docs/extending.md` is written for a programmer who has just forked the project. It starts with a map of the web app:

- the route tree, and which routes render on the server
- where server data and chat data come from
- the store

Then it gives one recipe per common change, each naming the files to touch with a short example:

- **Show a tool's output differently:** add a folder under `parts/tools/` and a line in `toolViews`, reading the call's status, as [[tool-views]] describes.
- **Add an action to messages:** add a component and an entry in `messageActions`.
- **Render more in Markdown**, such as diagrams: add a Streamdown plugin to the plugins in `parts/markdown.tsx`, loading it the first time a text needs it, as math does.
- **Add a page:** add a route file under `src/routes/`.
- **Add a control to the composer.**
- **Add a settings section:** a route file, a section component in `features/settings/pages/`, a query in `features/settings/queries.ts`, and an entry in `sections` in `features/settings/pages/SettingsLayout.tsx` for the sidebar link.
- **Add an admin section:** the same, under `routes/_app/admin/` and `features/admin/`, with a server route under `/api/admin`.
- **Read or write new server data:** a Hono route, its type in `api-types.ts`, a query factory in the feature's `queries.ts`, and a mutation.
- **Add a server tool:** a plugin, as `docs/plugins.md` describes, then its tool view.
- **Change the look:** the theme's design tokens, as the styling spec lays them out.

It ends with the rules a fork should keep, linking the ADRs:

- the PDS is the source of truth
- the server keeps no chat content
- Hono is the only API
- nothing third-party loads in the browser

`docs/plugins.md` gains a line pointing tool authors to tool views, and `docs/architecture.md` links the guide.

## Scope Boundaries

- No plugin API for the web app, no registration from packages, and no slots. Forkers change the code.
- No new look. Styling, the theme's tokens, code highlighting colors, and dark mode are the styling spec, which is done.
- No changes to the server, the lexicons, or server plugins.
- No artifacts panel, tool approval, inline citation markers, or responses from several models side by side. The server supports none of them yet, and sources carry no position in the text.
- No keyed list for composer controls. The composer has three, and they stay JSX.

## Edge Cases and Decisions

- **Steps.** A lone step is not wrapped in a group, so a single tool call reads the same as before.
- **Keys and tables.** Part views are keyed by the `$type` fragment, like `textPart`, so they read the same as the lexicon. The tables and the action list are plain objects and arrays in one file each, not registries with registration functions, since the only people adding to them are editing this code.
- **Copy.** It copies the message's text parts, as Markdown for replies, and not its tool output or attachments.
- **Header operations.** `ConversationHeader` holds the controls and the rename form, and `ConversationView` keeps the rename and sync mutations and passes them in, as it does the operations message actions get. Their errors therefore stay in the conversation's one alert with stop and regenerate, where the action that ran last wins.

## Acceptance Criteria

- [x] Each existing part type renders as before, through `partViews`.
- [x] A part kind with no view renders nothing.
- [ ] Two or more consecutive steps render inside one collapsed group that counts them and says when a tool is running. A single step renders alone.
- [x] Message actions render from `messageActions` in order, and edit, regenerate, and stop behave as before.
- [ ] Copy on a finished message puts its text on the clipboard and confirms it, or shows why it failed.
- [x] Code blocks in replies have a Copy button that copies the block's text.
- [x] The Markdown components are exported from `parts/markdown.tsx`, which holds the renderer's plugins, every element our own.
- [ ] `ConversationView` and the settings sections are split as described, and the existing tests pass with only their imports changed.
- [ ] `docs/extending.md` has the map and every recipe above, and every file it names exists.

## Files

- `apps/web/src/parts/`
- `apps/web/src/features/conversation/components/MessageView.tsx`, `ConversationView.tsx`, `ConversationHeader.tsx`, `message-actions.tsx`
- `apps/web/src/features/settings/pages/`
- `docs/extending.md`, `docs/plugins.md`, `docs/architecture.md`
