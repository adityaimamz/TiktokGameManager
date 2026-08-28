import { describe, expect, it } from 'vitest'
import { createChatMessage } from '@lga/shared'
import type { ChatEventKind, ChatMessage } from '@lga/shared'
import { createCommentReader } from '../../../src/platform/speech/reader.js'
import { DEFAULT_READER } from '../../../src/platform/speech/settings.js'
import type { ReaderSettings } from '../../../src/platform/speech/settings.js'

/** Reader lahir mati; tiap test di sini menghidupkannya lebih dulu. */
const settings = (patch: Partial<ReaderSettings> = {}): ReaderSettings => ({
  ...DEFAULT_READER,
  enabled: true,
  ...patch,
})

const comment = (text: string, username = 'budi'): ChatMessage =>
  createChatMessage({ id: 'm1', kind: 'textMessageEvent', platform: 'tiktok', username, text })

const event = (kind: ChatEventKind): ChatMessage =>
  createChatMessage({ id: 'm2', kind, platform: 'tiktok', username: 'sari', text: 'halo' })

describe('createCommentReader', () => {
  it('membacakan isi komentarnya saja, tanpa nama penonton, dan menomori tiap ucapan', () => {
    const reader = createCommentReader({ getSettings: () => settings() })

    expect(reader.onMessage(comment('halo semua'))).toEqual({
      id: 'speech-0',
      text: 'halo semua',
    })
    expect(reader.onMessage(comment('lagi'))?.id).toBe('speech-1')
  })

  it('diam total saat reader dimatikan', () => {
    const reader = createCommentReader({ getSettings: () => settings({ enabled: false }) })

    expect(reader.onMessage(comment('halo'))).toBeNull()
  })

  it('mengabaikan gift, like, follow, dan share — semuanya sudah punya banner alert', () => {
    const reader = createCommentReader({ getSettings: () => settings() })

    for (const kind of ['giftEvent', 'likeEvent', 'followEvent', 'shareEvent'] as ChatEventKind[]) {
      expect(reader.onMessage(event(kind))).toBeNull()
    }
  })

  it('membuang tautan, dan menolak komentar yang isinya hanya tautan', () => {
    const reader = createCommentReader({ getSettings: () => settings() })

    expect(reader.onMessage(comment('mampir https://spam.example/x ya'))?.text).toBe('mampir ya')
    expect(reader.onMessage(comment('www.spam.example'))).toBeNull()
  })

  it('menolak komentar bermuatan kata terlarang, tanpa peduli huruf besar-kecil', () => {
    const reader = createCommentReader({ getSettings: () => settings({ blockedWords: ['babi'] }) })

    expect(reader.onMessage(comment('dasar BABI'))).toBeNull()
    expect(reader.onMessage(comment('sate kambing'))).not.toBeNull()
  })

  it('tidak menyensor komentar hanya karena NAMA penontonnya memuat kata terlarang', () => {
    const reader = createCommentReader({ getSettings: () => settings({ blockedWords: ['babi'] }) })

    // Nama tidak lagi dibacakan, jadi kata terlarang di dalamnya tidak pernah sampai ke
    // pendengar — menyaringnya di sini hanya akan membungkam penonton yang tidak salah apa-apa.
    expect(reader.onMessage(comment('halo semua', 'raja_babi'))?.text).toBe('halo semua')
  })

  it('memotong komentar panjang SETELAH saringan, bukan sebelumnya', () => {
    const reader = createCommentReader({
      getSettings: () => settings({ maxChars: 10, blockedWords: ['babi'] }),
    })

    // Kalau potongan berjalan lebih dulu, "babi" di ekor lolos dan komentarnya terbaca.
    expect(reader.onMessage(comment('halo semua babi'))).toBeNull()
    expect(reader.onMessage(comment('satu dua tiga empat'))?.text).toBe('satu dua t')
  })
})
