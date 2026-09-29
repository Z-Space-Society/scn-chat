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
- Web search and page fetch plugins
- User and admin model configuration

## TODO

- Image generation, as a plugin
- PDF OCR
- Speech to text and text to speech
- E2EE support for chat history
- Memories
- MCP servers as tools
- Browser and push notifications, and an installable PWA
- Move plugin settings and tool switches to the user's PDS, through a generic plugin settings lexicon
- Migrate chats between local storage and spaces, in both directions
- Provider-native tools, such as built-in web search, for the models that support them
- Web search for models without tool calling, by generating queries before the reply
- Web fetch through external services such as Firecrawl or Tavily extract, for pages that need JavaScript
- YouTube transcripts in web fetch

## Getting started

### Requirements:
 - Node 22.18 or newer (Node 24 is recommended)
 - pnpm 10
 - An ATProto account to sign in with.
 - A spaces enabled PDS (currently optional)

### Setup
 1. Install dependencies: `pnpm install`
 2. `cp .env.example .env`
 3. Run `pnpm keys` to generate secret keys. Copy `OAUTH_PRIVATE_KEYS` and `SECRET_KEY` into your `.env`.
 4. Set your AI inference provider API keys.
 5. Copy config.example.yml to config.yml. The defaults are setup for local development.
 6. Configure your supported AI models.

### Start the app

 1. Run `pnpm dev`
 2. Open http://127.0.0.1:5173 and sign in with your ATProto handle.

## Deploying

See [docs/deployment.md](docs/deployment.md).

## Extending

Model providers, tools, file ingesters, and turn hooks are all plugins, so anyone can build their own integration.
See:
 - [docs/architecture.md](docs/architecture.md)
 - [docs/plugins.md](docs/plugins.md)

## License

[MIT](LICENSE)
