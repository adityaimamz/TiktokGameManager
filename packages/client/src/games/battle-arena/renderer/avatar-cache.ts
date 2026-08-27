/**
 * URL avatar → ImageBitmap, dengan fallback lingkaran berinisial (§9.1).
 *
 * Renderer tidak boleh menunggu apa pun, jadi get() selalu menjawab seketika dan
 * pemuatan berjalan di latar. URL yang gagal ditandai gagal permanen — tanpa itu,
 * satu avatar mati berarti satu permintaan jaringan per frame.
 */

export type AvatarImage =
  | { kind: 'bitmap'; bitmap: ImageBitmap }
  | { kind: 'initial'; letter: string }

export type AvatarLoader = (url: string) => Promise<ImageBitmap>

export interface AvatarCacheOptions {
  load?: AvatarLoader
  /** Batas entri sebelum yang paling lama tak dipakai dibuang. */
  maxEntries?: number
  onError?: (url: string, error: unknown) => void
}

type Entry = { state: 'loading' } | { state: 'ready'; bitmap: ImageBitmap } | { state: 'failed' }

const defaultLoader: AvatarLoader = async (url) => {
  const response = await fetch(url)
  return createImageBitmap(await response.blob())
}

export function initialFor(username: string): string {
  const match = /\p{L}|\p{N}/u.exec(username)
  return (match?.[0] ?? '?').toUpperCase()
}

export class AvatarCache {
  private readonly entries = new Map<string, Entry>()
  private readonly loader: AvatarLoader
  private readonly maxEntries: number
  private readonly onError: (url: string, error: unknown) => void

  constructor(opts: AvatarCacheOptions = {}) {
    this.loader = opts.load ?? defaultLoader
    this.maxEntries = opts.maxEntries ?? 300
    this.onError = opts.onError ?? (() => {})
  }

  get size(): number {
    return this.entries.size
  }

  get pendingCount(): number {
    let pending = 0
    for (const entry of this.entries.values()) if (entry.state === 'loading') pending++
    return pending
  }

  get(url: string | null, username: string): AvatarImage {
    const fallback: AvatarImage = { kind: 'initial', letter: initialFor(username) }
    if (url === null || url.trim().length === 0) return fallback

    const existing = this.entries.get(url)
    if (existing !== undefined) {
      // Map JavaScript mempertahankan urutan sisip: hapus lalu sisipkan lagi supaya
      // entri yang barusan dipakai berpindah ke ujung terbaru.
      this.entries.delete(url)
      this.entries.set(url, existing)
      return existing.state === 'ready' ? { kind: 'bitmap', bitmap: existing.bitmap } : fallback
    }

    this.entries.set(url, { state: 'loading' })
    this.evictIfNeeded()
    void this.loader(url).then(
      (bitmap) => {
        if (this.entries.has(url)) this.entries.set(url, { state: 'ready', bitmap })
        else bitmap.close?.()
      },
      (error: unknown) => {
        if (this.entries.has(url)) this.entries.set(url, { state: 'failed' })
        this.onError(url, error)
      },
    )
    return fallback
  }

  clear(): void {
    for (const entry of this.entries.values()) {
      if (entry.state === 'ready') entry.bitmap.close?.()
    }
    this.entries.clear()
  }

  private evictIfNeeded(): void {
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next()
      if (oldest.done === true) return
      const entry = this.entries.get(oldest.value)
      if (entry?.state === 'ready') entry.bitmap.close?.()
      this.entries.delete(oldest.value)
    }
  }
}
