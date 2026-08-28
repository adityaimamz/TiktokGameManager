import { sql } from 'drizzle-orm'
import { describe } from 'vitest'
import { createDb } from '../../src/db/client.js'
import type { Db } from '../../src/db/client.js'

const trimmed = (name: string): string => (process.env[name] ?? '').trim()

/**
 * `TEST_DATABASE_URL`, dan SENGAJA bukan `DATABASE_URL`.
 *
 * `truncateAll()` di bawah mengosongkan kelima tabel. Selama helper ini membaca
 * `DATABASE_URL`, satu `npm test` — atau `npm run verify` sebelum siaran — menghapus
 * katalog gift dan seluruh riwayat match creator, dan katalog itu HANYA bisa dikumpulkan
 * kembali satu gift per event: `gift/list/` menuntut plan berbayar EulerStream, jadi tidak
 * ada jalan mengisinya sekaligus. Database test karena itu harus disebut namanya sendiri.
 */
const testUrl = trimmed('TEST_DATABASE_URL')

/**
 * `describe` yang melewati dirinya sendiri saat `TEST_DATABASE_URL` kosong.
 *
 * Test repository menyentuh Postgres sungguhan — itu disengaja, karena yang diuji di sini
 * justru perilaku SQL-nya (upsert, transaksi, cascade), yang tidak terbukti apa pun bila
 * dipalsukan. Kontributor tanpa kredensial tetap bisa menjalankan sisa suite.
 */
export const describeDb = testUrl === '' ? describe.skip : describe

/** Database bersih untuk satu file test. Memanggilnya tanpa `TEST_DATABASE_URL` adalah kesalahan. */
export function freshDb(): Db {
  if (testUrl === '') throw new Error('freshDb() called without TEST_DATABASE_URL')
  if (testUrl === trimmed('DATABASE_URL')) {
    throw new Error(
      'TEST_DATABASE_URL points at the same database as DATABASE_URL — truncateAll() would wipe the live gift catalog and match history. Use a separate database or a Neon branch.',
    )
  }
  return createDb(testUrl)
}

/** Mengosongkan seluruh tabel. `cascade` mengurus urutan foreign key. */
export async function truncateAll(db: Db): Promise<void> {
  await db.execute(
    sql`truncate table analytics_events, match_players, matches, players, gifts restart identity cascade`,
  )
}
