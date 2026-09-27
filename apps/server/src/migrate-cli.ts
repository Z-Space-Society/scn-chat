import { existsSync } from 'node:fs'
import { DEFAULT_DATABASE_URL } from './config.ts'
import { createDb } from './db/index.ts'
import { migrateToLatest } from './db/migrate.ts'

if (existsSync('.env')) process.loadEnvFile('.env')
else if (existsSync('../../.env')) process.loadEnvFile('../../.env')

const db = createDb(process.env.DATABASE_URL || DEFAULT_DATABASE_URL)
const { applied } = await migrateToLatest(db)
console.log(applied.length > 0 ? `Applied: ${applied.join(', ')}` : 'No pending migrations')
await db.destroy()
