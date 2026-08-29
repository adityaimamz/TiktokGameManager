import { eq } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { appConfig } from '../db/schema.js'

/** Default lintas device untuk satu kunci, atau `null` bila belum pernah ditulis. */
export async function getDefaultConfig(db: Db, key: string): Promise<unknown | null> {
  const rows = await db
    .select({ value: appConfig.value })
    .from(appConfig)
    .where(eq(appConfig.key, key))
    .limit(1)
  return rows.length === 0 ? null : rows[0]!.value
}

/**
 * Menulis default bersama untuk satu kunci — `ON CONFLICT DO UPDATE`, sinkron terus-menerus.
 *
 * Device manapun yang mengedit langsung jadi default baru untuk semua device lain. Tidak ada
 * "pemenang" selain yang terakhir menulis; ini bukan CRDT, dan tidak butuh jadi satu — satu
 * creator, satu config, edit terakhir menang persis seperti localStorage tunggal yang sekarang
 * diperluas lintas device.
 */
export async function setDefaultConfig(db: Db, key: string, value: unknown): Promise<void> {
  await db
    .insert(appConfig)
    .values({ key, value })
    .onConflictDoUpdate({ target: appConfig.key, set: { value, updatedAt: new Date() } })
}
