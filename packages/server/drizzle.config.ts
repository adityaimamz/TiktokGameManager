import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  // Paths are resolved against the process cwd, not this file's directory — drizzle-kit
  // globs them with `glob.sync` as given. The root `db:generate` script runs from repo
  // root, so these must be root-relative, not `./src/...` as if cwd were this package.
  schema: './packages/server/src/db/schema.ts',
  out: './packages/server/src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env['DATABASE_URL'] ?? '' },
})
