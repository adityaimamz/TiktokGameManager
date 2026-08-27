/**
 * Permukaan minimal yang dibutuhkan dari sebuah koneksi TikTok Live.
 *
 * Interface ini ada supaya `tiktok-live-connector` hanya disentuh satu file adapter.
 * Seluruh logika koneksi diuji lawan implementasi palsu dari interface ini, sehingga
 * tidak ada satu test pun yang butuh live stream sungguhan.
 */
export interface TikTokClient {
  connect(): Promise<{ roomId: string }>
  disconnect(): void
  on(event: string, handler: (payload: unknown) => void): void
  /** Katalog gift room. `unknown` karena library mengetiknya `any`. */
  fetchGifts(): Promise<unknown>
}

export type TikTokClientFactory = (username: string) => TikTokClient
