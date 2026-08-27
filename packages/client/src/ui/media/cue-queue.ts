import type { MediaCue } from '../../platform/signals/index.js'

/** Lama satu banner bertahan di layar. */
export const ALERT_DISPLAY_MS = 4000
/** Berapa banyak yang boleh MENUNGGU di belakang yang sedang tampil. */
export const BANNER_QUEUE_MAX = 3

export interface BannerItem {
  id: string
  text: string
  imageUrl: string | null
  avatarUrl: string | null
}

export interface QueueState {
  current: BannerItem | null
  shownAtMs: number
  pending: BannerItem[]
}

export const emptyQueue = (): QueueState => ({ current: null, shownAtMs: 0, pending: [] })

/**
 * Satu tampil pada satu waktu; sisanya menunggu, dan yang TERTUA yang dibuang saat penuh.
 *
 * Aturan buang-tertua diambil dari `ActionQueue`: sepuluh follower dalam dua detik harus
 * menghasilkan tiga banner lalu berhenti, bukan antrean panjang yang masih menayangkan
 * follower dari dua menit lalu.
 */
export function pushBanner(state: QueueState, item: BannerItem, nowMs: number): QueueState {
  if (state.current === null) return { current: item, shownAtMs: nowMs, pending: [] }
  return { ...state, pending: [...state.pending, item].slice(-BANNER_QUEUE_MAX) }
}

/**
 * Mengembalikan state yang SAMA saat belum waktunya berganti.
 *
 * Ini dipanggil tiap frame lewat `onBeforeDraw`; state baru tiap kali berarti pohon React
 * dirender ulang 60 kali per detik demi banner yang tidak berubah.
 */
export function expireBanner(state: QueueState, nowMs: number): QueueState {
  if (state.current === null) return state
  if (nowMs - state.shownAtMs < ALERT_DISPLAY_MS) return state
  const [next, ...rest] = state.pending
  return { current: next ?? null, shownAtMs: nowMs, pending: rest }
}

/**
 * Cue mana yang punya wujud di layar.
 *
 * Bunyi polos tidak menggambar apa pun, musik apalagi. GIF selalu menggambar meski tanpa
 * tulisan — creator yang menekannya memang ingin melihatnya.
 */
export function bannerFromCue(cue: MediaCue): BannerItem | null {
  if (cue.kind === 'music') return null
  const imageUrl = cue.kind === 'gif' ? cue.url : null
  if (cue.text === '' && imageUrl === null) return null
  return { id: cue.id, text: cue.text, imageUrl, avatarUrl: cue.avatarUrl }
}
