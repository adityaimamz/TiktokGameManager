import type { GiftCatalogEntry } from '@lga/shared'

/**
 * `fetchAvailableGifts()` bertipe `any` di library, persis seperti payload event.
 *
 * Semua pembacaan karena itu lewat pembantu yang mengembalikan nilai netral untuk apa pun
 * yang tidak sesuai harapan — satu perubahan minor pada bentuk respons tidak boleh
 * menjatuhkan server, hanya membuat katalognya kosong.
 */
type Raw = Record<string, unknown>

const asRecord = (value: unknown): Raw | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Raw) : null

const str = (value: unknown): string => (typeof value === 'string' ? value : '')

const num = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

/**
 * Ikon gift, dari dua penamaan sekaligus.
 *
 * Katalog REST `gift/list/` memakai `url_list`; `ImageModel` di dalam payload event adalah
 * protobuf yang sudah di-decode, jadi `urlList`. Satu gift yang sama, dua ejaan — dibaca
 * satu fungsi supaya ikon dari kedua sumber tidak bisa berbeda aturannya.
 */
function readIcon(raw: Raw): string | null {
  for (const key of ['image', 'icon']) {
    const image = asRecord(raw[key])
    if (image === null) continue
    for (const listKey of ['url_list', 'urlList']) {
      const list = image[listKey]
      if (!Array.isArray(list)) continue
      const first = list.find((url) => typeof url === 'string' && url.length > 0)
      if (typeof first === 'string') return first
    }
  }
  return null
}

/**
 * Sebuah event gift → satu entri katalog, atau `null` bila ia tidak menyebut gift apa pun.
 *
 * Ada karena `gift/list/` bisa gagal — rate limit tanpa kunci EulerStream, atau room yang
 * menolak dibaca — dan saat itu terjadi katalognya jatuh ke sepuluh entri seed sementara
 * hadiah sungguhan terus berdatangan lengkap dengan nama, harga, dan gambarnya. Data itu
 * sudah ada di tangan; membuangnya berarti daftar pemicu yang lebih miskin dari kenyataan.
 *
 * Koinnya adalah harga SATUAN (`gift.diamondCount`), bukan `giftCoins` milik ChatMessage
 * yang sudah dikali jumlah kiriman — katalog menjawab "berapa harga satu".
 */
export function readGiftFromEvent(payload: unknown): GiftCatalogEntry | null {
  const gift = asRecord(asRecord(payload)?.['gift'])
  if (gift === null) return null
  const name = str(gift['name']).trim()
  if (name === '') return null
  const id = Number(str(gift['id'])) || num(gift['id'])
  return {
    id: Number.isFinite(id) && id !== 0 ? id : null,
    name,
    coins: num(gift['diamondCount']) || num(gift['diamond_count']),
    iconUrl: readIcon(gift),
  }
}

/** Payload connector → katalog. Entri yang tidak punya nama dibuang diam-diam. */
export function readGiftCatalog(payload: unknown): GiftCatalogEntry[] {
  const root = asRecord(payload)
  const list = Array.isArray(payload) ? payload : Array.isArray(root?.['gifts']) ? root['gifts'] : []

  const entries: GiftCatalogEntry[] = []
  for (const item of list as unknown[]) {
    const raw = asRecord(item)
    if (raw === null) continue
    const name = str(raw['name']).trim()
    if (name === '') continue
    const id = num(raw['id'])
    entries.push({
      id: id === 0 ? null : id,
      name,
      coins: num(raw['diamond_count']) || num(raw['diamondCount']),
      iconUrl: readIcon(raw),
    })
  }
  return entries
}
