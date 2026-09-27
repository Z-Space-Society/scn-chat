import type { Generated } from 'kysely'

/** Every table in the app database. */
export type Database = {
  plugin_user_settings: {
    did: string
    plugin_id: string
    values_json: string
    secrets_encrypted: string | null
    updated_at: string
  }
  account: {
    did: string
    handle: string | null
    pds_url: string
    storage_mode: 'space' | 'local'
    background_sync: number
    created_at: string
    last_login_at: string
    last_active_at: string
  }
  web_session: { token_hash: string; did: string; created_at: string; expires_at: string }
  oauth_state: { key: string; value: string; updated_at: string }
  oauth_session: { key: string; value: string; updated_at: string }
  local_space: { uri: string; owner_did: string; type: string; skey: string; created_at: string }
  local_record: {
    space_uri: string
    collection: string
    rkey: string
    value_json: string
    cid: string
    updated_at: string
  }
  local_op: {
    seq: Generated<number>
    space_uri: string
    collection: string
    rkey: string
    cid: string | null
    value_json: string | null
    created_at: string
  }
  sync_state: {
    space_uri: string
    owner_did: string
    last_rev: string | null
    registered_until: string | null
    last_synced_at: string | null
    last_error: string | null
  }
  provider_credential: {
    id: string
    owner_did: string
    provider_id: string
    name: string | null
    slug: string | null
    base_url: string | null
    api_key_encrypted: string
    key_hint: string
    models_json: string
    created_at: string
    updated_at: string
  }
  turn_request: {
    conversation_uri: string
    message_rkey: string
    attempt: number
    owner_did: string
    requested_at: string
  }
  turn_claim: {
    conversation_uri: string
    reply_rkey: string
    owner_did: string
    claimed_at: string
  }
}
