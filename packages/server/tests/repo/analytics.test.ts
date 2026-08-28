import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import type { Db } from '../../src/db/client.js'
import { insertAnalytics } from '../../src/repo/analytics.js'
import { describeDb, freshDb, truncateAll } from './testing.js'

describeDb('insertAnalytics', () => {
  let db: Db

  beforeAll(() => {
    db = freshDb()
  })

  beforeEach(async () => {
    await truncateAll(db)
  })

  afterAll(async () => {
    await truncateAll(db)
  })

  it('writes every event in one batch and returns the count', async () => {
    const written = await insertAnalytics(
      db,
      [
        { type: 'matchStarted', payload: { seed: 42 }, atMs: 1_000 },
        { type: 'fighterJoined', payload: { side: 'a' }, atMs: 2_000 },
      ],
      null,
    )

    expect(written).toBe(2)
    const result = await db.execute(sql`select type, payload from analytics_events order by id`)
    expect(result.rows).toHaveLength(2)
    expect((result.rows[0] as { payload: unknown }).payload).toEqual({ seed: 42 })
  })

  it('writes nothing and touches no connection for an empty batch', async () => {
    expect(await insertAnalytics(db, [], null)).toBe(0)
    const result = await db.execute(sql`select count(*)::int as n from analytics_events`)
    expect((result.rows[0] as { n: number }).n).toBe(0)
  })
})
