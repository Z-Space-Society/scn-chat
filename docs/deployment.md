# Deployment

## Requirements

- Docker with the compose plugin.
- A domain with HTTPS.
- A reverse proxy for TLS.
- The lexicons and permission set published.

## Setup

1. Clone the repository on the server.
2. Copy `config.example.yml` to `config.yml` and set at least:
   - `app.publicUrl` to the HTTPS URL, such as `https://chat.example.com`.
   - `auth.scopeMode` to `permission-set`. Production refuses `raw`.
   - Your models and plugins.
3. Copy `.env.example` to `.env`. Both files must exist before compose runs, or Docker creates directories in their place. Generate the secrets with `docker compose run --rm scn-chat pnpm keys`, and put `SECRET_KEY`, `OAUTH_PRIVATE_KEYS`, and any provider keys in `.env`.
4. Start it with `docker compose up -d --build`.
5. Point the reverse proxy at `http://127.0.0.1:3000`.
6. Run `docker compose up -d --build` again.
