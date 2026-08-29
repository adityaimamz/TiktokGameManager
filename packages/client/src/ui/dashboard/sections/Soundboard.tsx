import { useId, useState } from 'react'
import type { ReactElement } from 'react'
import type { CatalogEntry, MediaKind } from '../../../platform/signals/index.js'
import { uploadFile } from '../upload.js'
import {
  CUES_PER_KIND_MAX,
  SOUNDBOARD_TABS,
  cuesOfKind,
  labelFromFilename,
  musicTransport,
  nextCueId,
} from './soundboard-view.js'

export interface SoundboardProps {
  cues: readonly CatalogEntry[]
  onCues: (next: CatalogEntry[]) => void
  onFire: (entry: CatalogEntry) => void
  onStopMusic: () => void
  /**
   * Satu knop untuk seluruh kanal musik.
   *
   * Bukan per-trek: `CatalogEntry.volume` tetap ada tapi diabaikan untuk kind ini, karena
   * delapan slider di kisi dua kolom itu sempit dan creator yang panik di tengah siaran
   * mencari SATU knop.
   */
  musicVolume: number
  onMusicVolume: (volume: number) => void
  /** Id trek yang sedang berputar; null berarti sunyi. */
  playingMusicId: string | null
  /** Diinjeksi di test. */
  upload?: (file: File) => Promise<string | null>
}

/**
 * Kisi cue yang bisa ditekan creator (Req 38 AC9).
 *
 * Panel ini tidak memutar apa pun. Ia memancarkan cue; yang memutarnya adalah tab overlay,
 * karena itu yang ditangkap Browser Source OBS di kanal audionya sendiri.
 */
