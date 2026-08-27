export const DEFAULT_PORT = 3001

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

  return {
    port: Number.isInteger(port) && port > 0 ? port : DEFAULT_PORT,
    databaseUrl: databaseUrl === '' ? null : databaseUrl,
    eulerApiKey: eulerApiKey === '' ? undefined : eulerApiKey,
    uploadDir: uploadDir === '' ? './uploads' : uploadDir,
    corsOrigin: corsOrigin === '' ? undefined : corsOrigin,
    clientDist: clientDist === '' ? 'packages/client/dist' : clientDist,
    appKey: appKey === '' ? null : appKey,
  }
}
