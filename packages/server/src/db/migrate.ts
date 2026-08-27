import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { createDb } from './client.js'
import { readEnv } from '../env.js'

const env = readEnv(process.env)
if (env.databaseUrl === null) {
  console.error('DATABASE_URL is not set — nothing to migrate. Fill it in .env first.')
  process.exit(1)
}

const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url))
await migrate(createDb(env.databaseUrl), { migrationsFolder })
console.log('[db] migrations applied')
process.exit(0)
