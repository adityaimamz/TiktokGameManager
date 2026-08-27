import { describe, expect, it } from 'vitest'
import { DEFAULT_PORT, MIN_APP_KEY_LENGTH, appKeyRefusal, readEnv } from './env.js'

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

describe('allowOpenAccess', () => {
  it('mati kecuali disetel persis "1" — supaya tidak pernah menyala tak sengaja', () => {
    expect(readEnv({}).allowOpenAccess).toBe(false)
    expect(readEnv({ ALLOW_OPEN_ACCESS: '' }).allowOpenAccess).toBe(false)
    expect(readEnv({ ALLOW_OPEN_ACCESS: 'true' }).allowOpenAccess).toBe(false)
    expect(readEnv({ ALLOW_OPEN_ACCESS: '1' }).allowOpenAccess).toBe(true)
  })
})

describe('appKeyRefusal', () => {
  it('menolak boot saat APP_KEY kosong dan akses terbuka tidak diminta', () => {
    const refusal = appKeyRefusal(readEnv({}))

    expect(refusal).not.toBeNull()
    expect(refusal).toContain('APP_KEY')
    expect(refusal).toContain('ALLOW_OPEN_ACCESS')
  })

  it('mengizinkan APP_KEY kosong saat akses terbuka diminta — dev lokal tidak berubah', () => {
    expect(appKeyRefusal(readEnv({ ALLOW_OPEN_ACCESS: '1' }))).toBeNull()
  })

  it('menolak kunci yang terlalu pendek untuk dibagikan lewat URL', () => {
    const refusal = appKeyRefusal(readEnv({ APP_KEY: 'pendek' }))

    expect(refusal).not.toBeNull()
    expect(refusal).toContain(String(MIN_APP_KEY_LENGTH))
  })

  it('menerima kunci sepanjang batas', () => {
    expect(appKeyRefusal(readEnv({ APP_KEY: 'x'.repeat(MIN_APP_KEY_LENGTH) }))).toBeNull()
  })

  it('tetap menuntut panjang walau akses terbuka diminta — kunci setengah hati lebih buruk daripada tanpa kunci', () => {
    expect(appKeyRefusal(readEnv({ APP_KEY: 'pendek', ALLOW_OPEN_ACCESS: '1' }))).not.toBeNull()
  })
})
