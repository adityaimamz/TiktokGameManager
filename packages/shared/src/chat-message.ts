/**
 * Sumber sebuah event chat.
 *
 * 'tiktok' adalah satu-satunya platform viewer nyata di Fase 1. Tiga sisanya sintetis:
 * 'demo' dari simulator, 'practice' dari bot pengisi, 'creator' dari tombol di dashboard.
 * Ketiganya tidak pernah ditulis ke database.
 */
export type ChatPlatform = 'tiktok' | 'demo' | 'practice' | 'creator'

export type ChatEventKind =
  | 'textMessageEvent'
  | 'likeEvent'
  | 'giftEvent'
  | 'followEvent'
  | 'memberEvent'
  | 'shareEvent'

/**
 * Bentuk event yang sudah dinormalisasi ChatEngine.
 *
 * Sengaja datar, bukan union ber-payload: tiap kind mengisi field yang relevan dan
 * membiarkan sisanya di nilai netral. Pemanggil jadi tidak perlu menyempitkan tipe
 * di setiap cabang, dan serialisasi ke WebSocket tetap sepele.
 */
export interface ChatMessage {
  id: string
  kind: ChatEventKind
  platform: ChatPlatform
  username: string
  avatarUrl: string | null
  timestampMs: number
  /** Isi komentar. Kosong untuk kind selain textMessageEvent. */
  text: string
  /** Jumlah like dalam satu event. 0 untuk kind lain. */
  likeCount: number
  giftName: string | null
  giftCount: number
  giftCoins: number
}

export interface ChatMessageInit {
  id: string
  kind: ChatEventKind
  platform: ChatPlatform
  username: string
  avatarUrl?: string | null
  timestampMs?: number
  text?: string
  likeCount?: number
  giftName?: string | null
  giftCount?: number
  giftCoins?: number
}

export function createChatMessage(init: ChatMessageInit): ChatMessage {
  return {
    id: init.id,
    kind: init.kind,
    platform: init.platform,
    username: init.username,
    avatarUrl: init.avatarUrl ?? null,
    timestampMs: init.timestampMs ?? 0,
    text: init.text ?? '',
    likeCount: init.likeCount ?? 0,
    giftName: init.giftName ?? null,
    giftCount: init.giftCount ?? 0,
    giftCoins: init.giftCoins ?? 0,
  }
}

const SYNTHETIC: readonly ChatPlatform[] = ['demo', 'practice', 'creator']

/** Viewer sintetis: statistiknya hanya hidup di memori dan hilang saat match berakhir. */
export function isSyntheticPlatform(platform: ChatPlatform): boolean {
  return SYNTHETIC.includes(platform)
}
