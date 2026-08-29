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

export interface MusicTransport {
  /** Trek yang sedang berputar, atau null saat sunyi. */
  playing: CatalogEntry | null
  /** Yang ditembakkan tombol tengah saat sunyi — trek pertama, supaya ▶ tidak pernah mati. */
  resume: CatalogEntry | null
  previous: CatalogEntry | null
  next: CatalogEntry | null
}

/**
 * Isi kartu pemutar musik, dihitung sekali dari katalog.
 *
 * MELINGKAR: dari trek terakhir, ⏭ kembali ke yang pertama. Daftar musik creator biasanya
 * tiga sampai lima berkas dan dipakai berjam-jam; tombol yang mati di ujung berarti creator
 * harus turun ke daftar dan mengklik manual, persis di saat ia paling tidak punya waktu.
 *
 * `previous`/`next` null HANYA saat daftarnya kosong atau berisi satu — di sana melingkar
 * berarti menembak ulang trek yang sama, yang justru MEMULAINYA DARI NOL karena kanal musik
 * tidak men-cache elemennya. Tombol yang mati lebih jujur daripada tombol yang diam-diam
 * mengulang.
 */
export function musicTransport(
  cues: readonly CatalogEntry[],
  playingId: string | null,
): MusicTransport {
  const tracks = cuesOfKind(cues, 'music')
  const playing = tracks.find((cue) => cue.id === playingId) ?? null
  const index = playing === null ? -1 : tracks.indexOf(playing)
  const step = (offset: number): CatalogEntry | null => {
    if (tracks.length < 2 || index < 0) return null
    return tracks[(index + offset + tracks.length) % tracks.length] ?? null
  }

  return {
    playing,
    resume: playing ?? tracks[0] ?? null,
    previous: step(-1),
    next: step(1),
  }
}
