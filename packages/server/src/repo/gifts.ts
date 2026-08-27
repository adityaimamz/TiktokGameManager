import { asc, sql } from 'drizzle-orm'
import type { GiftCatalogEntry } from '@lga/shared'
import type { Db } from '../db/client.js'
import { gifts } from '../db/schema.js'

/**
 * Menyimpan katalog room apa adanya, satu `INSERT … ON CONFLICT` untuk seluruh daftar.
 *
 * `iconUrl` dan `tiktokId` yang `null` TIDAK menimpa yang sudah tersimpan: gift yang
 * dipungut dari event kadang datang tanpa gambar, dan kehilangan ikon karena satu event
 * pelit adalah persis regresi yang tabel ini ada untuk mencegahnya — pelajaran yang sama
 * sudah dibayar sekali di `upsertPlayers`.
 */
export async function saveGifts(db: Db, entries: readonly GiftCatalogEntry[]): Promise<number> {
  const rows = dedupeByName(entries)
  if (rows.length === 0) return 0
  await db
    .insert(gifts)
    .values(
      rows.map((entry) => ({
        name: entry.name,
        tiktokId: entry.id,
        coins: entry.coins,
        iconUrl: entry.iconUrl,
        seenAt: new Date(),
      })),
    )
    .onConflictDoUpdate({
      target: gifts.name,
      set: {
        tiktokId: sql`coalesce(excluded.tiktok_id, ${gifts.tiktokId})`,
        coins: sql`greatest(excluded.coins, ${gifts.coins})`,
        iconUrl: sql`coalesce(excluded.icon_url, ${gifts.iconUrl})`,
        seenAt: sql`excluded.seen_at`,
      },
    })
  return rows.length
}

/**
 * Nama kembar dalam SATU batch, digabung dengan aturan yang sama seperti `ON CONFLICT` di atas.
 *
 * Postgres menolak seluruh perintah dengan 21000 bila dua baris yang diusulkan menabrak
 * kunci yang sama — dan `gift/list/` sungguhan memang mengirim nama yang sama lebih dari
 * sekali. Karena pemanggilnya menelan kegagalan, satu duplikat berarti katalog TIDAK PERNAH
 * tersimpan sama sekali, tanpa satu pun tanda di dashboard. Dikunci pada `name` persis,
 * bukan huruf kecil, karena itulah kunci yang ditabrak.
 */
function dedupeByName(entries: readonly GiftCatalogEntry[]): GiftCatalogEntry[] {
  const byName = new Map<string, GiftCatalogEntry>()
  for (const entry of entries) {
    const seen = byName.get(entry.name)
    byName.set(
      entry.name,
      seen === undefined
        ? entry
        : {
            ...entry,
            id: entry.id ?? seen.id,
            coins: Math.max(entry.coins, seen.coins),
            iconUrl: entry.iconUrl ?? seen.iconUrl,
          },
    )
  }
  return [...byName.values()]
}

/** Seluruh gift yang pernah terlihat, termurah lebih dulu — urutan pemilih di dashboard. */
export async function allGifts(db: Db): Promise<GiftCatalogEntry[]> {
  const rows = await db
    .select({
      id: gifts.tiktokId,
      name: gifts.name,
      coins: gifts.coins,
      iconUrl: gifts.iconUrl,
    })
    .from(gifts)
    .orderBy(asc(gifts.coins), asc(gifts.name))
  return rows
}