export function Soundboard(props: SoundboardProps): ReactElement {
  const inputId = useId()
  const [kind, setKind] = useState<MediaKind>('sound')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const upload = props.upload ?? ((file: File) => uploadFile(file))

  const shown = cuesOfKind(props.cues, kind)
  const tab = SOUNDBOARD_TABS.find((entry) => entry.kind === kind) ?? SOUNDBOARD_TABS[0]

  const add = async (file: File | undefined): Promise<void> => {
    if (file === undefined) return
    if (shown.length >= CUES_PER_KIND_MAX) {
      setError(`Maksimal ${CUES_PER_KIND_MAX} cue per tab.`)
      return
    }
    setBusy(true)
    setError(null)
    const url = await upload(file)
    setBusy(false)
    if (url === null) {
      // Daftar lama dipertahankan: unggahan yang gagal tidak boleh menghapus soundboard.
      setError('Berkas gagal diunggah. Daftar sebelumnya dipertahankan.')
      return
    }
    props.onCues([
      ...props.cues,
      {
        id: nextCueId(props.cues, kind),
        kind,
        label: labelFromFilename(file.name),
        url,
        volume: 1,
      },
    ])
  }

  return (
    <section className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 px-3.5 pt-3">
        <span className="panel-title panel-title-sub">Soundboard</span>
        <div className="flex gap-1" role="group" aria-label="Jenis media">
          {SOUNDBOARD_TABS.map((entry) => (
            <button
              aria-pressed={kind === entry.kind}
              className="seg-btn px-2.5 py-1 text-[10px]"
              key={entry.kind}
              onClick={() => {
                setKind(entry.kind)
                setError(null)
              }}
              type="button"
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 px-3.5 py-3">
        {shown.length === 0 ? (
          <p className="note" data-testid="soundboard-empty">
            Belum ada cue di sini. Unggah berkas untuk membuat tombolnya.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-1.5">
            {shown.map((cue) => (
              <li className="flex items-center gap-1" key={cue.id}>
                <button
                  className="btn min-w-0 flex-1 truncate text-left"
                  onClick={() => props.onFire(cue)}
                  type="button"
                >
                  {cue.label}
                </button>
                <button
                  aria-label={`Hapus ${cue.label}`}
                  className="panel-action"
                  onClick={() => props.onCues(props.cues.filter((entry) => entry.id !== cue.id))}
                  type="button"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-2">
          <label className="btn cursor-pointer whitespace-nowrap" htmlFor={inputId}>
            {busy ? 'Mengunggah…' : 'Tambah'}
          </label>
          <input
            accept={tab?.accept}
            aria-label={`Tambah cue ${tab?.label}`}
            className="hidden"
            data-testid="soundboard-file"
            id={inputId}
            onChange={(event) => void add(event.target.files?.[0])}
            type="file"
          />
        </div>

        {kind === 'music' ? (
          <MusicPlayer
            cues={props.cues}
            onFire={props.onFire}
            onStopMusic={props.onStopMusic}
            onVolume={props.onMusicVolume}
            playingId={props.playingMusicId}
            volume={props.musicVolume}
          />
        ) : null}

        {error === null ? null : (
          <p className="note text-tally" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  )
}

/**
 * Kartu pemutar musik: satu nama, satu baris transport, satu slider.
 *
 * Dulu ini sebaris "Stop musik" + slider, dan dua hal hilang di sana: nama trek yang SEDANG
 * berputar tidak pernah tampil, dan mengganti trek berarti turun ke daftar lalu mencari
 * berkasnya. Keduanya paling dibutuhkan persis saat creator sedang siaran dan tidak punya
 * waktu membaca daftar.
 *
 * Tombol tengah PLAY/STOP, bukan pause: kanal musik membuang elemennya saat berhenti dan
 * tidak pernah men-cache trek (`audio-channels.ts`), jadi memutar lagi selalu mulai dari
 * nol. Ikon ⏸ di sini akan menjanjikan sesuatu yang tidak bisa ditepati mesinnya.
 */
function MusicPlayer(props: {
  cues: readonly CatalogEntry[]
  playingId: string | null
  volume: number
  onFire: (entry: CatalogEntry) => void
  onStopMusic: () => void
  onVolume: (volume: number) => void
}): ReactElement | null {
  const transport = musicTransport(props.cues, props.playingId)
  const resume = transport.resume
  // Tanpa satu pun trek musik, kartunya tidak punya apa pun untuk dikendalikan.
  if (resume === null) return null

  const playing = transport.playing
  const step = (entry: CatalogEntry | null): (() => void) | undefined =>
    entry === null ? undefined : () => props.onFire(entry)

  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-edge bg-ink/40 px-3 py-2.5">
      <span
        className="max-w-full truncate text-xs text-signal"
        data-testid="music-now-playing"
        title={playing?.label ?? undefined}
      >
        {playing === null ? 'Tidak ada yang berputar' : `♪ ${playing.label}`}
      </span>

      <div className="flex items-center gap-3">
        <button
          aria-label="Trek sebelumnya"
          className="panel-action text-base disabled:opacity-30"
          data-testid="music-prev"
          disabled={transport.previous === null}
          onClick={step(transport.previous)}
          type="button"
        >
          ⏮
        </button>
        {/*
          * Lingkaran besar, dan sengaja jauh lebih besar dari tetangganya: ini satu-satunya
          * tombol di kartu ini yang creator cari dalam keadaan panik.
          */}
        <button
          aria-label={playing === null ? 'Putar musik' : 'Hentikan musik'}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-signal text-lg text-ink transition hover:opacity-90"
          data-testid="music-toggle"
          onClick={() => (playing === null ? props.onFire(resume) : props.onStopMusic())}
          type="button"
        >
          {playing === null ? '▶' : '■'}
        </button>
        <button
          aria-label="Trek berikutnya"
          className="panel-action text-base disabled:opacity-30"
          data-testid="music-next"
          disabled={transport.next === null}
          onClick={step(transport.next)}
          type="button"
        >
          ⏭
        </button>
      </div>

      <input
        aria-label="Volume musik"
        className="w-full accent-tally"
        max={1}
        min={0}
        onChange={(event) => props.onVolume(Number(event.target.value))}
        step={0.05}
        type="range"
        value={props.volume}
      />
    </div>
  )
}
