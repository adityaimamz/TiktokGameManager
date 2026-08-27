import { Router } from 'express'
import type { MatchRecord } from '@lga/shared'
import type { Repos } from '../repo/types.js'
import { parseLimit } from './query.js'

const SIDES = new Set(['a', 'b'])

/**
 * Validasi bentuk, bukan validasi nilai.
 *
 * Server tidak menebak-nebak apakah skornya masuk akal — client yang menghitungnya, dan
 * satu-satunya client adalah aplikasi ini sendiri. Yang dijaga di sini hanyalah bahwa
 * kolom yang akan ditulis ke Postgres bertipe benar.
 */
export function parseMatchRecord(body: unknown): MatchRecord | null {
  if (typeof body !== 'object' || body === null) return null
  const raw = body as Record<string, unknown>

  const numbers = ['startedAtMs', 'endedAtMs', 'roundsWonA', 'roundsWonB', 'totalFighters'] as const
  for (const field of numbers) {
    if (typeof raw[field] !== 'number' || !Number.isFinite(raw[field])) return null
  }
  if (typeof raw['gameId'] !== 'string' || raw['gameId'] === '') return null

  const winner = raw['winnerSide']
  if (winner !== null && !(typeof winner === 'string' && SIDES.has(winner))) return null

  const players = raw['players']
  if (!Array.isArray(players)) return null
  for (const entry of players) {
    if (typeof entry !== 'object' || entry === null) return null
    const player = entry as Record<string, unknown>
    if (player['platform'] !== 'tiktok') return null
    if (typeof player['username'] !== 'string' || player['username'] === '') return null
    if (typeof player['side'] !== 'string' || !SIDES.has(player['side'])) return null
    if (typeof player['kills'] !== 'number' || !Number.isFinite(player['kills'])) return null
    if (typeof player['deaths'] !== 'number' || !Number.isFinite(player['deaths'])) return null
    if (typeof player['giftCoins'] !== 'number' || !Number.isFinite(player['giftCoins'])) return null
    const avatar = player['avatarUrl']
    if (avatar !== null && typeof avatar !== 'string') return null
  }

  return body as MatchRecord
}

export function matchRoutes(repos: Repos): Router {
  const router = Router()

  router.get('/', async (req, res) => {
    res.json({ matches: await repos.recentMatches(parseLimit(req.query['limit'])) })
  })

  router.post('/', async (req, res) => {
    const record = parseMatchRecord(req.body)
    if (record === null) {
      res.status(400).json({ error: 'invalid match record' })
      return
    }
    res.status(201).json(await repos.recordMatch(record))
  })

  return router
}
