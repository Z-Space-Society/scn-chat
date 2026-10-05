# SCN member registry

Gives every active member of the Shared Computer Network a role (and removes it when a member is deactivated on SCN).

## Configuration

Add the plugin under **Admin > Plugins** and fill in its options. The token is stored encrypted.

| Option | Default | Meaning |
|---|---|---|
| `url` | `https://view.sharedcomputer.network` | The HappyView instance running the registry. |
| `token` | Required | A members token from the registry. See [Getting a token](#getting-a-token). |
| `role` | `scn-member` | The role given to members. Create it on the Roles page first. |
| `pollMinutes` | `5` | Minutes between checks, from 1 to 35,000. |

## Letting only members in

1. Create the `scn-member` role on the Roles page.
2. Add this plugin with the token.
3. On the Access page, set registration to `invite` with `scn-member` as an invite role.
4. Limit admin models, and the admin's web search engine, to `scn-member`.
