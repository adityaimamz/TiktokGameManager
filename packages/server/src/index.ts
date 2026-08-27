import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { OVERLAY_ROLE, WS_PATH, idleStatus } from '@lga/shared'
import { createApp } from './app.js'
import { keyMatches, socketKey, socketRole } from './app-key.js'
import { SignalHub, readClientSignal } from './signal-hub.js'
import type { OverlaySocket } from './signal-hub.js'
import { TikTokConnection } from './chat/connection.js'
import { createTikTokClientFactory } from './chat/tiktok-client.js'
import { createDb } from './db/client.js'
import { appKeyRefusal, readEnv } from './env.js'
import { startHeartbeat } from './heartbeat.js'
import type { PingableSocket } from './heartbeat.js'
import { log } from './log.js'
import { createRepos } from './repo/index.js'
import { probeUploadDir } from './routes/uploads.js'
import { SERVICE_RESTART, shutdown } from './shutdown.js'
import { WsHub } from './ws.js'
import type { SocketLike } from './ws.js'

const env = readEnv(process.env)

// Sebelum apa pun dibangun: proses yang menolak boot lebih baik daripada panel kontrol
// terbuka di alamat publik.
const refusal = appKeyRefusal(env)
if (refusal !== null) {
  log('error', refusal)
  process.exit(1)
}

/**
 * Hub dan koneksi saling membutuhkan: hub perlu membaca status, koneksi perlu menyiarkan.
 *
 * Closure `() => connection?.status` memutus lingkaran itu tanpa setter yang bisa lupa
 * dipanggil. `connection` masih `null` hanya selama beberapa baris di bawah ini, dan
 * belum ada soket yang bisa terhubung selama itu.
 */
let connection: TikTokConnection | null = null
const hub = new WsHub({
  getStatus: () => connection?.status ?? idleStatus(),
  // `overlays` lahir satu baris di bawah. Closure memutus lingkarannya tanpa setter yang
  // bisa lupa dipanggil, dan belum ada soket yang bisa terhubung selama satu baris itu.
  getOverlays: () => overlays.size,
})
const overlays = new SignalHub({ onCount: (count) => hub.broadcastOverlays(count) })

const repos = env.databaseUrl === null ? null : createRepos(createDb(env.databaseUrl))

connection = new TikTokConnection({
  createClient: createTikTokClientFactory({ apiKey: env.eulerApiKey }),
  now: () => Date.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (handle) => clearTimeout(handle as NodeJS.Timeout),
  onStatus: (status) => hub.broadcastStatus(status),
  onMessage: (message) => hub.broadcastChat(message),
  // Ditelan kalau gagal: katalog yang tidak tersimpan tidak boleh menjatuhkan siaran.
  onGifts: (entries) => {
    void repos?.saveGifts(entries).catch((error: unknown) => {
      log('warn', 'could not store the gift catalog', { err: error })
    })
  },
})

const server = createServer(
  createApp({
    connection,
    gifts: connection,
    repos,
    uploadDir: env.uploadDir,
    corsOrigin: env.corsOrigin,
    clientDist: env.clientDist,
    appKey: env.appKey,
    port: env.port,
  }),
)
const wss = new WebSocketServer({ server, path: WS_PATH })

/**
 * Satu heartbeat untuk KEDUA jenis soket.
 *
 * `wss.clients` memuat dashboard dan overlay sekaligus, dan keduanya sama-sama bisa
 * menggantung. Soket yang di-`terminate` menerbitkan `close`, dan `close`-lah yang membuat
 * `hub.remove` / `overlays.remove` berjalan seperti biasa — jadi tidak ada pembukuan kedua
 * yang harus dijaga sinkron di sini.
 */
const stopHeartbeat = startHeartbeat({
  sockets: () => wss.clients as unknown as Iterable<PingableSocket>,
})

wss.on('connection', (socket, request) => {
  if (env.appKey !== null && !keyMatches(env.appKey, socketKey(request.url))) {
    // 1008 = policy violation. Ditutup dengan alasan, bukan digantung tanpa penjelasan.
    socket.close(1008, 'unauthorized')
    return
  }

  if (socketRole(request.url) === OVERLAY_ROLE) {
    const overlay = socket as unknown as OverlaySocket
    overlays.add(overlay)
    socket.on('close', () => overlays.remove(overlay))
    return
  }

  const like = socket as unknown as SocketLike
  hub.add(like)
  // Satu-satunya jalur naik yang ada: dashboard → server → tiap overlay, tanpa diubah.
  socket.on('message', (data, isBinary) => {
    if (isBinary) {
      overlays.relaySnapshot(data as Buffer)
      return
    }
    const signal = readClientSignal(data.toString())
    if (signal !== null) overlays.relaySignal(signal.topic, signal.payload)
  })
  socket.on('close', () => hub.remove(like))
})

server.listen(env.port, () => {
  log('info', 'listening', { port: env.port })
  if (env.databaseUrl === null) {
    log('warn', 'DATABASE_URL is not set — match results will not be stored')
  }
  void probeUploadDir(env.uploadDir).then((problem) => {
    if (problem !== null) {
      log('warn', 'upload dir is not writable — uploaded backgrounds and music will fail', {
        dir: env.uploadDir,
        err: problem,
      })
    }
  })
})

/** Dep yang sama untuk ketiga jalan keluar — bedanya hanya kode keluarnya. */
const shutdownWith = (code: number): void => {
  shutdown({
    stopHeartbeat,
    closeSockets: () => {
      for (const socket of wss.clients) socket.close(SERVICE_RESTART, 'restarting')
    },
    closeServer: (done) => server.close(() => done()),
    exit: (exitCode) => process.exit(exitCode),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (handle) => clearTimeout(handle as NodeJS.Timeout),
    code,
  })
}

process.on('SIGTERM', () => {
  log('info', 'SIGTERM received, shutting down')
  shutdownWith(0)
})

process.on('uncaughtException', (error) => {
  // Keluar, bukan lanjut: state proses sudah tidak diketahui, dan host me-restart dalam
  // dua detik. Melanjutkan berarti siaran berjalan di atas sesuatu yang tidak dipahami.
  log('error', 'uncaught exception — exiting for a clean restart', { err: error })
  shutdownWith(1)
})

process.on('unhandledRejection', (reason) => {
  // TIDAK keluar, dan itu disengaja: sebagian besar rejection di sini berasal dari
  // `void repos?.…catch()` yang memang dirancang untuk ditelan. Menjatuhkan siaran karena
  // satu insert gagal menukar kerugian kecil dengan kerugian total (P9).
  log('warn', 'unhandled rejection', { err: reason })
})
