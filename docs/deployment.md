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
   - `ADMIN_DIDS` to your admin DID(s), comma separated.
   - `NODE_ENV` to `production`.

   Leave `OAUTH_SCOPE_MODE` unset, so it defaults to `permission-set`. `raw` is only for testing the local fallback before the lexicons are published, and production refuses it.
3. Start it with `docker compose up -d --build`. For development, run `pnpm dev`, or `pnpm preview` to try the production build on your own machine.
4. Point the reverse proxy at `http://127.0.0.1:3000`, if applicable. A deployment's port never moves, so the server fails to start if the port is taken.
5. Sign in and open the admin area, from Settings > Admin. Configure your plugins and models. Note that a model provider plugin will need to be enabled before models can be configured.
6. Set up cron. Issue a key with the `admin` role under Admin > API keys. Then setup cron as so:

   ```
   */5 * * * * curl -fsS -X POST -H "Authorization: Bearer <key>" https://chat.example.com/api/cron
   ```

## Config import/export

All admin settings can be exported and imported via the CLI.

1. Export the configuration:

   ```
   docker compose exec -T scn-chat node apps/server/src/site-config-cli.ts export > site-config.json
   ```

   The JSON file contains all admin settings, roles, plugins, and admin models. Secrets are not exported.

2. Import the config:

   ```
   docker compose exec -T scn-chat node apps/server/src/site-config-cli.ts apply < site-config.json
   ```

   Changes take effect without a restart. If the import includes setting changes that will prevent the server from starting, the script will bail. Broken plugin settings that don't affect startup will still be imported with a warning.


Applying the config is a full reset so any admin config that wasn't in the initial export will be cleared.

- Secrets missing from the file are ignored / left unchanged on the server. To clear a secret, set it to `null`, such as `"secrets": { "tavilyApiKey": null }`.
- A role in the JSON that leaves `members` unset will keep its members.
- Plugin packages need to be added to `package.json` to be available in the site.

For Ansible, template the file from your variables and Vault and apply it:

```yaml
- name: Apply the SCN Chat configuration
  ansible.builtin.shell: >
    docker compose exec -T scn-chat node apps/server/src/site-config-cli.ts apply < site-config.json
  args:
    chdir: /srv/scn-chat
  register: site_config
  changed_when: site_config.stdout != 'No changes.'
```
