import type { PlayerIdentity } from '@lga/shared'

export const DEFAULT_LIMIT = 20
export const MAX_LIMIT = 100

/**
 * Limit yang aneh dijepit, bukan ditolak: sebuah papan peringkat tidak layak error 400.
 *
 * Hidup di sini, bukan di salah satu route, karena dua route memakainya dan "limit yang
 * wajar" hanya boleh punya satu jawaban.
 */
export function parseLimit(value: unknown): number {
  const parsed = Number.parseInt(typeof value === 'string' ? value : '', 10)
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_LIMIT
  return Math.min(parsed, MAX_LIMIT)
}

/**
 * Validasi BENTUK identitas viewer, bukan nilainya.
 *
 * Hidup di sini, bukan di salah satu route, karena dua route memakainya — jalur match dan
 * jalur progres — dan "identitas yang sah" hanya boleh punya satu jawaban.
 */
export function parsePlayerIdentity(raw: unknown): PlayerIdentity | null {
  if (typeof raw !== 'object' || raw === null) return null
  const entry = raw as Record<string, unknown>
  if (entry['platform'] !== 'tiktok') return null
  if (typeof entry['username'] !== 'string' || entry['username'] === '') return null
  const avatar = entry['avatarUrl']
  if (avatar !== null && avatar !== undefined && typeof avatar !== 'string') return null
  return { platform: 'tiktok', username: entry['username'], avatarUrl: avatar ?? null }
}
