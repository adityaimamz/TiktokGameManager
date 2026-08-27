import { describe, expect, it } from 'vitest'
import { LocalStore } from './local-store.js'

/** localStorage in-memory, cukup untuk apa yang LocalStore pakai. */
function createFakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed))
  return {
    storage: {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value)
      },
      removeItem: (key: string) => {
        map.delete(key)
      },
    },
    map,
  }
}

function createRig(seed: Record<string, string> = {}) {
  const fake = createFakeStorage(seed)
  const timers: (() => void)[] = []
  const warnings: string[] = []
  const store = new LocalStore({
    storage: fake.storage,
    setTimer: (fn) => {
      timers.push(fn)
      return timers.length
    },
    clearTimer: () => {},
    onError: (_error, context) => warnings.push(context),
  })
  return {
    store,
    map: fake.map,
    warnings,
    runTimers: () => {
      const pending = [...timers]
      timers.length = 0
      for (const fn of pending) fn()
    },
  }
}

describe('LocalStore', () => {
  it('returns the fallback for a key it has never seen', () => {
    const rig = createRig()
    expect(rig.store.read('config', { volume: 5 })).toEqual({ volume: 5 })
  })

  it('reads back what it wrote once the debounce elapses', () => {
    const rig = createRig()
    rig.store.write('config', { volume: 9 })
    rig.runTimers()
    expect(rig.store.read('config', { volume: 5 })).toEqual({ volume: 9 })
  })

  it('writes once for a burst of updates, keeping the last value', () => {
    const rig = createRig()
    rig.store.write('config', { volume: 1 })
    rig.store.write('config', { volume: 2 })
    rig.store.write('config', { volume: 3 })
    expect(rig.map.size).toBe(0)

    rig.runTimers()

    expect(rig.store.read('config', { volume: 0 })).toEqual({ volume: 3 })
    expect(rig.map.size).toBe(1)
  })

  it('flush writes immediately without waiting for the timer', () => {
    const rig = createRig()
    rig.store.write('config', { volume: 7 })
    rig.store.flush()
    expect(rig.store.read('config', { volume: 0 })).toEqual({ volume: 7 })
  })

  it('falls back without throwing when the stored JSON is corrupt (Req 21 AC5)', () => {
    const rig = createRig({ 'lga:config': '{not json', 'lga:other': '{"kept":true}' })

    expect(rig.store.read('config', { volume: 5 })).toEqual({ volume: 5 })
    expect(rig.warnings).toHaveLength(1)
    // Kunci lain tidak boleh ikut terhapus hanya karena satu kunci rusak.
    expect(rig.store.read('other', {})).toEqual({ kept: true })
  })

  it('survives a storage that refuses to write, such as a full quota', () => {
    const store = new LocalStore({
      storage: {
        getItem: () => null,
        setItem: () => {
          throw new Error('QuotaExceededError')
        },
        removeItem: () => {},
      },
      setTimer: (fn) => {
        fn()
        return 1
      },
      clearTimer: () => {},
      onError: () => {},
    })

    expect(() => store.write('config', { volume: 1 })).not.toThrow()
  })

  it('does nothing at all when there is no storage, as on a server render', () => {
    const store = new LocalStore({ storage: null })
    store.write('config', { volume: 1 })
    store.flush()
    expect(store.read('config', { volume: 5 })).toEqual({ volume: 5 })
  })
})
