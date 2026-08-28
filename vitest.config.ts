import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Populates process.env from .env with Node's built-in loader (no dotenv dependency needed).
// Repo-touching tests (packages/server/tests/repo/*) need a real DATABASE_URL; contributors
// without one just don't have a .env file, and those suites self-skip via describeDb.
try {
  process.loadEnvFile()
} catch {
  // No .env present — fine, DB-backed suites skip themselves.
}

export default defineConfig({
  plugins: [react()],
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/**/tests/**/*.test.ts', 'packages/**/tests/**/*.test.tsx'],
    // Repo tests share one real Neon database and truncate the same tables in beforeEach;
    // running test files in parallel races them against each other (wrong counts, even
    // deadlocks). Fase 1 has few enough test files that running sequentially costs little.
    fileParallelism: false,
  },
})
