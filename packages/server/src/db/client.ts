import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema.js'

export type Db = ReturnType<typeof createDb>

/**
 * Koneksi Postgres berbasis `pg`, bukan driver HTTP Neon.
 *
 * Alasannya mengikat: driver HTTP tidak mendukung transaksi, sedangkan penulisan hasil
 * match harus atomik — upsert player, insert match, insert match_players, dan eviction
 * berhasil bersama atau gagal bersama. Connection string Neon bekerja apa adanya di sini.
 */
export function createDb(url: string) {
  const pool = new pg.Pool({ connectionString: url })
  return drizzle(pool, { schema })
}
