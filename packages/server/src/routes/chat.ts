import { Router } from 'express'
import type { ConnectionStatus } from '@lga/shared'

/**
 * Yang dibutuhkan route dari sebuah koneksi.
 *
 * Dinyatakan di sini alih-alih mengimpor `TikTokConnection` supaya test route tidak
 * perlu membangun state machine koneksi sungguhan — dan supaya route tidak pernah
 * memanggil sesuatu yang tidak ada di kontrak ini.
 */
export interface ChatConnection {
  readonly status: ConnectionStatus
  connect(username: string): Promise<ConnectionStatus>
  disconnect(): void
}

/** Creator sering menyalin username berikut '@'-nya dari profil TikTok. */
function normalizeUsername(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/^@+/, '').trim()
}

export function chatRoutes(connection: ChatConnection): Router {
  const router = Router()

  router.get('/status', (_req, res) => {
    res.json(connection.status)
  })

  router.post('/connect', async (req, res) => {
    const username = normalizeUsername((req.body as Record<string, unknown> | undefined)?.['username'])
    if (username === '') {
      res.status(400).json({ error: 'username is required' })
      return
    }
    // Koneksi yang gagal tetap 200: "creator tidak sedang live" adalah jawaban yang sah
    // atas pertanyaan "coba sambung", dan alasannya sudah ada di dalam status.
    res.json(await connection.connect(username))
  })

  router.post('/disconnect', (_req, res) => {
    connection.disconnect()
    res.json(connection.status)
  })

  return router
}
