import type { SqlDb } from './sql.ts'

/** Bump when the schema changes. A mismatch rebuilds the database from the server. */
export const SCHEMA_VERSION = 1

const TABLES = ['conversation', 'message', 'info', 'meta']

export function ensureSchema(db: SqlDb): void {
  const version = hasTable(db, 'meta')
    ? db.all<{ value: string }>("select value from meta where key = 'schema_version'")[0]?.value
    : undefined
  if (version === String(SCHEMA_VERSION)) return
  db.transaction(() => {
    for (const table of TABLES) db.run(`drop table if exists ${table}`)
    db.run(`create table conversation (
      skey text primary key, uri text not null, title text, tags_json text not null default '[]',
      updated_at text not null, ref_cid text, rev text, fetched_at text)`)
    db.run(`create table message (
      conversation_skey text not null, author_did text not null, rkey text not null, role text, parent text,
      status text, record_json text not null, text text not null default '', cid text not null, created_at text,
      primary key (conversation_skey, author_did, rkey))`)
    db.run(
      'create table info (conversation_skey text primary key, record_json text not null, cid text not null)',
    )
    db.run('create table meta (key text primary key, value text not null)')
    db.run("insert into meta (key, value) values ('schema_version', ?)", [String(SCHEMA_VERSION)])
  })
}

function hasTable(db: SqlDb, name: string): boolean {
  return (
    db.all("select name from sqlite_master where type = 'table' and name = ?", [name]).length > 0
  )
}
