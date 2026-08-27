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
import { readEnv } from './env.js'
import { createRepos } from './repo/index.js'
import { WsHub } from './ws.js'
import type { SocketLike } from './ws.js'

const env = readEnv(process.env)

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
      console.warn('[server] could not store the gift catalog', error)
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
  console.log(`[server] listening on http://localhost:${env.port}`)
  if (env.databaseUrl === null) {
    console.warn('[server] DATABASE_URL is not set — match results will not be stored')
  }
})
