# Shared Computer Network AI Assistant Chat

SCN Chat is an ATProto AI assistant chat interface allowing users to use their spaces capable PDS to host their chat history.

> **Status:** early development. atproto spaces are in alpha, so expect breaking changes and do not store anything sensitive.

## How it works

- **Every chat is its own space.** Each conversation lives in a permissioned space on the user's PDS.
- **Sharing uses the space's read policy.** A chat can be shared read-only with specific people, or made public to anyone with an atproto account.
- **Your PDS is the API.** Any client can hold a conversation by writing records directly to the PDS. See [lexicons/README.md](lexicons/README.md) for the conventions.
- **Bring your own keys.** Users can add API keys for any provider, admins can configure models for everyone. Any OpenAI-compatible endpoint is supported.
- **No spaces yet?** Due to the alpha nature of permissioned spaces, the first phase of this app supports storing chats in the app's own database. Users still need an atproto account to sign in.

## Features

Phase 1:

- One-on-one chat with streaming replies
- Read-only sharing
- Image attachments for vision models
- PDF text extraction
- Automatic chat titles
- Chat history search
- User and admin model configuration

Future:

- Web search and URL fetch, as plugins
- Image generation, as a plugin
- PDF OCR
- Speech to text and text to speech
- E2EE support for chat history
- Memories
- MCP servers as tools
- Browser and push notifications, and an installable PWA

## Extending

Model providers, tools, file ingesters, and turn hooks are all plugins, so anyone can build their own integration.

## License

[MIT](LICENSE)
