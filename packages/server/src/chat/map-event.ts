import { createChatMessage } from '@lga/shared'
import type { ChatEventKind, ChatMessage } from '@lga/shared'

/**
 * Payload dari `tiktok-live-connector` datang sebagai `unknown`.
 *
 * Kita tidak memakai tipe library-nya dengan sengaja: bentuknya berubah antar-rilis, dan
 * satu perubahan minor tidak boleh membuat build gagal. Semua pembacaan lewat pembantu di
 * bawah, yang mengembalikan nilai netral untuk apa pun yang tidak sesuai harapan.
 *
 * Yang dibaca di sini adalah protobuf yang SUDAH di-decode dan sama sekali BELUM diratakan
 * — `processDecodedData` di library meneruskan `data` apa adanya. Jadi tidak ada
 * `uniqueId`, `comment`, atau `giftName` di akar payload: pengirimnya bersarang di
 * `user`, teksnya di `content`, dan gift-nya di `gift`. Versi pertama file ini menebak
 * bentuk v1 yang rata, jadi `username` selalu kosong dan SETIAP event live jatuh ke
 * `null` — komentar sungguhan tidak pernah sampai ke layar, dan test-nya tetap hijau
 * karena fixture-nya ikut mengarang bentuk yang sama.
 */
type Raw = Record<string, unknown>

function asRecord(value: unknown): Raw | null {
  return typeof value === 'object' && value !== null ? (value as Raw) : null
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/** Nama event library → kind yang dipakai seluruh sisa aplikasi. */
const KIND_BY_EVENT: Readonly<Record<string, ChatEventKind>> = {
  chat: 'textMessageEvent',
  like: 'likeEvent',
  gift: 'giftEvent',
  follow: 'followEvent',
  member: 'memberEvent',
  share: 'shareEvent',
}

/** Nama event yang dipetakan menjadi ChatMessage. Sisanya ditangani di tempat lain. */
export const MAPPED_EVENTS: readonly string[] = Object.keys(KIND_BY_EVENT)

/**
 * Handle penonton.
 *
 * `displayId` adalah @handle yang unik — padanan `uniqueId` di v1 — dan itulah identitas
 * yang dipakai registry fighter maupun leaderboard. `nickname` hanya cadangan supaya
 * penonton yang handle-nya tidak ikut terkirim tetap bisa bermain, bukan pilihan pertama:
 * dua orang bisa punya nickname yang sama.
 */
function usernameOf(user: Raw | null): string {
  if (user === null) return ''
  const handle = str(user['displayId']).trim()
  return handle === '' ? str(user['nickname']).trim() : handle
}

function avatarOf(user: Raw | null): string | null {
  const list = asRecord(user?.['avatarThumb'])?.['urlList']
  if (!Array.isArray(list)) return null
  const first = list.find((url) => typeof url === 'string' && url !== '')
  return typeof first === 'string' ? first : null
}

/**
 * Event mentah → `ChatMessage`, atau `null` bila tidak bisa dipakai.
 *
 * `null` bukan kondisi error: `roomUser` memang tidak menghasilkan pesan (ia hanya
 * memperbarui viewer count), dan event tanpa username tidak bisa diatribusikan ke
 * siapa pun. Keduanya dibuang diam-diam sesuai Req 17 AC6.
 */
export function mapTikTokEvent(
  name: string,
  payload: unknown,
  ctx: { id: string; nowMs: number },
): ChatMessage | null {
  const kind = KIND_BY_EVENT[name]
  if (kind === undefined) return null

  const raw = asRecord(payload)
  if (raw === null) return null

  const username = usernameOf(asRecord(raw['user']))
  if (username === '') return null

  const gift = kind === 'giftEvent' ? asRecord(raw['gift']) : null
  // Gift yang bisa di-combo datang berkali-kali selama streak-nya berjalan: repeatCount
  // menanjak 1,2,3… dan hanya frame terakhir yang bertanda `repeatEnd`. Menerima semuanya
  // berarti menagih 1+2+3+…+n koin dan melepas n ultimate untuk satu kiriman.
  if (gift?.['combo'] === true && num(raw['repeatEnd']) !== 1) return null

  // repeatCount 0 tidak masuk akal untuk gift yang benar-benar terkirim.
  const giftCount = kind === 'giftEvent' ? Math.max(1, num(raw['repeatCount'])) : 0
  const giftName = str(gift?.['name'])

  return createChatMessage({
    id: ctx.id,
    kind,
    platform: 'tiktok',
    username,
    avatarUrl: avatarOf(asRecord(raw['user'])),
    timestampMs: ctx.nowMs,
    text: kind === 'textMessageEvent' ? str(raw['content']) : '',
    likeCount: kind === 'likeEvent' ? num(raw['count']) : 0,
    giftName: giftName === '' ? null : giftName,
    giftCount,
    giftCoins: kind === 'giftEvent' ? giftCount * num(gift?.['diamondCount']) : 0,
  })
}

/**
 * Viewer count dari event `roomUser`.
 *
 * Terpisah dari `mapTikTokEvent` karena hasilnya bukan pesan chat melainkan pembaruan
 * status koneksi — dua tujuan berbeda, jadi dua fungsi.
 *
 * `total` datang sebagai string (konvensi protobuf TikTok untuk field int64), bukan
 * `viewerCount` — `tiktok-live-connector@2.x` tidak pernah mengirim field bernama itu.
 */
export function readViewerCount(payload: unknown): number | null {
  const raw = asRecord(payload)
  if (raw === null) return null
  const value = raw['total']
  if (typeof value !== 'string' || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
