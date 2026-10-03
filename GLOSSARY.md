# SCN Chat

An AI assistant chat app where each conversation lives in a permissioned space on the user's own PDS, built to be forked and extended.

## Extension

**Fork**:
A copy of this project that a programmer changes and runs as their own app. The web app is extended by changing a fork's code.
_Avoid_: Web plugin, extension, customization

**Plugin**:
A package an admin installs and lists in the config to add to the server, such as a model provider, a tool, or a turn hook.
_Avoid_: Extension, add-on

**Tool**:
A capability a plugin offers that the model can call during a turn.
_Avoid_: Function, action

**Part view**:
The component that shows one kind of message part, chosen by the part's type.
_Avoid_: Renderer, widget

**Tool view**:
The component that shows one tool's call and result together, chosen by the tool's name.
_Avoid_: Tool UI, tool renderer

**Tool status**:
Where a tool call stands: running, done, error, or incomplete. Derived from the call, its result, and the message.
_Avoid_: Tool state, phase

**Steps**:
A run of consecutive reasoning parts and tool calls in one reply, shown folded together.
_Avoid_: Tool group, chain of thought

**Message action**:
A control under a message, like copy, edit, regenerate, or stop.
_Avoid_: Message button, hover action

## Look

**Theme**:
The design tokens, for light and dark, that set the web app's look. Forkers and the designer edit it, and users only get the system's light or dark mode.
_Avoid_: Skin, style, appearance
