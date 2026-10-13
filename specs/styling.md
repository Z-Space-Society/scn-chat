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
- `shiki` for code highlighting, with a CSS variables theme.

### Stylesheets

`src/styles/` holds the global CSS, which `__root.tsx` loads as one `app.css` link:

- `app.css` sets the layer order, then imports Tailwind, the theme, the base layer, and the scoped sheets.
- `theme.css` is the theme: every token, in `@theme`, plus the few plain custom properties that have no Tailwind namespace. It is the only file a forker or designer edits to change the look.
- `base.css` styles the document in `@layer base`: the root font size of 96.875%, line height, font smoothing, body colors, `::selection`, the scrollbar, the `:focus-visible` ring, links, and the `data-theme` rules.

A few styles can't be written as utilities, and live in a sheet beside the component they serve, imported from `app.css`:

- `src/parts/markdown.css` styles the HTML react-markdown builds, under `.markdown`, and the highlighted code inside it.
- A `@utility` for the chat list's scroll-driven top fade, which needs `@property` and `animation-timeline`.
- A `@utility` for animating a `<details>` open through `::details-content`.

Tailwind's Preflight resets every element. No element gets a look globally: a button looks like a button because it is a `Button`, and a field because it comes from the form kit.

### Tokens

`theme.css` clears Tailwind's defaults with `--color-*: initial`, `--text-*: initial`, `--radius-*: initial`, `--shadow-*: initial`, `--ease-*: initial`, `--animate-*: initial`, and `--breakpoint-*: initial`, then defines the app's own. So `bg-red-500` and `text-lg` don't exist, and every color, size, radius, and shadow a component can name comes from the theme. Spacing keeps Tailwind's scale, `--spacing: 0.25rem`.

Every color is `light-dark(<light>, <dark>)` in oklch, so dark mode needs no `dark:` variant. The tokens come from `design-reference`'s theme, renamed into Tailwind's namespaces:

| Kind | Tokens | Utilities |
|---|---|---|
| Surfaces | `chrome`, `panel` (was `--bg`), `sidebar`, `surface`, `sunken`, `card` (was `--group`), `well` (was `--quote-well`), `raised`, `raised-hover`, `lifted`, `bubble`, `hover`, `row-hover`, `row-active`, `row-current`, `row-hover-solid`, `knob`, `illo-face`, `illo-rim`, `illo-back` | `bg-*` |
| Ink | `ink` (was `--text`), `ink-strong` (was `--strong`), `prose`, `muted`, `muted-quiet`, `faint`, `icon-quiet`, `row-ink`, `section-ink`, `tint-quiet` | `text-*` |
| Lines | `line` (was `--border`), `line-strong`, `divider`, `bevel`, `image-edge` | `border-*`, `outline-*` |
| Accent | `accent`, `accent-strong`, `accent-soft`, `accent-soft-hover`, `accent-border`, `accent-mark`, `on-accent`, `focus` (was `--focus-ring`) | any color utility |
| Danger | `danger`, `danger-soft`, `danger-soft-hover`, `danger-border`, `danger-muted` | any color utility |
| Highlight | `highlight`, `highlight-ink` | any color utility |
| Fonts | `--font-ui`, `--font-prose`, `--font-mono`, with `--default-font-family` set to the UI font | `font-*` |
| Type | `--text-caption`, `small`, `ui`, `body`, `heading`, `title`, `display` | `text-*` |
| Radius | `--radius-panel` (was `--radius`), `card`, `small`, `badge`, `row`, `menu`, `bubble`, `composer`, `pill` | `rounded-*` |
| Shadows | `--shadow-float`, `--shadow-lift` | `shadow-*` |
| Motion | `--ease-out`, and `--animate-*` with their `@keyframes`: fade-in, fade-out, panel-in, panel-up, landed, breathe | `ease-*`, `animate-*` |
| Named sizes | `--spacing-sidebar`, `sidebar-pad`, `row`, `bar`, `toggle`, `composer-button`, `gutter`, `card-pad`, `within`, `turn` | `w-*`, `h-*`, `p-*`, `gap-*`, … |
| Widths | `--container-column`, `--container-settings`, `--container-narrow` (34rem) | `max-w-*`, `@max-narrow:` |
| Breakpoint | `--breakpoint-wide: 45rem`, where the sidebar becomes a drawer below | `wide:`, `max-wide:` |

Ink colors are named `ink` because a color named `text` would make `text-text`, and the type scale already owns `text-*`.

Durations, `--menu-pad`, `--menu-edge`, `--rise`, `--wait-quiet`, and `--slow` have no Tailwind namespace. They are plain custom properties on `:root` in `theme.css`, used as `duration-(--dur-panel)`. A token built from others, like `bubble` or `radius-menu`, refers to them with `var()`, which resolves where it is used.

Two tokens change with the device, in `theme.css` below the tokens: `--spacing-gutter` narrows to 1rem below the `wide` breakpoint, and `--input-floor` is 16px on a coarse pointer, so iOS never zooms into a field.

