import { describe, expect, it } from 'vitest'
import type { MediaCue } from '../../platform/signals/index.js'
import {
  ALERT_DISPLAY_MS,
  BANNER_QUEUE_MAX,
  bannerFromCue,
  emptyQueue,
  expireBanner,
  pushBanner,
} from './cue-queue.js'

const item = (id: string) => ({ id, text: id, imageUrl: null, avatarUrl: null })

const cue = (over: Partial<MediaCue>): MediaCue => ({
  id: 'c1',
  kind: 'sound',
  url: '/api/uploads/a.mp3',
  volume: 1,
  text: '',
  avatarUrl: null,
  ...over,
})

describe('antrean banner', () => {
  it('menampilkan yang pertama seketika', () => {
    const state = pushBanner(emptyQueue(), item('a'), 1000)

    expect(state.current?.id).toBe('a')
    expect(state.pending).toHaveLength(0)
  })

  it('mengantre yang berikutnya alih-alih menimpanya', () => {
    let state = pushBanner(emptyQueue(), item('a'), 0)
    state = pushBanner(state, item('b'), 10)

    expect(state.current?.id).toBe('a')
    expect(state.pending.map((entry) => entry.id)).toEqual(['b'])
  })

  it('membuang yang TERTUA saat antrean penuh — badai follow tidak boleh menumpuk', () => {
    let state = pushBanner(emptyQueue(), item('tampil'), 0)
    for (let i = 0; i < BANNER_QUEUE_MAX + 2; i += 1) {
      state = pushBanner(state, item(`x${i}`), 0)
    }

    expect(state.pending).toHaveLength(BANNER_QUEUE_MAX)
    expect(state.pending[0]?.id).toBe('x2')
  })

  it('memajukan antrean saat umur tampilnya habis', () => {
    let state = pushBanner(emptyQueue(), item('a'), 0)
    state = pushBanner(state, item('b'), 0)

    state = expireBanner(state, ALERT_DISPLAY_MS)

    expect(state.current?.id).toBe('b')
    expect(state.pending).toHaveLength(0)
  })

  it('mengosongkan diri saat tidak ada yang mengantre', () => {
    const state = expireBanner(pushBanner(emptyQueue(), item('a'), 0), ALERT_DISPLAY_MS)

    expect(state.current).toBeNull()
  })

  it('mengembalikan state yang SAMA saat belum ada yang berubah', () => {
    const state = pushBanner(emptyQueue(), item('a'), 0)

    // Identitas yang stabil inilah yang membuat pemanggilan tiap frame tidak merender ulang
    // pohon React 60 kali per detik.
    expect(expireBanner(state, ALERT_DISPLAY_MS - 1)).toBe(state)

    const empty = emptyQueue()
    expect(expireBanner(empty, 999999)).toBe(empty)
  })
})

describe('bannerFromCue', () => {
  it('menggambar GIF meski tanpa tulisan', () => {
    expect(bannerFromCue(cue({ kind: 'gif', url: '/a.gif' }))?.imageUrl).toBe('/a.gif')
  })

  it('menggambar tulisan alert meski cue-nya bunyi', () => {
    expect(bannerFromCue(cue({ kind: 'sound', text: 'budi mengirim Rose!' }))?.text).toBe(
      'budi mengirim Rose!',
    )
  })

  it('tidak menggambar apa pun untuk bunyi polos dan untuk musik', () => {
    expect(bannerFromCue(cue({ kind: 'sound' }))).toBeNull()
    expect(bannerFromCue(cue({ kind: 'music', url: null, text: 'x' }))).toBeNull()
  })
})
