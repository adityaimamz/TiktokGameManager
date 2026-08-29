import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import type { Db } from '../../src/db/client.js'
import { getDefaultConfig, setDefaultConfig } from '../../src/repo/app-config.js'
import { describeDb, freshDb, truncateAll } from './testing.js'

describeDb('app-config repo', () => {
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

  it('menjawab null untuk kunci yang belum pernah ditulis', async () => {
    expect(await getDefaultConfig(db, 'battle-arena.config')).toBeNull()
  })

  it('menulis lalu membaca nilai yang sama persis', async () => {
    const value = { gameplay: { baseHp: 777 } }
    await setDefaultConfig(db, 'battle-arena.config', value)

    expect(await getDefaultConfig(db, 'battle-arena.config')).toEqual(value)
  })

  it('menimpa nilai yang sudah ada — sinkron terus-menerus, device manapun yang mengedit menang', async () => {
    await setDefaultConfig(db, 'battle-arena.config', { gameplay: { baseHp: 100 } })
    await setDefaultConfig(db, 'battle-arena.config', { gameplay: { baseHp: 999 } })

    expect(await getDefaultConfig(db, 'battle-arena.config')).toEqual({ gameplay: { baseHp: 999 } })
  })

  it('kunci berbeda tidak saling mempengaruhi', async () => {
    await setDefaultConfig(db, 'battle-arena.config', { a: 1 })
    await setDefaultConfig(db, 'media.soundboard', { b: 2 })

    expect(await getDefaultConfig(db, 'battle-arena.config')).toEqual({ a: 1 })
    expect(await getDefaultConfig(db, 'media.soundboard')).toEqual({ b: 2 })
  })
})
