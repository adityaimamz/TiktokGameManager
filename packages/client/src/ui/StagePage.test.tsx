// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { SIDE_A, snapshotLength } from '@lga/shared'
import { GameSignals, MEDIA_TOPIC, SNAPSHOT_TOPIC } from '../platform/signals/index.js'
import { ALERT_DISPLAY_MS } from './media/cue-queue.js'
import type { AudioLike } from './media/audio-channels.js'
import type { SignalChannel } from '../platform/signals/index.js'
import { defaultConfig } from '../games/battle-arena/config/index.js'
import { UltimateFxPost } from '../games/battle-arena/renderer/fx/index.js'
import { StagePage } from './StagePage.js'

afterEach(cleanup)
afterEach(() => vi.restoreAllMocks())

const snapshot = (scoreA: number): Float32Array => {
  const buf = new Float32Array(snapshotLength(1, 0, 0))
  buf.set([1, 50, 3, scoreA, 0, 0, 0, 1, 0, 0, -1], 0)
  buf.set([0, 25, 50, 80, 100, SIDE_A, 1, 0, -1, 0], 11)
  return buf
}

const controllable = () => {
  const listeners = new Set<(message: { topic: string; payload: unknown }) => void>()
  const channel: SignalChannel = {
    mode: 'broadcast',
    post: () => {},
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    close: () => listeners.clear(),
  }
  return {
    channel,
    deliver: (topic: string, payload: unknown) => listeners.forEach((l) => l({ topic, payload })),
  }
}

const storageWith = (entries: Record<string, unknown>) => {
  const map = new Map<string, string>()
  for (const [key, value] of Object.entries(entries)) map.set(key, JSON.stringify(value))
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  }
}

/** Penjadwal frame manual: test yang menentukan kapan frame terjadi. */
const manualFrames = () => {
  const queue: ((timestampMs: number) => void)[] = []
  return {
    schedule: (cb: (timestampMs: number) => void) => {
      queue.push(cb)
      return queue.length
    },
    cancel: () => {},
    run: (timestampMs: number) => queue.shift()?.(timestampMs),
  }
}

const audioSpy = () => {
  const made: { url: string; played: number; paused: number }[] = []
  const create = (url: string): AudioLike => {
    const entry = { url, played: 0, paused: 0 }
    made.push(entry)
    return {
      volume: 1,
      loop: false,
      currentTime: 0,
      play: () => void (entry.played += 1),
      pause: () => void (entry.paused += 1),
      load: () => {},
    }
  }
  const of = (url: string) => made.find((entry) => entry.url === url)
  return { create, made, of }
}

