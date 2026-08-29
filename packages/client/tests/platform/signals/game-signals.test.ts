import { describe, expect, it } from 'vitest'
import { createSignalChannel } from '../../../src/platform/signals/channel.js'
import type { SignalChannel, StorageLike } from '../../../src/platform/signals/channel.js'
import {
  CONFIG_TOPIC,
  GameSignals,
  SNAPSHOT_PERSIST_DEBOUNCE_MS,
  SNAPSHOT_TOPIC,
  signalCodecs,
} from '../../../src/platform/signals/game-signals.js'
import type { MediaCue } from '../../../src/platform/media/cues.js'

interface Roster {
  version: number
}

const createStorage = (): StorageLike & { map: Map<string, string> } => {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  }
}

/** Kanal langsung: apa yang di-post langsung sampai ke subscriber-nya sendiri. */
const loopbackChannel = (): SignalChannel => {
  const listeners = new Set<(message: { topic: string; payload: unknown }) => void>()
  return {
    mode: 'broadcast',
    post: (topic, payload) => listeners.forEach((listener) => listener({ topic, payload })),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    close: () => listeners.clear(),
  }
}

describe('GameSignals', () => {
  it('delivers a snapshot to its subscriber untouched', () => {
    const received: Float32Array[] = []
    const signals = new GameSignals({ channel: loopbackChannel(), now: () => 0 })
    signals.onSnapshot((buf) => received.push(buf))

    signals.publishSnapshot(Float32Array.from([1, 2, 3]))

    expect(Array.from(received[0] ?? [])).toEqual([1, 2, 3])
  })

  it('routes roster, config and feed to their own subscribers', () => {
    const signals = new GameSignals<Roster, { schemaVersion: number }, string>({
      channel: loopbackChannel(),
      now: () => 0,
    })
    const rosters: Roster[] = []
    const configs: { schemaVersion: number }[] = []
    const feed: string[] = []
    signals.onRoster((roster) => rosters.push(roster))
    signals.onConfig((config) => configs.push(config))
    signals.onFeed((entry) => feed.push(entry))

    signals.publishRoster({ version: 2 })
    signals.publishConfig({ schemaVersion: 1 })
    signals.publishFeed('andi killed budi')

    expect(rosters).toEqual([{ version: 2 }])
    expect(configs).toEqual([{ schemaVersion: 1 }])
    expect(feed).toEqual(['andi killed budi'])
    expect(rosters).toHaveLength(1)
  })

  it('persists at most one snapshot per debounce window', () => {
    const storage = createStorage()
    let now = 0
    const signals = new GameSignals({ channel: loopbackChannel(), storage, now: () => now })

    signals.publishSnapshot(Float32Array.from([1]))
    const afterFirst = storage.getItem('lga:last:snapshot')
    expect(afterFirst).not.toBeNull()

    now += SNAPSHOT_PERSIST_DEBOUNCE_MS - 1
    signals.publishSnapshot(Float32Array.from([2]))
    expect(storage.getItem('lga:last:snapshot')).toBe(afterFirst)

    now += 2
    signals.publishSnapshot(Float32Array.from([3]))
    expect(storage.getItem('lga:last:snapshot')).toContain('[3]')
  })

  it('writes the snapshot it was holding back when asked to flush', () => {
    const storage = createStorage()
    const signals = new GameSignals({ channel: loopbackChannel(), storage, now: () => 0 })

    signals.publishSnapshot(Float32Array.from([1]))
    signals.publishSnapshot(Float32Array.from([9]))
    expect(storage.getItem('lga:last:snapshot')).toContain('[1]')

    signals.flush()
    expect(storage.getItem('lga:last:snapshot')).toContain('[9]')
  })

  it('persists roster and config immediately, since they change rarely', () => {
    const storage = createStorage()
    const signals = new GameSignals<Roster, { schemaVersion: number }>({
      channel: loopbackChannel(),
      storage,
      now: () => 0,
    })

    signals.publishRoster({ version: 4 })
    signals.publishConfig({ schemaVersion: 1 })

    expect(storage.getItem('lga:last:roster')).toContain('"version":4')
    expect(storage.getItem('lga:last:config')).toContain('"schemaVersion":1')
  })

  it('restores the last snapshot, roster and config for an overlay that just opened', () => {
    const storage = createStorage()
    const writer = new GameSignals<Roster>({ channel: loopbackChannel(), storage, now: () => 0 })
    writer.publishSnapshot(Float32Array.from([4, 5]))
    writer.publishRoster({ version: 7 })

    const reader = new GameSignals<Roster>({ channel: loopbackChannel(), storage, now: () => 0 })
    const restored = reader.restoreLast()

    expect(Array.from(restored.snapshot ?? [])).toEqual([4, 5])
    expect(restored.roster).toEqual({ version: 7 })
    expect(restored.config).toBeNull()
  })

  it('returns nulls instead of throwing when storage is empty or corrupt', () => {
    const storage = createStorage()
    storage.map.set('lga:last:snapshot', 'not json at all')
    const signals = new GameSignals({ channel: loopbackChannel(), storage, now: () => 0 })

    expect(signals.restoreLast()).toEqual({ snapshot: null, roster: null, config: null })
  })

  it('works without storage at all', () => {
    const signals = new GameSignals({ channel: loopbackChannel(), storage: null, now: () => 0 })

    expect(() => signals.publishSnapshot(Float32Array.from([1]))).not.toThrow()
    expect(signals.restoreLast().snapshot).toBeNull()
  })

  it('unsubscribes everything and closes the channel', () => {
    const channel = loopbackChannel()
    const received: unknown[] = []
    const signals = new GameSignals({ channel, now: () => 0 })
    signals.onSnapshot((buf) => received.push(buf))

    signals.close()
    channel.post(SNAPSHOT_TOPIC, Float32Array.from([1]))

    expect(received).toEqual([])
  })
})

