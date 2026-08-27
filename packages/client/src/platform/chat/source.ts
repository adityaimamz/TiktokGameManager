import type { ChatMessage, ChatPlatform } from '@lga/shared'

/**
 * Satu asal event chat.
 *
 * Koneksi TikTok nyata dan simulator offline sama-sama memenuhi interface ini dan
 * menghasilkan ChatMessage berbentuk identik — lapisan sesudahnya tidak bisa
 * membedakannya kecuali dari field `platform`.
 */
export interface ChatSource {
  readonly id: string
  readonly platform: ChatPlatform
  /** Mulai memancarkan pesan lewat `emit`. Dipanggil ChatEngine saat start(). */
  connect(emit: (message: ChatMessage) => void): void
  disconnect(): void
}
