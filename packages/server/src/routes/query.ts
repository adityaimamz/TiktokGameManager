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
