import { Router } from 'express'
import { GIFT_SEED } from '@lga/shared'
import type { GiftCatalogEntry } from '@lga/shared'
import { log } from '../log.js'

/**
 * Yang dibutuhkan route dari sumber katalog.
 *
 * Dinyatakan di sini, bukan mengimpor `TikTokConnection`, supaya test route tidak perlu
 * membangun state machine koneksi sungguhan.
 */
export interface GiftCatalogSource {
  readonly giftCatalog: GiftCatalogEntry[]
}

/** Katalog yang pernah disimpan. `null` saat tidak ada database. */
export type StoredGifts = (() => Promise<GiftCatalogEntry[]>) | null

/**
 * Katalog tersimpan + katalog room yang sedang hidup, dengan nama sebagai kuncinya.
 *
 * Yang hidup menang — harga gift bisa berubah — KECUALI untuk ikon: entri yang dipungut
 * dari event gift kerap datang tanpa gambar, dan membiarkannya menimpa berarti ikon
 * menghilang persis saat room-nya tersambung.
 */
export function mergeCatalog(
  stored: readonly GiftCatalogEntry[],
  live: readonly GiftCatalogEntry[],
): GiftCatalogEntry[] {
  const byName = new Map<string, GiftCatalogEntry>()
  for (const entry of stored) byName.set(entry.name.toLowerCase(), entry)
  for (const entry of live) {
    const key = entry.name.toLowerCase()
    const known = byName.get(key)
    byName.set(key, { ...entry, iconUrl: entry.iconUrl ?? known?.iconUrl ?? null })
  }
  return [...byName.values()].sort((a, b) => a.coins - b.coins || a.name.localeCompare(b.name))
}

export function giftRoutes(source: GiftCatalogSource, stored: StoredGifts = null): Router {
  const router = Router()

  // Tidak pernah 500 dan tidak pernah kosong: dropdown kosong di dashboard hanya akan
  // membuat creator mengira aplikasinya rusak. Karena itu kegagalan database ditelan —
  // katalog room yang hidup, atau seed, sudah cukup untuk menyusun rule.
  router.get('/', async (_req, res) => {
    const live = source.giftCatalog
    let saved: GiftCatalogEntry[] = []
    try {
      saved = stored === null ? [] : await stored()
    } catch (error) {
      log('warn', 'could not read the stored gift catalog', { err: error })
    }

    const catalog = mergeCatalog(saved, live)
    res.json(catalog.length > 0 ? catalog : GIFT_SEED)
  })

  return router
}
