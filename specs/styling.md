# Styling

## Summary

The web app's look comes from one theme file of design tokens, and each component styles itself with Tailwind utilities that use only those tokens. The default look is the design built on the `design-reference` branch, ported onto main's components along with the behavior that design added. Light and dark follow the system, and a picker in Preferences can fix one on a device. Code blocks in replies are highlighted in the theme's colors.

## Motivation

Phase 1 of the web rebuild left a plain app over a stand-in stylesheet, so the look could come later without undoing earlier choices. The design was then worked out on `design-reference`, in one global stylesheet of about 5,400 lines over the components as they were before the refactor. That sheet works, but it doesn't scale for a project meant to be forked:

- **Styles live far from what they style.** About 800 rules target components through descendant selectors on bare elements, so changing a component means finding its rules in a long file, and a rule for one page can reach another.
- **The base layer fights the components.** Every `<button>` is a card and every submit is green, so most component rules start by undoing that.
- **Tokens stop at color.** Colors and type sizes are tokens, but spacing is 72 distinct literals and no gap uses a token, so a theme can't change the rhythm.
- **There is no way to choose light or dark.** The colors follow the system alone.

Tailwind keeps a component's styles in its markup, so a forker changes a component in one file. A theme that clears Tailwind's built-in palette and scales makes the tokens the only values utilities can use, so changing the theme file changes the whole app.

## Design

### Stack

- Tailwind CSS v4 through `@tailwindcss/vite`, in `apps/web/vite.config.ts`. The dev server builds Vite from that config, so it needs no change.
- `class-variance-authority` for components with variants, and `cn()` in `src/shared/cn.ts`, which is `clsx` with `tailwind-merge` configured to know the theme's custom size, radius, and shadow names.
- `lucide-react` for the icons the app doesn't draw itself, through `src/shared/icons.tsx`.
- `streamdown` for replies' Markdown, with `@streamdown/code` for Shiki highlighting through a CSS variables theme, `@streamdown/math` for KaTeX, and `@streamdown/cjk`, as ADR 0005 explains.

### Stylesheets

`src/styles/` holds the global CSS, which `__root.tsx` loads as one `app.css` link:

- `app.css` sets the layer order, then imports Tailwind, the theme, the base layer, and the scoped sheets.
- `theme.css` is the theme: every token, in `@theme`, plus the few plain custom properties that have no Tailwind namespace. It is the only file a forker or designer edits to change the look.
- `base.css` styles the document in `@layer base`: the root font size of 96.875%, line height, font smoothing, body colors, `::selection`, controls whose words never select, the scrollbar, the `:focus-visible` ring, links, a search field's clear button, and the `data-theme` rules.

A few styles can't be written as utilities, and live in a sheet beside the component they serve, imported from `app.css`:

- `src/parts/markdown.css` styles the HTML Streamdown builds, under `.markdown`, and the highlighted code inside it. KaTeX's own sheet is imported after it, in the components layer, so Preflight doesn't reset it.
- `src/shared/ui/scroll-fade.css`, the `scroll-fade` utility for a list that scrolls between parts that stay put, like the chat list, whose top fade needs `@property` and `animation-timeline`.
- A `@utility` for animating a `<details>` open through `::details-content`.

Tailwind's Preflight resets every element. No element gets a look globally: a button looks like a button because it is a `Button`, and a field because it comes from the form kit.

### Tokens

`theme.css` clears Tailwind's defaults with `--color-*: initial`, `--text-*: initial`, `--radius-*: initial`, `--shadow-*: initial`, `--ease-*: initial`, `--animate-*: initial`, and `--breakpoint-*: initial`, then defines the app's own. So `bg-red-500` and `text-lg` don't exist, and every color, size, radius, and shadow a component can name comes from the theme. Spacing keeps Tailwind's scale, `--spacing: 0.25rem`.

Every color is `light-dark(<light>, <dark>)` in oklch, so dark mode needs no `dark:` variant. The tokens come from `design-reference`'s theme, renamed into Tailwind's namespaces:

