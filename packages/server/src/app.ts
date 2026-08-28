import { resolve } from 'node:path'
import express, { Router } from 'express'
import type { ErrorRequestHandler, Express, RequestHandler } from 'express'
import { keyMatches, requestKey } from './app-key.js'
import { DEFAULT_PORT } from './env.js'
import { lanUrls } from './lan-urls.js'
import { log } from './log.js'
import { analyticsRoutes } from './routes/analytics.js'
import { chatRoutes } from './routes/chat.js'
import type { ChatConnection } from './routes/chat.js'
import { giftRoutes } from './routes/gifts.js'
import type { GiftCatalogSource } from './routes/gifts.js'
import { matchRoutes } from './routes/matches.js'
import { playerRoutes } from './routes/players.js'
import { uploadRoutes } from './routes/uploads.js'
import type { Repos } from './repo/types.js'

export interface AppDeps {
  connection: ChatConnection
  /** Sumber katalog gift — koneksi yang sama, dilihat lewat kontrak yang lebih sempit. */
  gifts: GiftCatalogSource
  /** `null` saat DATABASE_URL kosong — route database menjawab 503, sisanya tetap jalan. */
  repos: Repos | null
  /** Default './uploads' — test yang tidak peduli upload tidak perlu menyebutkannya. */
  uploadDir?: string
  /**
   * Origin halaman, saat halaman TIDAK satu origin dengan server — deploy statis
   * (Vercel) memisahkan keduanya. Sengaja satu origin persis, bukan `*`: API ini tanpa
   * auth, dan `POST /api/chat/connect` milik siapa pun yang bisa memanggilnya.
   */
  corsOrigin?: string
  /**
   * Hasil `npm run build` client. Diisi berarti server ini juga yang menyajikan halaman —
   * satu origin, satu deployment, dan `corsOrigin` tidak diperlukan sama sekali.
   *
   * `undefined` di test dan di dev, tempat Vite yang menyajikan halaman.
   */
  clientDist?: string
  /**
   * Kunci yang menjaga `/api` dan `/ws`. `null`/`undefined` = terbuka, persis dev lokal.
   *
   * Halaman statis sengaja TIDAK dijaga: dashboard harus bisa dimuat untuk menampilkan
   * kolom "masukkan kunci".
   */
  appKey?: string | null
  /** Port yang didengarkan server, dipakai membangun `lanUrls`. Default `DEFAULT_PORT`. */
  port?: number
}

/**
 * Menolak dengan alasan yang bisa ditindaklanjuti, bukan melempar.
 *
 * Tanpa database, game masih sepenuhnya bisa dimainkan; yang hilang hanya statistik
 * lintas sesi. Menjatuhkan server karena itu akan menukar kehilangan kecil dengan
 * kehilangan total (P9).
 */
const requireDb: RequestHandler = (_req, res) => {
  res.status(503).json({ error: 'no database configured — set DATABASE_URL in .env' })
}

/**
 * Menerjemahkan kegagalan database menjadi sesuatu yang bisa ditindaklanjuti.
 *
 * `42P01` adalah kode Postgres untuk "relasi tidak ada", dan penyebabnya hampir selalu
 * satu: migrasi belum dijalankan. Menyebut perintahnya di sini menghemat pencarian yang
 * tidak perlu (§10 spec). Kegagalan lain sengaja tidak membocorkan detailnya.
 *
 * Dipasang HANYA di router database (lihat `createApp`), bukan di seluruh app: sebuah
 * rejection dari `/api/chat` — yang punya kontrak error sendiri — tidak boleh mendarat
 * di sini dan dilabeli "database request failed" begitu saja.
 */
const databaseErrors: ErrorRequestHandler = (error, _req, res, _next) => {
  const code = (error as { code?: unknown } | null)?.code
  log('error', 'database request failed', { err: error })
  if (code === '42P01') {
    res.status(500).json({ error: 'database tables are missing — run npm run db:migrate' })
    return
  }
  res.status(500).json({ error: 'database request failed' })
}