describe('StagePage', () => {
  it('is transparent outside the three zones, so OBS can see through it (Req 19 AC1)', () => {
    const bus = controllable()
    render(
      <StagePage
        signals={new GameSignals({ channel: bus.channel, now: () => 0 })}
        size={{ width: 1600, height: 900 }}
        scheduleFrame={() => 1}
        cancelFrame={() => {}}
      />,
    )

    const page = screen.getByTestId('stage-page')
    expect(page.style.background).toBe('rgba(0, 0, 0, 0)')
  })

  it('never puts a WebGL canvas on the overlay page', () => {
    // Dipalsukan true supaya yang diuji keputusan halaman, bukan ketidakmampuan jsdom.
    vi.spyOn(UltimateFxPost, 'isSupported').mockReturnValue(true)
    const bus = controllable()
    render(
      <StagePage
        signals={new GameSignals({ channel: bus.channel, now: () => 0 })}
        size={{ width: 1600, height: 900 }}
        scheduleFrame={() => 1}
        cancelFrame={() => {}}
      />,
    )
    // Tanpa snapshot, Stage tidak dirender sama sekali dan assertion di bawah lulus
    // tanpa membuktikan apa pun.
    act(() => bus.deliver(SNAPSHOT_TOPIC, snapshot(1)))

    expect(screen.getByTestId('stage-canvas')).toBeTruthy()
    expect(screen.queryByTestId('stage-canvas-gl')).toBeNull()
  })

  it('shows nothing but a waiting marker before any snapshot exists', () => {
    const bus = controllable()
    render(
      <StagePage
        signals={new GameSignals({ channel: bus.channel, now: () => 0 })}
        size={{ width: 1600, height: 900 }}
        scheduleFrame={() => 1}
        cancelFrame={() => {}}
      />,
    )

    expect(screen.queryByTestId('stage-canvas')).toBeNull()
    expect(screen.getByTestId('stage-waiting')).toBeTruthy()
  })

  it('restores the last snapshot from storage before a live update arrives (Req 19 AC4)', () => {
    const bus = controllable()
    const storage = storageWith({
      'lga:last:snapshot': Array.from(snapshot(7)),
      'lga:last:config': defaultConfig(),
    })

    render(
      <StagePage
        signals={new GameSignals({ channel: bus.channel, storage, now: () => 0 })}
        size={{ width: 1600, height: 900 }}
        scheduleFrame={() => 1}
        cancelFrame={() => {}}
      />,
    )

    expect(screen.getByTestId('score-a').textContent).toBe('7')
  })

  it('follows live snapshots once they start arriving', () => {
    const bus = controllable()
    render(
      <StagePage
        signals={new GameSignals({ channel: bus.channel, now: () => 0 })}
        size={{ width: 1600, height: 900 }}
        scheduleFrame={() => 1}
        cancelFrame={() => {}}
      />,
    )

    act(() => bus.deliver('snapshot', snapshot(3)))

    expect(screen.getByTestId('score-a').textContent).toBe('3')
  })

  it('renders the legend for viewers, but never interactive', () => {
    const bus = controllable()
    render(
      <StagePage
        signals={new GameSignals({ channel: bus.channel, now: () => 0 })}
        size={{ width: 1600, height: 900 }}
        scheduleFrame={() => 1}
        cancelFrame={() => {}}
      />,
    )
    act(() => bus.deliver('snapshot', snapshot(1)))

    expect(screen.getByTestId('action-legend')).toBeTruthy()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('memutar cue bunyi yang datang lewat topik media', () => {
    const bus = controllable()
    const audio = audioSpy()
    render(
      <StagePage
        signals={new GameSignals({ channel: bus.channel, now: () => 0 })}
        size={{ width: 1600, height: 900 }}
        createAudio={audio.create}
        scheduleFrame={() => 1}
        cancelFrame={() => {}}
      />,
    )

    act(() =>
      bus.deliver(MEDIA_TOPIC, {
        id: 'c1',
        kind: 'sound',
        url: '/api/uploads/a.mp3',
        volume: 1,
        text: '',
        avatarUrl: null,
      }),
    )

    // Dicari lewat url, bukan indeks: `warm()` sudah membuat kedua belas berkas ultimate
    // sebelum cue ini datang, jadi `made[0]` bukan lagi elemen yang diputar.
    expect(audio.of('/api/uploads/a.mp3')?.played).toBe(1)
  })

  it('menampilkan banner alert lalu membuangnya saat umurnya habis', () => {
    const bus = controllable()
    const frames = manualFrames()
    let clock = 0
    render(
      <StagePage
        signals={new GameSignals({ channel: bus.channel, now: () => 0 })}
        size={{ width: 1600, height: 900 }}
        now={() => clock}
        createAudio={audioSpy().create}
        scheduleFrame={frames.schedule}
        cancelFrame={frames.cancel}
      />,
    )

    act(() => bus.deliver(SNAPSHOT_TOPIC, snapshot(1)))
    act(() =>
      bus.deliver(MEDIA_TOPIC, {
        id: 'a1',
        kind: 'gif',
        url: null,
        volume: 1,
        text: 'budi baru follow!',
        avatarUrl: null,
      }),
    )

    expect(screen.getByTestId('media-banner-text').textContent).toBe('budi baru follow!')

    clock = ALERT_DISPLAY_MS + 1
    act(() => frames.run(16))

    expect(screen.queryByTestId('media-banner-text')).toBeNull()
  })

  it('menghentikan musik saat halaman dilepas', () => {
    const bus = controllable()
    const audio = audioSpy()
    const view = render(
      <StagePage
        signals={new GameSignals({ channel: bus.channel, now: () => 0 })}
        size={{ width: 1600, height: 900 }}
        createAudio={audio.create}
        scheduleFrame={() => 1}
        cancelFrame={() => {}}
      />,
    )

    act(() =>
      bus.deliver(MEDIA_TOPIC, {
        id: 'm1',
        kind: 'music',
        url: '/api/uploads/lagu.mp3',
        volume: 1,
        text: '',
        avatarUrl: null,
      }),
    )
    view.unmount()

    expect(audio.of('/api/uploads/lagu.mp3')?.paused).toBe(1)
  })
})
