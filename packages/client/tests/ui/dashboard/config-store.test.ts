import { describe, expect, it } from 'vitest'
import { LocalStore, ServerStore } from '../../../src/platform/persistence/index.js'
import type { StorageLike } from '../../../src/platform/persistence/index.js'
import { defaultConfig } from '../../../src/games/battle-arena/config/index.js'
import {
  CONFIG_KEY,
  createConfigPusher,
  loadConfig,
  pullConfigDefault,
  saveConfig,
} from '../../../src/ui/dashboard/config-store.js'

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

describe('pullConfigDefault', () => {
  it('mengadopsi default server dan memvalidasinya lewat battleArenaConfig.validate — menang meski device sudah punya config sendiri', async () => {
    const storage = memoryStorage({ [`lga:${CONFIG_KEY}`]: JSON.stringify(defaultConfig()) })
    const store = new LocalStore({ storage, ...immediate })
    const shared = { ...defaultConfig(), gameplay: { ...defaultConfig().gameplay, baseHp: 555 } }
    const server = new ServerStore({
      fetch: async () => new Response(JSON.stringify({ value: shared }), { status: 200 }),
    })
    let inherited = -1

    await pullConfigDefault(store, server, (config) => {
      inherited = config.gameplay.baseHp
    })

    expect(inherited).toBe(555)
    expect(loadConfig(store).gameplay.baseHp).toBe(555)
  })
})

describe('createConfigPusher', () => {
  it('mengirim config yang di-push ke /api/config/battle-arena.config', async () => {
    const calls: string[] = []
    const server = new ServerStore({
      fetch: async (input) => {
        calls.push(String(input))
        return new Response(null, { status: 204 })
      },
    })
    const pusher = createConfigPusher(server)

    pusher.push(defaultConfig())
    await pusher.flush()

    expect(calls).toEqual([`/api/config/${CONFIG_KEY}`])
  })
})
