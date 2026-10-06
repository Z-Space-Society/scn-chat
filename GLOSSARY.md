# SCN Chat

An AI assistant chat app where each conversation lives in a permissioned space on the user's own PDS, built to be forked and extended.

## Extension

**Fork**:
A copy of this project that a programmer changes and runs as their own app. The web app is extended by changing a fork's code.
_Avoid_: Web plugin, extension, customization

**Plugin**:
A package installed with the server that adds to it, such as a model provider, a tool, or a turn hook.
_Avoid_: Extension, add-on

**Plugin instance**:
One plugin an admin has added in the admin area, with its own options. A plugin is added once, unless it allows several instances.
_Avoid_: Plugin config, plugin entry

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

## Access

**Role**:
A named group of users, held through explicit membership, a matching PDS host or handle domain, or a plugin's answer. Roles decide invites and admin models.
_Avoid_: Group, permission

**Viewer**:
A signed-in user without access to the chat app, who can only open chats shared with them.
_Avoid_: Guest, read-only user

## Turns

**Fallback model**:
The model a turn runs with when it names none: the model of the nearest completed reply up the branch, else the user's default model, else the admin's.
_Avoid_: Default model (that is the user's preference), inherited model

## Look

**Theme**:
The design tokens, for light and dark, that set the web app's look. Forkers and the designer edit it, and users only get the system's light or dark mode.
_Avoid_: Skin, style, appearance
