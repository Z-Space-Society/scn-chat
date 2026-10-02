# SCN Chat

An AI assistant chat app where each conversation lives in a permissioned space on the user's own PDS, built to be forked and extended.

## Extension

**Plugin**:
A package that extends the server, the web app, or both, with one ID across both halves. Admins enable server halves in the config; forkers build web halves into their fork.
_Avoid_: Extension, add-on, UI plugin, web extension

**Tool**:
A capability a plugin offers that the model can call during a turn.
_Avoid_: Function, action

**Renderer**:
A component from a plugin's web half that shows one kind of message part, such as a particular tool's call and result, in place of the default display.
_Avoid_: Tool UI, widget

**Slot**:
A fixed place in the web app, such as the composer or a message's actions, where plugins' web halves add controls.
_Avoid_: Extension point, hook (hooks are server-side)

**Override**:
A forker's replacement for one of the web app's core components. Overrides are code in a fork, never part of a theme.
_Avoid_: Custom component, theme component

## Look

**Theme**:
A set of design tokens that sets the look of the web app. A fork ships themes, and users can import their own. A theme is data, never code.
_Avoid_: Skin, style, appearance