/**
 * Express app murni — tidak pernah memanggil `listen`.
 *
 * Bootstrap yang membuka port hidup di `index.ts`, sehingga test tidak pernah
 * merebut port dan tidak pernah menggantung menunggu server ditutup.
 */
export function createApp(deps: AppDeps): Express {
  const app = express()
  app.use(express.json({ limit: '1mb' }))

  const corsOrigin = deps.corsOrigin
  if (corsOrigin !== undefined) {
    app.use((req, res, next) => {
      res.setHeader('access-control-allow-origin', corsOrigin)
      res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS')
      res.setHeader('access-control-allow-headers', 'content-type')
      if (req.method === 'OPTIONS') {
        res.sendStatus(204)
        return
      }
      next()
    })
  }

  const appKey = deps.appKey ?? null
  if (appKey !== null) {
    app.use('/api', (req, res, next) => {
      // Health probe tetap terbuka: host deploy memanggilnya tanpa kunci, dan menutupnya
      // berarti deployment ditandai tidak sehat selamanya.
      if (req.path === '/health') {
        next()
        return
      }
      if (!keyMatches(appKey, requestKey(req))) {
        res.status(401).json({ error: 'unauthorized' })
        return
      }
      next()
    })
  }

  app.get('/api/health', (_req, res) => {
    // `lanUrls` di sini, bukan di endpoint sendiri: probe host deploy adalah satu-satunya
    // permintaan yang dijamin terbuka tanpa kunci, dan dashboard sudah memanggilnya.
    res.json({ ok: true, lanUrls: lanUrls(deps.port ?? DEFAULT_PORT) })
  })

  const repos = deps.repos

  app.use('/api/chat', chatRoutes(deps.connection))
  // Katalog tersimpan menambal apa yang hilang saat koneksi ditutup: tanpanya dashboard
  // jatuh ke seed, dan seluruh ikon gift menghilang begitu creator disconnect.
  app.use('/api/gifts', giftRoutes(deps.gifts, repos === null ? null : () => repos.allGifts()))
  app.use('/api/uploads', uploadRoutes(deps.uploadDir ?? './uploads'))

  if (repos === null) {
    app.use('/api/matches', requireDb)
    app.use('/api/players', requireDb)
    app.use('/api/analytics', requireDb)
  } else {
    // Router terpisah, bukan tiga app.use() langsung: itu yang membuat databaseErrors
    // bisa dipasang sesudah ketiganya tanpa ikut menangkap rejection dari /api/chat.
    const db = Router()
    db.use('/matches', matchRoutes(repos))
    db.use('/players', playerRoutes(repos))
    db.use('/analytics', analyticsRoutes(repos))
    db.use(databaseErrors)
    app.use('/api', db)
  }

  // Dipasang SESUDAH seluruh /api, termasuk 404-nya: request /api yang tidak dikenal harus
  // dijawab JSON, bukan dijatuhkan ke halaman.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not found' })
  })

  if (deps.clientDist !== undefined) {
    const dist = deps.clientDist
    app.use(express.static(dist))
    // `/overlay` adalah SATU-SATUNYA path halaman selain root, dan tidak ada berkas di
    // sana — `express.static` menjawabnya 404 kalau baris ini tidak ada. Bukan fallback
    // SPA menyeluruh: URL salah ketik tetap 404, bukan diam-diam memuat dashboard.
    // Dev server Vite melayaninya sendiri lewat fallback SPA bawaannya.
    app.get('/overlay', (_req, res) => {
      res.sendFile(resolve(dist, 'index.html'))
    })
    // Ruang kendali tiap game duduk di bawah `/game/`. Satu segmen, bukan `/game/*`:
    // yang di-bookmark creator selalu `/game/<id>`, dan id yang tidak dikenal sudah
    // dijawab katalog oleh klien — bukan alasan untuk melebarkan fallback ini.
    app.get('/game/:id', (_req, res) => {
      res.sendFile(resolve(dist, 'index.html'))
    })
  }

  return app
}
