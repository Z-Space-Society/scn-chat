# Deployment

## Requirements

- Docker with the compose plugin.
- A domain with HTTPS.
- A reverse proxy for TLS.
- The lexicons and permission set published.

## Setup

1. Clone the repository on the server.
2. Copy `.env.example` to `.env`. Generate the secrets with `docker compose run --rm scn-chat pnpm keys`, and set at least:
   - `SECRET_KEY` and `OAUTH_PRIVATE_KEYS`, from `pnpm keys`.
   - `PUBLIC_URL` to the HTTPS URL, such as `https://chat.example.com`.
   - `OAUTH_SCOPE_MODE` to `permission-set`. Use `raw` for local dev.
   - `ADMIN_DIDS` to your admin DID(s), comma separated.
   - `NODE_ENV` to `production` or `development`.
3. Start it with `docker compose up -d --build` (For dev, `pnpm dev`).
4. Point the reverse proxy at `http://127.0.0.1:3000`, if applicable.
5. Sign in and open the admin area, from Settings > Admin. Configure your plugins and models. Note that a model provider plugin will need to be enabled before models can be configured.
6. Set up cron. Issue a key with the `admin` role under Admin > API keys. Then setup cron as so:

   ```
   */5 * * * * curl -fsS -X POST -H "Authorization: Bearer <key>" https://chat.example.com/api/cron
   ```