| Kind | Tokens | Utilities |
|---|---|---|
| Surfaces | `chrome`, `panel` (was `--bg`), `sidebar`, `surface`, `sunken`, `card` (was `--group`), `well` (was `--quote-well`), `raised`, `raised-hover`, `lifted`, `bubble`, `hover`, `row-hover`, `row-active`, `row-current`, `row-hover-solid`, `knob`, `illo-face`, `illo-rim`, `illo-back`, `logo-face`, `logo-rim` | `bg-*`, `fill-*` |
| Ink | `ink` (was `--text`), `ink-strong` (was `--strong`), `prose`, `muted`, `muted-quiet`, `faint`, `icon-quiet`, `row-ink`, `section-ink`, `tint-quiet` | `text-*` |
| Lines | `line` (was `--border`), `line-strong`, `divider`, `bevel`, `image-edge` | `border-*`, `outline-*` |
| Accent | `accent`, `accent-strong`, `accent-soft`, `accent-soft-hover`, `accent-border`, `accent-mark`, `on-accent`, `focus` (was `--focus-ring`) | any color utility |
| Danger | `danger`, `danger-soft`, `danger-soft-hover`, `danger-border`, `danger-muted` | any color utility |
| Highlight | `highlight`, `highlight-ink` | any color utility |
| Code | `code-background`, `code-foreground`, `code-token-*` | Shiki's CSS variables theme, through `parts/highlight.ts` |
| Fonts | `--font-ui`, `--font-prose`, `--font-mono`, with `--default-font-family` set to the UI font | `font-*` |
| Type | `--text-caption`, `small`, `ui`, `body`, `heading`, `title`, `display` | `text-*` |
| Radius | `--radius-panel` (was `--radius`), `card`, `small`, `badge`, `row`, `menu`, `bubble`, `composer`, with Tailwind's own `rounded-full` for pills | `rounded-*` |
| Shadows | `--shadow-float`, `--shadow-lift` | `shadow-*` |
| Motion | `--ease-out`, `--ease-slide` for the sidebar, and `--animate-*` with their `@keyframes`: fade-in, fade-out, panel-in, panel-up, landed, breathe for live work, skeleton for content on its way, and spin for a busy control | `ease-*`, `animate-*` |
| Named sizes | `--spacing-icon`, `sidebar`, `sidebar-pad`, `row`, `bar`, `toggle`, `composer-button`, `gutter`, `card-pad`, `within`, `turn` | `size-*`, `w-*`, `h-*`, `p-*`, `gap-*`, … |
| Widths | `--container-column`, `--container-settings`, `--container-narrow` (34rem) | `max-w-*`, `@max-narrow:` |
| Breakpoint | `--breakpoint-wide: 45rem`, where the sidebar becomes a drawer below | `wide:`, `max-wide:` |

Ink colors are named `ink` because a color named `text` would make `text-text`, and the type scale already owns `text-*`.

Durations, `--menu-pad`, `--menu-edge`, `--rise`, `--wait-quiet`, `--slow`, and the icon strokes `--icon-stroke` and `--icon-stroke-control` have no Tailwind namespace. They are plain custom properties on `:root` in `theme.css`, used as `duration-(--dur-panel)`. A token built from others, like `bubble` or `radius-menu`, refers to them with `var()`, which resolves where it is used.

Two tokens change with the device, in `theme.css` below the tokens: `--spacing-gutter` narrows to 1rem below the `wide` breakpoint, and `--input-floor` is 16px on a coarse pointer, so iOS never zooms into a field.

Spacing literals from `design-reference` snap to the nearest quarter step of the scale, a sixteenth of a rem, such as .35rem to `1.5` (.375rem) and .45rem to `1.75` (.4375rem). Sizes the design names, like the sidebar's width or a row's height, stay named sizes.

### Writing styles

- A component's styles are utilities in its own JSX. A reused look is a component in `src/shared/ui/`, not a class or `@apply`.
- Utilities use only theme tokens. A value with no token is a new token in `theme.css`, used through its utility, or as `utility-(--token)` when its kind has no namespace. Arbitrary values like `p-[13px]` or `bg-[#fff]` are not used. Arbitrary variants and layout values that hold no color or length, like `grid-cols-[auto_1fr]`, are fine.
- State is in `data-*` and `aria-*` attributes and styled with their variants, such as `data-[state=done]:` and `aria-expanded:`. A child styled from its parent's state uses `group-*`, `peer-*`, or `in-*`. Tests find elements by role, label, or these attributes, never by class.
- Each animation carries its own `motion-reduce:` override.
- Content on its way shows a skeleton in its own shape, built from `Skeleton` and `SkeletonText` inside `Loading`, never the words "Loading…". `breathe` stays for live work, such as a reply streaming or a chat syncing. A control busy with what it was asked to do takes `busy`, which keeps its label and turns a spinner before it.
- `hover:` already applies only where the device can hover, so no `(hover: hover)` query is written by hand. What hover reveals shows from the start under the `touch:` variant, for devices that can't hover.
- Logical properties (`ps-*`, `me-*`, `start-*`) wherever a side matters, so the layout mirrors for right-to-left text.
- Variants in a component use `cva`, and a component that takes a `className` merges it with `cn()`.

### Shared UI

`src/shared/ui/` holds the components the design reuses:

