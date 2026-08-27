import { Router } from 'express'
import type { PlayerSort } from '../repo/players.js'
import type { Repos } from '../repo/types.js'
import { parseLimit } from './query.js'

/** Sort yang aneh dijepit, bukan ditolak: sebuah papan peringkat tidak layak error 400. */
function parseSort(value: unknown): PlayerSort {
  return value === 'coins' ? 'coins' : 'kills'
}

export function playerRoutes(repos: Repos): Router {
  const router = Router()

  router.get('/top', async (req, res) => {
    res.json({
      players: await repos.topPlayers(parseLimit(req.query['limit']), parseSort(req.query['sort'])),
    })
  })

  return router
}
