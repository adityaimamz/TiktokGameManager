export const DEFAULT_PORT = 3001

/**
 * Panjang minimum kunci yang layak dibagikan lewat URL.
 *
 * Kunci overlay OBS tinggal di URL selamanya (keputusan Plan 9 §7), jadi kunci pendek di
 * sana setara tidak ada kunci sama sekali.
 */
export const MIN_APP_KEY_LENGTH = 24

export interface ServerEnv {
  port: number
  /** `null` berarti jalan tanpa database: route database menjawab 503, game tetap jalan. */
  databaseUrl: string | null
  eulerApiKey: string | undefined
  /** Tempat gambar latar yang diunggah creator disimpan. */
  uploadDir: string
  /** `undefined` = tanpa header CORS: halaman dan API satu origin (dev, atau server yang ikut menyajikan halaman). */
  corsOrigin: string | undefined
  /** Hasil build client yang ikut disajikan. Default `packages/client/dist` relatif cwd. */
  clientDist: string
  /** `null` berarti semua terbuka — dev lokal. Diisi berarti `/api` dan `/ws` menuntut kunci. */
  appKey: string | null
  /**
   * Satu-satunya cara berjalan tanpa kunci di luar localhost.
   *
   * Namanya sengaja tidak enak dibaca, dan sengaja BUKAN tebakan atas `NODE_ENV` maupun
   * `RAILWAY_*`: penjaga yang menebak nama variabel milik satu host akan diam-diam mati di
   * host berikutnya yang menamainya lain.
   */
  allowOpenAccess: boolean
}

/**
 * Environment sebagai parameter, bukan `process.env` yang dibaca langsung.
 *
 * Itu yang membuat setiap cabang fallback di sini bisa diuji tanpa mengotori environment
 * proses test.
 */
export function readEnv(source: NodeJS.ProcessEnv): ServerEnv {
  const port = Number.parseInt(source['PORT'] ?? '', 10)
  const databaseUrl = (source['DATABASE_URL'] ?? '').trim()
  const eulerApiKey = (source['EULER_API_KEY'] ?? '').trim()
  const uploadDir = (source['UPLOAD_DIR'] ?? '').trim()
  const corsOrigin = (source['CORS_ORIGIN'] ?? '').trim()
  const clientDist = (source['CLIENT_DIST'] ?? '').trim()
  const appKey = (source['APP_KEY'] ?? '').trim()
  const allowOpenAccess = (source['ALLOW_OPEN_ACCESS'] ?? '').trim()

  return {
    port: Number.isInteger(port) && port > 0 ? port : DEFAULT_PORT,
    databaseUrl: databaseUrl === '' ? null : databaseUrl,
    eulerApiKey: eulerApiKey === '' ? undefined : eulerApiKey,
    uploadDir: uploadDir === '' ? './uploads' : uploadDir,
    corsOrigin: corsOrigin === '' ? undefined : corsOrigin,
    clientDist: clientDist === '' ? 'packages/client/dist' : clientDist,
    appKey: appKey === '' ? null : appKey,
    allowOpenAccess: allowOpenAccess === '1',
  }
}

/**
 * Alasan menolak boot, atau `null` kalau boleh jalan.
 *
 * Mengembalikan pesan alih-alih memanggil `process.exit` — itu satu-satunya cara mengujinya
 * tanpa menjatuhkan proses test, dan pola yang sama dengan `readEnv` yang menerima
 * environment sebagai parameter.
 */
export function appKeyRefusal(env: ServerEnv): string | null {
  if (env.appKey === null) {
    if (env.allowOpenAccess) return null
    return (
      `APP_KEY is empty and this build refuses to boot open. ` +
      `Set APP_KEY to ${MIN_APP_KEY_LENGTH}+ random characters, ` +
      `or set ALLOW_OPEN_ACCESS=1 if you really mean to run with no key (local dev).`
    )
  }
  if (env.appKey.length < MIN_APP_KEY_LENGTH) {
    // Diperiksa juga saat ALLOW_OPEN_ACCESS menyala: kunci setengah hati memberi rasa aman
    // tanpa keamanannya, dan itu lebih buruk daripada tidak memasang kunci sama sekali.
    return `APP_KEY is only ${env.appKey.length} characters. Use at least ${MIN_APP_KEY_LENGTH}.`
  }
  return null
}
