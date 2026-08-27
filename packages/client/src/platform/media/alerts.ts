import type { ChatMessage } from '@lga/shared'
import type { AlertRule, CatalogEntry, MediaCue } from './cues.js'

export interface AlertWatcherOptions {
  /** Dibaca saat pesan datang, bukan disalin: rule yang diubah creator berlaku seketika. */
  getRules: () => readonly AlertRule[]
  getCues: () => readonly CatalogEntry[]
}

export interface AlertWatcher {
  /** Mengembalikan cue yang harus dilepas, atau null bila pesan ini tidak memicu apa pun. */
  onMessage(message: ChatMessage): MediaCue | null
}

export function fillTemplate(text: string, user: string, value: string): string {
  return text.split('{user}').join(user).split('{value}').join(value)
}

/**
 * Chat masuk, alert keluar.
 *
 * Tanpa `Date.now` dan tanpa `Math.random`: id datang dari pencacah, dan tidak ada satu pun
 * keputusan di sini yang bergantung waktu. Itulah yang membuat seluruh berkas ini bisa diuji
 * di node tanpa clock palsu.
 */
export function createAlertWatcher(opts: AlertWatcherOptions): AlertWatcher {
  let likeTotal = 0
  let sequence = 0

  const ruleFor = (kind: AlertRule['kind']): AlertRule | null =>
    opts.getRules().find((rule) => rule.kind === kind && rule.enabled) ?? null

  const build = (rule: AlertRule, message: ChatMessage, value: string): MediaCue => {
    const entry = opts.getCues().find((cue) => cue.id === rule.cueId) ?? null
    return {
      id: `alert-${sequence++}`,
      // Cue yang hilang tetap menghasilkan banner: media yang lenyap tidak boleh membatalkan
      // ucapan terima kasih kepada gifter.
      kind: entry?.kind ?? 'gif',
      url: entry?.url ?? null,
      volume: entry?.volume ?? 1,
      text: fillTemplate(rule.text, message.username, value),
      avatarUrl: message.avatarUrl,
    }
  }

  return {
    onMessage(message) {
      if (message.kind === 'likeEvent') {
        // Dihitung SELALU, bahkan saat rule-nya mati: kalau tidak, creator yang menyalakan
        // alert di tengah sesi langsung kena satu ledakan milestone susulan.
        const before = likeTotal
        likeTotal += message.likeCount
        const rule = ruleFor('likes')
        if (rule === null || rule.threshold <= 0) return null
        const passed = Math.floor(likeTotal / rule.threshold)
        if (passed <= Math.floor(before / rule.threshold)) return null
        return build(rule, message, String(passed * rule.threshold))
      }

      if (message.kind === 'giftEvent') {
        const rule = ruleFor('gift')
        if (rule === null || message.giftCoins < rule.threshold) return null
        return build(rule, message, `${message.giftName ?? 'gift'} ×${message.giftCount}`)
      }

      if (message.kind === 'followEvent' || message.kind === 'shareEvent') {
        const rule = ruleFor(message.kind === 'followEvent' ? 'follow' : 'share')
        if (rule === null) return null
        return build(rule, message, '')
      }

      return null
    },
  }
}
