import { useCallback, useEffect, useMemo, useState } from 'react'
import { APP_KEY_HEADER, GIFT_SEED } from '@lga/shared'
import type { GiftCatalogEntry } from '@lga/shared'
import { currentAppKey } from '../platform/app-key.js'
import { serverBaseUrl } from '../platform/server-url.js'

/**
 * Katalog gift untuk pemilih di Trigger Builder.
 *
 * Selalu mengembalikan daftar tak kosong: dropdown kosong hanya akan membuat creator
 * mengira aplikasinya rusak, dan `GET /api/gifts` sendiri sudah memakai seed yang sama
 * sebelum pernah tersambung ke room. Satu daftar dengan dua pembaca, bukan dua daftar
 * yang bisa berbeda.
 *
 * Rule menyimpan NAMA, bukan id (§5 spec 5a), jadi katalog yang berubah tidak pernah
 * membatalkan rule yang sudah tersimpan.
 *
 * `roomId` ada supaya katalog diminta ULANG saat sebuah room tersambung. Panel setelan
 * sudah ter-mount jauh sebelum creator menekan Connect, jadi permintaan pertama selalu
 * dijawab seed — tanpa permintaan kedua, katalog room sungguhan tidak pernah terlihat
 * sepanjang siaran. Id-nya sendiri tidak dikirim ke mana pun; ia hanya penanda bahwa
 * jawaban server sudah berbeda.
 */
export function useGiftCatalog(
  fetchImpl: typeof fetch = fetch,
  roomId: string | null = null,
): { catalog: GiftCatalogEntry[]; icons: ReadonlyMap<string, string>; reload: () => void } {
  const [catalog, setCatalog] = useState<GiftCatalogEntry[]>([...GIFT_SEED])
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((value) => value + 1), [])

  useEffect(() => {
    let alive = true
    const key = currentAppKey()
    void fetchImpl(`${serverBaseUrl()}/api/gifts`, {
      headers: key === null ? undefined : { [APP_KEY_HEADER]: key },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: unknown) => {
        if (!alive || !Array.isArray(body) || body.length === 0) return
        setCatalog(body as GiftCatalogEntry[])
      })
      .catch(() => {
        // Katalog room hanya melengkapi; seed sudah cukup untuk menyusun rule.
      })
    return () => {
      alive = false
    }
  }, [fetchImpl, roomId, nonce])

  // Kunci huruf kecil: nama gift di rule diketik creator, sementara katalog memakai ejaan
  // TikTok — `gift/list/` dan payload event pun tidak selalu sepakat soal huruf besar-kecil.
  const icons = useMemo(() => {
    const map = new Map<string, string>()
    for (const gift of catalog) {
      if (gift.iconUrl !== null) map.set(gift.name.toLowerCase(), gift.iconUrl)
    }
    return map
  }, [catalog])

  return { catalog, icons, reload }
}
