import type { SqlDb } from './sql.ts'

/** Bump when the schema changes. A mismatch rebuilds the database from the server. */
export const SCHEMA_VERSION = 2

const TABLES = ['conversation', 'message', 'info', 'meta', 'message_fts', 'conversation_fts']

const FTS_OPTIONS = "tokenize = 'unicode61 remove_diacritics 2', prefix = '2 3'"

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
    createSearchIndex(db)
    db.run("insert into meta (key, value) values ('schema_version', ?)", [String(SCHEMA_VERSION)])
  })
}

/** Full-text tables for search, kept in step with `message` and `conversation` by triggers. */
function createSearchIndex(db: SqlDb): void {
  db.run(`create virtual table message_fts using fts5(
    text, conversation_skey unindexed, author_did unindexed, rkey unindexed, ${FTS_OPTIONS})`)
  db.run(`create trigger message_fts_insert after insert on message begin
    insert into message_fts (text, conversation_skey, author_did, rkey)
    values (new.text, new.conversation_skey, new.author_did, new.rkey);
  end`)
  db.run(`create trigger message_fts_update after update of text on message
    when old.text is not new.text begin
    update message_fts set text = new.text
    where conversation_skey = old.conversation_skey and author_did = old.author_did and rkey = old.rkey;
  end`)
  db.run(`create trigger message_fts_delete after delete on message begin
    delete from message_fts
    where conversation_skey = old.conversation_skey and author_did = old.author_did and rkey = old.rkey;
  end`)
  db.run(`create virtual table conversation_fts using fts5(title, skey unindexed, ${FTS_OPTIONS})`)
  db.run(`create trigger conversation_fts_insert after insert on conversation begin
    insert into conversation_fts (title, skey) values (coalesce(new.title, ''), new.skey);
  end`)
  db.run(`create trigger conversation_fts_update after update of title on conversation
    when old.title is not new.title begin
    update conversation_fts set title = coalesce(new.title, '') where skey = old.skey;
  end`)
  db.run(`create trigger conversation_fts_delete after delete on conversation begin
    delete from conversation_fts where skey = old.skey;
  end`)
}

function hasTable(db: SqlDb, name: string): boolean {
  return (
    db.all("select name from sqlite_master where type = 'table' and name = ?", [name]).length > 0
  )
}