- `Button.tsx`: `Button`, whose tone is default, primary, danger, or quiet, and which is primary when it submits a form, since green marks both what is live and the main action. A `busy` button is disabled and turns a spinner before its label, a little stronger than a disabled one. `IconButton` is a quiet button with only an icon, red for something that can't be undone. The `button` variants also style a link that acts as a button.
- `Badge.tsx`: `Badge` for status, green, red, or grey, and `Chip` and `Chips` for short values.
- `ToggleChip.tsx`: a small button that stays pressed while what it names is on, for several on/off choices in one row, such as what a model can do, where switches would crowd it. Pressed, it turns green and gains a check, and it carries `aria-pressed`.
- `Checklist.tsx`: `Checklist`, a card's grid of checkboxes that scrolls when long, and `ChecklistItem`, such as the models a provider lists to tick.
- `controls.tsx`: the `field` look of text fields, selects, and textareas, `Switch`, and `Radio`. The switch stays a checkbox to the browser and screen readers, and the switch and radio draw their knob and dot as elements beside the input, so every browser can show them.
- `Select.tsx`: the select-only combobox from `design-reference`, its list rendered into the body and placed by `usePlacement` in `src/shared/`. A portal rather than the Popover API keeps it testable in jsdom. It scrolls the active option into view only when the active option changes, since the list re-renders as it scrolls, and scrolling back then would keep a long list from reaching its end. With `searchLabel`, a list of eight options or more, about as many as it shows before it scrolls, starts with a search box named by it that takes the focus, and only the options under it scroll. On a touch screen the box waits for a tap instead, since its keyboard would cover the list, and the list moves to stay in the part of the window the reader can see while the keyboard comes and goes. Typing narrows the options to those holding every word typed, in any case, in their label or `keywords`, says "No matches" through a status that is there from the start, and moves to the first that matches. An option's id comes from its place among every option, so the active id changes with each move and screen readers follow it. The arrow keys, Page Up, Page Down, and Enter work from the box, while Home, End, and Space stay the field's. Escape closes the list and Tab moves on, each from the button, which takes the focus back, as it does after a pick, and a letter typed on the closed button opens the list searching for it.
- `menu.ts`: the look of floating menus and panels and of the rows in them, shared by the select's list and the app's menus.
- `PanelCard.tsx`: `PanelCard`, a floating panel of controls under its title, such as a chat's sharing or instructions, and `panelForm`, the class for a form around one, which lays out no box of its own so the card takes no room in the row it opens from.
- `CopyButton.tsx`: Copy, as words or as an icon that cross-fades to a check.
- `ItemList.tsx`: lists in a card, each `Item` with an `ItemMark`, its `ItemNames` over a line of details, and its actions, and `LinkItem`, a row that opens a page.
- `SettingsPage.tsx`: the settings and admin kit of `SettingsPage`, `SettingsGroup`, `SettingRow`, `Field` and the `fields` grid, `Choices` and `Choice`, `SaveBar`, `ConfirmButton`, `SettingsEmpty`, and `Callout`. A settings page is a size container, so its rows stack when its column is narrow, beside the nav as well as on a phone.
- `Logo.tsx`: the logo.
- `Skeleton.tsx`: `Skeleton`, a pulsing shape in `--color-skeleton`, `SkeletonText`, a line as tall as the text around it, and `Loading`, which reads its skeletons out once as loading and fades them in only after `--wait-quiet`, so a quick load never flashes them. A route's pending page shows its skeletons at once, since the router already holds it back for the same 400ms (`defaultPendingMs`) and keeps it at least 300ms (`defaultPendingMinMs`), and so does a page the server sends. Data a route needs is read with `useSuspenseQuery` after its loader starts it, so the route's pending page and error page cover it. `useQuery` with its `isLoading` or `isPending` is kept for what loads inside a page that has already shown: the browser store's reads, which wait on this tab holding the store, the models, which never hold up sending, and optional data such as the profile. The settings kit has `SettingsPageSkeleton` and `SettingRowSkeleton`, and `ItemList.tsx` has `ItemRowsSkeleton`.

The form kit in `src/shared/form.tsx` gives its text, textarea, and select fields the `field` look, binds a boolean to a `SwitchField`, and submits with `Button`. `ErrorAlert` is red, and the router's `RouteError` and `RoutePending` use the kit. `RoutePending` is a settings page's skeleton, since only settings and admin pages load before they show.

### Light and dark