describe('GameSignals mengulang state untuk penonton yang telat', () => {
  /*
   * Lubang yang ditutupnya: creator menyalakan game (publishConfig sekali), BARU
   * mengaktifkan scene OBS. BroadcastChannel tidak menahan apa pun dan localStorage OBS
   * kosong, jadi overlay menggambar seluruh siaran dengan defaultConfig() — nama sisi
   * bawaan, target kill bawaan, dan blob berukuran salah karena baseHp-nya beda.
   */
  it('mengirim ulang roster dan config, tapi tidak feed maupun media', () => {
    const channel = loopbackChannel()
    const owner = new GameSignals<Roster, { schemaVersion: number }, string>({ channel, now: () => 0 })
    owner.publishRoster({ version: 7 })
    owner.publishConfig({ schemaVersion: 3 })
    owner.publishFeed('kill lama')
    owner.publishMedia({ kind: 'sound', url: 'x.wav', volume: 1 } as unknown as MediaCue)

    const seen: { topic: string; payload: unknown }[] = []
    channel.subscribe((message) => seen.push(message))
    owner.republishState()

    expect(seen.map((m) => m.topic)).toEqual(['roster', 'config'])
    expect(seen[1]?.payload).toEqual({ schemaVersion: 3 })
  })

  it('menjawab sapaan overlay dengan mengulang state', () => {
    const channel = loopbackChannel()
    const owner = new GameSignals<Roster, { schemaVersion: number }, string>({ channel, now: () => 0 })
    owner.onStateRequest(() => owner.republishState())
    owner.publishConfig({ schemaVersion: 3 })

    const latecomer = new GameSignals<Roster, { schemaVersion: number }, string>({ channel, now: () => 0 })
    const configs: { schemaVersion: number }[] = []
    latecomer.onConfig((config) => configs.push(config))
    latecomer.requestState()

    expect(configs).toEqual([{ schemaVersion: 3 }])
  })

  it('diam saja saat belum ada yang pernah diterbitkan', () => {
    const channel = loopbackChannel()
    const seen: string[] = []
    channel.subscribe((message) => seen.push(message.topic))
    new GameSignals({ channel, now: () => 0 }).republishState()
    expect(seen).toEqual([])
  })
})

describe('signalCodecs', () => {
  it('turns a snapshot into JSON and back through a real storage channel', () => {
    const storage = createStorage()
    const jobs: (() => void)[] = []
    const options = {
      name: 'lga',
      broadcast: () => null,
      storage,
      topics: [SNAPSHOT_TOPIC, CONFIG_TOPIC],
      codecs: signalCodecs,
      schedulePoll: (fn: () => void) => jobs.push(fn),
      cancelPoll: () => {},
    }
    const writer = new GameSignals({ channel: createSignalChannel(options), now: () => 0 })
    const reader = new GameSignals({ channel: createSignalChannel(options), now: () => 0 })
    const received: Float32Array[] = []
    reader.onSnapshot((buf) => received.push(buf))

    writer.publishSnapshot(Float32Array.from([1.25, 2.5]))
    jobs.forEach((job) => job())

    expect(received[0]).toBeInstanceOf(Float32Array)
    expect(Array.from(received[0] ?? [])).toEqual([1.25, 2.5])
  })

  it('mengantarkan cue media ke subscriber-nya sendiri', () => {
    const signals = new GameSignals({ channel: loopbackChannel(), now: () => 0 })
    const received: MediaCue[] = []
    signals.onMedia((cue) => received.push(cue))

    signals.publishMedia({
      id: 'cue-1',
      kind: 'sound',
      url: '/api/uploads/abc.mp3',
      volume: 0.8,
      text: '',
      avatarUrl: null,
    })

    expect(received).toHaveLength(1)
    expect(received[0]?.url).toBe('/api/uploads/abc.mp3')
  })

  it('tidak pernah mempersistensi cue media', () => {
    const storage = createStorage()
    const signals = new GameSignals({ channel: loopbackChannel(), storage, now: () => 0 })

    signals.publishMedia({
      id: 'cue-1',
      kind: 'gif',
      url: '/api/uploads/abc.gif',
      volume: 1,
      text: 'halo',
      avatarUrl: null,
    })

    // Cue yang lewat lima menit lalu tidak layak dihidupkan lagi saat overlay di-reload —
    // aturan yang sama dengan feed.
    expect(storage.map.size).toBe(0)
  })
})
