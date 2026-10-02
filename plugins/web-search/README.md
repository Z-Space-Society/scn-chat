# Web search

Adds a `web_search` tool. Returns a title, URL, and snippet for each result. Every result is cited under the reply.

## Configuration

Add the plugin under **Admin > Plugins** and fill in its options. The API key is stored encrypted.

| Option | Default | Meaning |
|---|---|---|
| `engine` | Required | The site-wide engine. See [Engines](#engines). |
| `apiKey` | | The site-wide engine's key. Required for engines that need one. |
| `baseURL` | | The site-wide SearXNG instance. Required for SearXNG. |
| `adminEngineRoles` | `[user]` | List of roles allowed to use the admin-configured search engine. |
| `enabledByDefault` | `false` | Whether search is on for users who haven't switched it themselves. |
| `userToggle` | `true` | Whether users can switch search on and off in their settings. |
| `userEngines` | `true` | Whether users can pick their own engine and key. Set to `false` to use the site-wide engine for everyone. |
| `maxResults` | `5` | Results per search, from 1 to 20. |

## Engines

| Engine | `engine` | Needs | Notes |
|---|---|---|---|
| Tavily | `tavily` | `apiKey` | Currently offers 1,000 free searches a month. Sign up at [tavily.com](https://tavily.com). |
| Brave | `brave` | `apiKey` | Currently offers $5 credit per month / roughly 1,000 searches. Signup and more information on [Brave Search API](https://brave.com/search/api/). |
| SearXNG | `searxng` | `baseURL` | Free / self-hosted. Instance must allow JSON results: add `json` to `search.formats` in its `settings.yml`. |
| DuckDuckGo | `duckduckgo` | Nothing | Scrapes DuckDuckGo's HTML results, as there's currently no public search API available. |
| Kagi | `kagi` | `apiKey` | Requires an API account. More info on their [API page](https://kagi.com/api). |

## User settings

If `userEngines` is enables end users can configure their own search engine in `Setting => Plugins`:

- **`default`** uses the admin-configured engine.
- **Any other engine** uses the user's own key, or base URL for SearXNG.

## Adding an engine

Add a file under `src/engines/` that builds the request and parses the response, and add it to the list in `src/engines/index.ts`. The option and settings schemas, startup checks, and settings fields all come from that list. Shared code in `src/search.ts` handles sending the request, errors, timeouts, and cleaning up results. See `src/engines/brave.ts` for a small example.