- With no choice, the page follows the system: `:root` has `color-scheme: light dark`, and every `light-dark()` token follows it.
- Preferences has an Appearance setting of System, Light, or Dark. It is kept on the device in `localStorage` under `scn-chat:theme`, since a person often wants different modes on different devices, and needs no record.
- Light or Dark sets `data-theme` on `<html>`, which `base.css` turns into `color-scheme: light` or `dark`. System removes it.
- An inline script in the root route's `head` applies the stored choice before the first paint, on server-rendered and client-only routes alike. It ignores a missing or unreadable store.
- `useInstantThemeSwitch` turns transitions off for two frames whenever the scheme changes, from the system or the picker, so colors change at once rather than smearing.
- The logo is an inline SVG component in theme colors, so it follows the page's mode, not the system's. The favicon is a file and follows the system.

### Code highlighting

Fenced code in replies is highlighted by Shiki through `@streamdown/code`, loaded from `parts/highlight.ts` the first time a code block renders, with only the grammars the blocks name. It uses Shiki's CSS variables theme with the `--color-code-` prefix, so the colors are tokens in `theme.css`: a background and foreground, and a color for each kind of token, such as `--color-code-token-keyword`, light and dark like every other color, each clearing 4.5:1 on the block. Terminal colors map onto the same tokens. Until it loads, and for a language it doesn't know, a block shows as plain monospace, and a block still streaming highlights as it grows.

### Porting design-reference

The port re-applies `design-reference` area by area onto main's refactored components, not as a merge, since nearly every web file changed on both sides. Its behavior comes along, refactored to main's conventions: forms on the form kit, data through loaders, and no React Compiler bailouts. Its specs come into the feature specs, corrected where they had fallen behind its code. The plan lists each feature in the order it is ported.

The port is done. Main's stand-in sheets, the `legacy` layer they loaded in, and the `data-ported` markers that kept them out of ported areas are gone, so every element's look is its own utilities over the theme.

## Scope Boundaries

- No runtime themes beyond light and dark, and no themes loaded from outside the app.
- No component library. The app's components are its own, on Tailwind.
- No change to what the specs for each feature describe, beyond the behavior ported from `design-reference`.
- The table of part and tool views, and the forker guide, stay in the extending spec.

## Edge Cases and Decisions

- **Snapped spacing.** Snapping to a sixteenth of a rem moves no size by more than half a pixel at the 15.5px root, and spacing becomes a token a theme can change.
- **No `dark:` variant.** With `light-dark()` in every token, a component never needs to know the mode. The picker only sets `color-scheme`.
- **Picker on the device.** The setting is kept per device rather than in the preferences record, so it applies before the first paint without waiting for the PDS, and it can differ between devices.
- **Components over `@apply`.** A reused look is a component, so it can take variants and carry its markup and accessibility along with its look.
- **The guard.** A test fails when a component carries a raw color or a length in an arbitrary value, or a stylesheet other than the theme carries a raw color, so values stay in the theme. Biome's `noTailwindArbitraryValue` was too broad, since it also rejects layout values like `grid-cols-[auto_1fr]`. Biome's `useSortedClasses` keeps class lists in one order, in `className` and in `cn`, `cva`, and `clsx` calls.
- **Icons.** `src/shared/icons.tsx` wraps the app's own puffy icons and Lucide's in one component each, sized by `size-icon` and stroked in screen pixels through `vector-effect: non-scaling-stroke`, heavier inside a button or link. An icon takes a `className` for its size or color where it is used.

## Acceptance Criteria

- [x] `pnpm dev` and a production build serve the styled app from `src/styles/app.css`.
- [x] Tailwind's default palette, type scale, radii, shadows, and breakpoints produce no utilities.
- [x] A select's long list can be scrolled to its end without jumping back to the active option.
- [x] Changing a color token in `theme.css` changes it everywhere it is used, in light and dark.
- [x] Appearance in Preferences switches between System, Light, and Dark at once, and the choice survives a reload with no flash, on server-rendered and client-only routes.
- [x] The guard test fails on a raw color or arbitrary length in a component.
- [x] Every area matches `design-reference` in light and dark, at desktop width and at 390px.
- [x] Animations stop under reduced motion.
- [x] A fenced code block in a reply is highlighted in theme colors in both modes, and a block in an unknown language shows as plain monospace.
- [x] No legacy layer or stand-in sheet remains.

## Files

- `apps/web/src/styles/`
- `apps/web/src/shared/ui/`, `apps/web/src/shared/cn.ts`, `apps/web/src/shared/icons.tsx`, `apps/web/src/shared/theme.ts`, `apps/web/src/shared/useInstantThemeSwitch.ts`, `apps/web/src/logo.svg`
- `apps/web/tests/styles/theme.test.ts`, `apps/web/tests/shared/theme.test.tsx`
- `apps/web/src/parts/markdown.tsx`, `apps/web/src/parts/markdown.css`
- `apps/web/src/routes/__root.tsx`
- `apps/web/src/features/settings/pages/PreferencesSettings.tsx`
- `apps/web/vite.config.ts`, `biome.json`
