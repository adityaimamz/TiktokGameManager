import { Router } from 'express'
import type { Repos } from '../repo/types.js'

/**
 * Default config lintas device, satu baris per kunci — lihat `app-config.ts` di repo.
 *
 * Server tidak pernah menafsirkan `value`: ia hanya menyimpan dan mengembalikannya apa
 * adanya, persis seperti `SignalHub` buta terhadap bentuk topik `config` yang ia relay.
 */
export function configRoutes(repos: Repos): Router {
  const router = Router()

  router.get('/:key', async (req, res) => {
    const value = await repos.getDefaultConfig(req.params.key)
    if (value === null) {
      res.status(404).json({ error: 'not set' })
      return
    }
    res.json({ value })
  })

  router.post('/:key', async (req, res) => {
    const value = (req.body as Record<string, unknown> | null)?.['value']
    if (value === undefined) {
      res.status(400).json({ error: 'missing value' })
      return
    }
    await repos.setDefaultConfig(req.params.key, value)
    res.status(204).end()
  })

  return router
}
