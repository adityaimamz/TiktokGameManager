import { describe, expect, it } from 'vitest'
import { DEFAULT_PORT, readEnv } from './env.js'

describe('readEnv', () => {
  it('falls back to the default port when PORT is absent or unusable', () => {
    expect(readEnv({}).port).toBe(DEFAULT_PORT)
    expect(readEnv({ PORT: 'banana' }).port).toBe(DEFAULT_PORT)
    expect(readEnv({ PORT: '0' }).port).toBe(DEFAULT_PORT)
  })

  it('reads a numeric PORT', () => {
    expect(readEnv({ PORT: '4000' }).port).toBe(4000)
  })

  it('treats an absent or empty DATABASE_URL as no database', () => {
    expect(readEnv({}).databaseUrl).toBeNull()
    expect(readEnv({ DATABASE_URL: '   ' }).databaseUrl).toBeNull()
  })

  it('keeps a real DATABASE_URL', () => {
    expect(readEnv({ DATABASE_URL: 'postgres://x/y' }).databaseUrl).toBe('postgres://x/y')
  })

  it('leaves EULER_API_KEY undefined when unset, so the free tier is used', () => {
    expect(readEnv({}).eulerApiKey).toBeUndefined()
    expect(readEnv({ EULER_API_KEY: 'k' }).eulerApiKey).toBe('k')
  })

  it('jatuh ke ./uploads saat UPLOAD_DIR kosong', () => {
    expect(readEnv({}).uploadDir).toBe('./uploads')
    expect(readEnv({ UPLOAD_DIR: '/data/img' }).uploadDir).toBe('/data/img')
  })

  it('menganggap APP_KEY kosong sebagai tanpa kunci: dev lokal terbuka', () => {
    expect(readEnv({}).appKey).toBeNull()
    expect(readEnv({ APP_KEY: '   ' }).appKey).toBeNull()
    expect(readEnv({ APP_KEY: 'rahasia' }).appKey).toBe('rahasia')
  })
})
