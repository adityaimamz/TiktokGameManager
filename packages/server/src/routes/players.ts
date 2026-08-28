import { Router } from 'express'
import type { PlayerProgress } from '@lga/shared'
import type { PlayerSort } from '../repo/players.js'
import type { Repos } from '../repo/types.js'
import { parseLimit, parsePlayerIdentity } from './query.js'

/** Sort yang aneh dijepit, bukan ditolak: sebuah papan peringkat tidak layak error 400. */
function parseSort(value: unknown): PlayerSort {
  return value === 'coins' ? 'coins' : 'kills'
}

/**
 * Validasi bentuk, bukan nilai — aturan yang sama dengan `parseMatchRecord`.
 *
 * Server tidak menebak apakah 900 koin dalam 30 detik masuk akal; satu-satunya client adalah
 * aplikasi ini sendiri. Yang dijaga hanyalah bahwa kolom yang akan ditulis bertipe benar.
 */
export function parseProgress(body: unknown): PlayerProgress[] | null {
  if (typeof body !== 'object' || body === null) return null
  const rows = (body as Record<string, unknown>)['players']
  if (!Array.isArray(rows)) return null

  const out: PlayerProgress[] = []
  for (const raw of rows) {
    const identity = parsePlayerIdentity(raw)
    if (identity === null) return null
    const entry = raw as Record<string, unknown>
    const kills = entry['kills']
    const deaths = entry['deaths']
    const giftCoins = entry['giftCoins']
    if (typeof kills !== 'number' || !Number.isFinite(kills)) return null
    if (typeof deaths !== 'number' || !Number.isFinite(deaths)) return null
    if (typeof giftCoins !== 'number' || !Number.isFinite(giftCoins)) return null
    out.push({ ...identity, kills, deaths, giftCoins })
  }
  return out
}

export function playerRoutes(repos: Repos): Router {
  const router = Router()

  router.get('/top', async (req, res) => {
    res.json({
      players: await repos.topPlayers(parseLimit(req.query['limit']), parseSort(req.query['sort'])),
    })
  })

  router.post('/progress', async (req, res) => {
    const entries = parseProgress(req.body)
    if (entries === null) {
      res.status(400).json({ error: 'invalid player progress' })
      return
    }
    // Daftar kosong tidak menyentuh database. Client sudah tidak mengirimnya, tapi route tidak
    // boleh bergantung pada kesopanan pemanggilnya.
    res
      .status(201)
      .json({ written: entries.length === 0 ? 0 : await repos.recordProgress(entries) })
  })

  return router
}
