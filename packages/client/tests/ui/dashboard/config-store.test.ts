import { describe, expect, it } from 'vitest'
import { LocalStore } from '../../../src/platform/persistence/index.js'
import type { StorageLike } from '../../../src/platform/persistence/index.js'
import { defaultConfig } from '../../../src/games/battle-arena/config/index.js'
import { CONFIG_KEY, loadConfig, saveConfig } from '../../../src/ui/dashboard/config-store.js'

function memoryStorage(
  seed: Record<string, string> = {},
): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(seed))
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    },
  }
}

/** Timer sinkron: menulis langsung tanpa menunggu debounce. */
const immediate = { setTimer: (fn: () => void) => (fn(), 0), clearTimer: () => {} }

describe('config-store', () => {
  it('mengembalikan default saat belum ada yang tersimpan', () => {
    const store = new LocalStore({ storage: memoryStorage() })
    expect(loadConfig(store).gameplay.baseHp).toBe(defaultConfig().gameplay.baseHp)
  })

  it('mengembalikan config yang tersimpan', () => {
    const config = defaultConfig()
    config.gameplay.baseHp = 777
    const storage = memoryStorage({ [`lga:${CONFIG_KEY}`]: JSON.stringify(config) })

    expect(loadConfig(new LocalStore({ storage })).gameplay.baseHp).toBe(777)
  })

  it('kembali ke default per-field saat yang tersimpan rusak, bukan melempar', () => {
    const storage = memoryStorage({
      [`lga:${CONFIG_KEY}`]: '{"gameplay":{"baseHp":"bukan angka"}}',
    })

    expect(() => loadConfig(new LocalStore({ storage }))).not.toThrow()
    expect(loadConfig(new LocalStore({ storage })).gameplay.baseHp).toBe(
      defaultConfig().gameplay.baseHp,
    )
  })

  it('tidak menjatuhkan apa pun saat JSON tidak bisa dibaca sama sekali', () => {
    const storage = memoryStorage({ [`lga:${CONFIG_KEY}`]: '{{{' })
    const store = new LocalStore({ storage, onError: () => {} })

    expect(loadConfig(store).gameplay.baseHp).toBe(defaultConfig().gameplay.baseHp)
  })

  it('menulis di bawah kunci config saja, tanpa menyentuh preferensi lain', () => {
    const storage = memoryStorage({ 'lga:lain': '"jangan sentuh"' })
    const store = new LocalStore({ storage, ...immediate })

    const config = defaultConfig()
    config.likes.threshold = 42
    saveConfig(store, config)
    store.flush()

    expect(JSON.parse(storage.data.get(`lga:${CONFIG_KEY}`) ?? '{}').likes.threshold).toBe(42)
    expect(storage.data.get('lga:lain')).toBe('"jangan sentuh"')
  })
})
