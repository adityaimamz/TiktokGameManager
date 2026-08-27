import { Router } from 'express'
import type { AnalyticsEvent } from '@lga/shared'
import type { Repos } from '../repo/types.js'

export function parseEvents(body: unknown): AnalyticsEvent[] | null {
  if (typeof body !== 'object' || body === null) return null
  const events = (body as Record<string, unknown>)['events']
  if (!Array.isArray(events)) return null

  for (const entry of events) {
    if (typeof entry !== 'object' || entry === null) return null
    const event = entry as Record<string, unknown>
    if (typeof event['type'] !== 'string' || event['type'] === '') return null
    if (typeof event['atMs'] !== 'number' || !Number.isFinite(event['atMs'])) return null
    if (typeof event['payload'] !== 'object' || event['payload'] === null) return null
  }

  return events as AnalyticsEvent[]
}

export function analyticsRoutes(repos: Repos): Router {
  const router = Router()

  router.post('/', async (req, res) => {
    const events = parseEvents(req.body)
    if (events === null) {
      res.status(400).json({ error: 'invalid analytics batch' })
      return
    }
    res.json({ accepted: await repos.recordAnalytics(events, null) })
  })

  return router
}
