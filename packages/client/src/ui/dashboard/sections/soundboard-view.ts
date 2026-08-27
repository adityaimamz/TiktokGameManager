import type { CatalogEntry, MediaKind } from '../../../platform/signals/index.js'

export interface SoundboardTab {
  kind: MediaKind
  label: string
  /** Nilai atribut `accept` pada input berkas. Server yang menegakkannya, ini hanya penyaring. */
  accept: string
}

export const SOUNDBOARD_TABS: readonly SoundboardTab[] = [
  { kind: 'sound', label: 'Sounds', accept: 'audio/mpeg' },
  { kind: 'gif', label: 'GIFs', accept: 'image/gif,image/png,image/webp' },
  { kind: 'music', label: 'Music', accept: 'audio/mpeg' },
]

/** Batas kasar supaya localStorage tidak dipenuhi ratusan entri yang tidak pernah diklik. */
export const CUES_PER_KIND_MAX = 24
const LABEL_MAX = 24

export function cuesOfKind(cues: readonly CatalogEntry[], kind: MediaKind): readonly CatalogEntry[] {
  return cues.filter((cue) => cue.kind === kind)
}

export function labelFromFilename(name: string): string {
  const withoutExtension = name.replace(/\.[^.]+$/, '').trim()
  if (withoutExtension === '') return 'cue'
  return withoutExtension.slice(0, LABEL_MAX)
}

/**
 * Id berikutnya untuk sebuah jenis.
 *
 * Menghitung dari angka TERBESAR yang sudah ada, bukan dari panjang daftar: menghapus cue di
 * tengah lalu menambah yang baru tidak boleh menghasilkan id yang bentrok dengan cue yang
 * masih ditunjuk sebuah alert.
 */
export function nextCueId(cues: readonly CatalogEntry[], kind: MediaKind): string {
  const used = cues
    .filter((cue) => cue.id.startsWith(`${kind}-`))
    .map((cue) => Number.parseInt(cue.id.slice(kind.length + 1), 10))
    .filter((value) => Number.isFinite(value))
  return `${kind}-${Math.max(0, ...used) + 1}`
}