Spacing literals from `design-reference` snap to the nearest quarter step of the scale, a sixteenth of a rem, such as .35rem to `1.5` (.375rem) and .45rem to `1.75` (.4375rem). Sizes the design names, like the sidebar's width or a row's height, stay named sizes.

### Writing styles

- A component's styles are utilities in its own JSX. A reused look is a component in `src/shared/ui/`, not a class or `@apply`.
- Utilities use only theme tokens. A value with no token is a new token in `theme.css`, used through its utility, or as `utility-(--token)` when its kind has no namespace. Arbitrary values like `p-[13px]` or `bg-[#fff]` are not used. Arbitrary variants and layout values that hold no color or length, like `grid-cols-[auto_1fr]`, are fine.
- State is in `data-*` and `aria-*` attributes and styled with their variants, such as `data-[state=done]:` and `aria-expanded:`. A child styled from its parent's state uses `group-*`, `peer-*`, or `in-*`. Tests find elements by role, label, or these attributes, never by class.
- Each animation carries its own `motion-reduce:` override.
- `hover:` already applies only where the device can hover, so no `(hover: hover)` query is written by hand.
- Logical properties (`ps-*`, `me-*`, `start-*`) wherever a side matters, so the layout mirrors for right-to-left text.
- Variants in a component use `cva`, and a component that takes a `className` merges it with `cn()`.

### Shared UI

`src/shared/ui/` holds the components the design reuses: `Button` with its default, primary, danger, and quiet variants, `IconButton`, `Badge`, `Chip`, `Switch`, `Menu`, `Select`, `CopyButton`, and `VisuallyHidden`, and the settings kit of page, group, row, field, `SaveBar`, `ConfirmButton`, and item and link lists. The form kit in `src/shared/form.tsx` renders its fields styled. Floating menus and the select's list open in the top layer through the Popover API, and `usePlacement` positions them.

The primary button is green, since green marks both what is live and the main action.

### Light and dark

- With no choice, the page follows the system: `:root` has `color-scheme: light dark`, and every `light-dark()` token follows it.
- Preferences has an Appearance setting of System, Light, or Dark. It is kept on the device in `localStorage` under `scn-chat:theme`, since a person often wants different modes on different devices, and needs no record.
- Light or Dark sets `data-theme` on `<html>`, which `base.css` turns into `color-scheme: light` or `dark`. System removes it.
- An inline script in the root route's `head` applies the stored choice before the first paint, on server-rendered and client-only routes alike. It ignores a missing or unreadable store.
- `useInstantThemeSwitch` turns transitions off for two frames whenever the scheme changes, from the system or the picker, so colors change at once rather than smearing.
- The logo is an inline SVG component in theme colors, so it follows the page's mode, not the system's. The favicon is a file and follows the system.

### Code highlighting

Fenced code in replies is highlighted by Shiki, loaded lazily by `parts/markdown.tsx` the first time a code block renders, with only the languages a block names. It uses Shiki's CSS variables theme, so the colors are `--color-code-*` tokens in `theme.css`, light and dark like every other color. Until it loads, and for a language it doesn't know, a block shows as plain monospace.

### Porting design-reference

The port re-applies `design-reference` area by area onto main's refactored components, not as a merge, since nearly every web file changed on both sides. Its behavior comes along, refactored to main's conventions: forms on the form kit, data through loaders, and no React Compiler bailouts. Its specs come into the feature specs, corrected where they had fallen behind its code. The plan lists each feature in the order it is ported.

Until the port is done, main's stand-in sheets load in a `legacy` layer, ordered after `base` and before `utilities`. Pages not yet ported keep their look over Preflight, and a ported component's utilities win over them. The legacy layer is deleted once every area is ported.

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
- **The guard.** A test fails when a component carries a raw color or a length in an arbitrary value, so values stay in the theme.

## Acceptance Criteria

- [ ] `pnpm dev` and a production build serve the styled app from `src/styles/app.css`.
- [ ] Tailwind's default palette, type scale, radii, shadows, and breakpoints produce no utilities.
- [ ] Changing a color token in `theme.css` changes it everywhere it is used, in light and dark.
- [ ] Appearance in Preferences switches between System, Light, and Dark at once, and the choice survives a reload with no flash, on server-rendered and client-only routes.
- [ ] The guard test fails on a raw color or arbitrary length in a component.
- [ ] Every area matches `design-reference` in light and dark, at desktop width and at 390px.
- [ ] Animations stop under reduced motion.
- [ ] A fenced code block in a reply is highlighted in theme colors in both modes, and a block in an unknown language shows as plain monospace.
- [ ] No legacy layer or stand-in sheet remains.

## Files

- `apps/web/src/styles/`
- `apps/web/src/shared/ui/`, `apps/web/src/shared/cn.ts`, `apps/web/src/shared/icons.tsx`, `apps/web/src/shared/useInstantThemeSwitch.ts`
- `apps/web/src/parts/markdown.tsx`, `apps/web/src/parts/markdown.css`
- `apps/web/src/routes/__root.tsx`
- `apps/web/src/features/settings/pages/PreferencesSettings.tsx`
- `apps/web/vite.config.ts`, `biome.json`
