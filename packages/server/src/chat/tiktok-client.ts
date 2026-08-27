import { TikTokLiveConnection } from 'tiktok-live-connector'
import type { TikTokClient, TikTokClientFactory } from './client.js'

export interface TikTokClientFactoryOptions {
  /**
   * Kunci EulerStream untuk penandatanganan request.
   *
   * Opsional: free tier jalan tanpa kunci, hanya dengan rate limit. Kegagalan karena
   * rate limit muncul sebagai `error` di ConnectionStatus seperti kegagalan lain —
   * creator melihat alasannya, bukan diam.
   */
  apiKey?: string | undefined
}

/**
 * Satu-satunya file di repo ini yang mengimpor `tiktok-live-connector`.
 *
 * Ia sengaja tidak punya cabang dan sengaja tidak di-unit-test: seluruh logika koneksi
 * ada di `connection.ts`, yang diuji lawan `TikTokClient` palsu. Yang tersisa di sini
 * hanyalah penerjemahan nama method, dan itu diverifikasi oleh smoke manual terhadap
 * live sungguhan — satu-satunya cara yang benar-benar membuktikan library dipakai benar.
 */
export function createTikTokClientFactory(
  opts: TikTokClientFactoryOptions = {},
): TikTokClientFactory {
  return (username: string): TikTokClient => {
    const connection = new TikTokLiveConnection(
      username,
      opts.apiKey === undefined ? {} : { signApiKey: opts.apiKey },
    )

    return {
      async connect() {
        const state = await connection.connect()
        return { roomId: state.roomId }
      },
      disconnect() {
        // `disconnect()` milik library mengembalikan Promise<void>. Ia dibiarkan tidak
        // di-`await` dengan sengaja — TikTokClient.disconnect() sendiri sinkron — tapi
        // rejection-nya tetap ditangkap di sini supaya kegagalan menutup socket tidak
        // pernah jadi unhandled rejection yang bisa menjatuhkan proses Node.
        void Promise.resolve(connection.disconnect()).catch(() => {})
      },
      on(event, handler) {
        connection.on(event as never, handler as never)
      },
      fetchGifts() {
        return connection.fetchAvailableGifts()
      },
    }
  }
}
