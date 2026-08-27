import { isSyntheticPlatform } from '@lga/shared'
import type { ChatPlatform } from '@lga/shared'

/**
 * Kunci seorang viewer, lintas game dan lintas sesi.
 *
 * Berbeda dari `fighterKey()` milik Battle Arena, yang memakai username apa adanya karena
 * ia hanya perlu unik selama satu match. Kunci ini menyeberang ke database, tempat
 * `UNIQUE (platform, username)` berlaku selamanya — jadi ia menormalkan huruf besar-kecil
 * dan '@' yang sering ikut tersalin, supaya "Budi" hari ini dan "budi" besok tetap orang
 * yang sama.
 *
 * Melempar `TypeError` bila username menormalkan menjadi kosong ('', '   ', '@', ' @@ '):
 * tanpa penjagaan ini, semua input rusak tadi akan bertumpuk pada satu baris identitas
 * yang sama pada constraint UNIQUE yang berlaku selamanya. Ini adalah kesalahan
 * pemrograman di hulu, bukan kondisi runtime yang wajar — `mapTikTokEvent` sudah
 * membuang event chat yang tidak membawa username, jadi tidak ada input sah yang bisa
 * sampai ke fungsi ini dengan username kosong.
 */
export function identityKey(platform: ChatPlatform, username: string): string {
  const normalized = username.trim().replace(/^@+/, '').trim().toLowerCase()
  if (normalized === '') {
    throw new TypeError(`identityKey: username for platform "${platform}" normalises to empty`)
  }
  return `${platform}:${normalized}`
}

/** Hanya viewer sungguhan yang boleh menyentuh database (P5). */
export function isPersistableIdentity(platform: ChatPlatform): boolean {
  return !isSyntheticPlatform(platform)
}
