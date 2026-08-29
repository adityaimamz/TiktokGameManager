import { useId, useState } from 'react'
import type { ReactElement } from 'react'
import { MAX_UPLOAD_BYTES } from '@lga/shared'
import { FILLER_ITEMS_MAX } from '../../../games/battle-arena/config/index.js'
import type {
  FillerConfig,
  FillerItem,
  FillerKind,
} from '../../../games/battle-arena/config/index.js'
import { uploadFile } from '../upload.js'
import { NumberField, Toggle } from './Field.js'

export interface StageFillerProps {
  filler: FillerConfig
  onFiller: (next: FillerConfig) => void
  /** Diinjeksi di test. */
  upload?: (file: File) => Promise<string | null>
}

/** Jenis ditebak dari ekstensi; apa pun yang bukan video dianggap gambar. */
function kindFromUrl(url: string): FillerKind {
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url) ? 'video' : 'image'
}

/** Nama pendek yang bisa dibaca creator di daftar — ekor URL, tanpa query. */
function labelFromUrl(url: string): string {
  const withoutQuery = url.split(/[?#]/)[0] ?? url
  const tail = withoutQuery.split('/').filter((part) => part !== '').pop() ?? url
  return tail.slice(0, 28)
}

/**
 * Isi band bawah panggung: daftar klip dan gambar yang berputar (§6 spec Plan 11).
 *
 * Ia ada untuk mematahkan monotoni siaran, yang dihukum jangkauannya. Bentuknya sengaja
 * meniru `Soundboard` — daftar berkas, tombol tambah, tombol buang — karena masalahnya sama.
 */
export function StageFiller(props: StageFillerProps): ReactElement {
  const inputId = useId()
  const [link, setLink] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const upload = props.upload ?? ((file: File) => uploadFile(file))

  const { filler, onFiller } = props

  const append = (item: FillerItem): boolean => {
    if (filler.items.length >= FILLER_ITEMS_MAX) {
      setError(`Maksimal ${FILLER_ITEMS_MAX} item.`)
      return false
    }
    setError(null)
    onFiller({ ...filler, items: [...filler.items, item] })
    return true
  }

  const addLink = (): void => {
    const url = link.trim()
    if (url === '') return
    if (append({ url, kind: kindFromUrl(url) })) setLink('')
  }

  const addFile = async (file: File | undefined): Promise<void> => {
    if (file === undefined) return
    if (filler.items.length >= FILLER_ITEMS_MAX) {
      setError(`Maksimal ${FILLER_ITEMS_MAX} item.`)
      return
    }
    setBusy(true)
    setError(null)
    const url = await upload(file)
    setBusy(false)
    if (url === null) {
      // Daftar lama dipertahankan: unggahan yang gagal tidak boleh menghapus playlist.
      setError('Berkas gagal diunggah. Daftar sebelumnya dipertahankan.')
      return
    }
    append({ url, kind: kindFromUrl(url) })
  }

  const full = filler.items.length >= FILLER_ITEMS_MAX

  return (
    <section className="flex min-h-0 flex-col">
      {/*
        * Hitungan di KEPALA panel, bukan sebagai galat setelah item ke-9 ditolak.
        *
        * Batas yang hanya muncul sebagai pesan kegagalan mengajarkannya dengan cara yang
        * paling mahal; angka yang selalu terlihat membuatnya tidak pernah jadi kejutan.
        */}
      <div className="flex items-center justify-between gap-3 px-3.5 pt-3">
        <span className="panel-title panel-title-sub">Media band bawah</span>
        <span className="text-[10px] tabular-nums text-muted" data-testid="filler-count">
          {filler.items.length}/{FILLER_ITEMS_MAX}
        </span>
      </div>

      <div className="flex flex-col gap-2.5 px-3.5 py-3">
        <Toggle
          label="Aktif"
          hint="Mengisi separuh kiri band bawah dengan klip yang berputar."
          checked={filler.enabled}
          onChange={(enabled) => onFiller({ ...filler, enabled })}
        />

        {filler.items.length === 0 ? (
          <p className="note" data-testid="filler-empty">
            Belum ada isi. Unggah klip atau tempel link berkasnya.
          </p>
        ) : (
          <ul className="flex flex-col gap-1 rounded-lg border border-edge bg-ink/40 p-1.5">
            {filler.items.map((item, position) => (
              <li
                className="flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-edge/40"
                data-testid="filler-item"
                key={item.url}
              >
                <span className="shrink-0 text-[10px] tabular-nums text-muted">
                  {position + 1}
                </span>
                <span className="shrink-0 text-xs">{item.kind === 'video' ? '▶' : '🖼'}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-signal" title={item.url}>
                  {labelFromUrl(item.url)}
                </span>
                <button
                  aria-label={`Hapus ${item.url}`}
                  className="panel-action shrink-0"
                  onClick={() =>
                    onFiller({
                      ...filler,
                      items: filler.items.filter((_, index) => index !== position),
                    })
                  }
                  type="button"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        {/*
          * Unggah dan tempel-link dalam SATU baris.
          *
          * Keduanya menjawab pertanyaan yang sama — "dari mana klipnya" — dan dua baris
          * terpisah membuat panel ini setinggi kartu Game settings untuk empat kontrol.
          */}
        <div className="flex items-center gap-1.5">
          <label
            className={`btn shrink-0 whitespace-nowrap ${full ? 'pointer-events-none opacity-40' : 'cursor-pointer'}`}
            htmlFor={inputId}
          >
            {busy ? 'Mengunggah…' : 'Unggah'}
          </label>
          <input
            accept="video/mp4,video/webm,image/png,image/jpeg,image/webp,image/gif"
            aria-label="Unggah media band bawah"
            className="hidden"
            data-testid="filler-file"
            disabled={full}
            id={inputId}
            onChange={(event) => void addFile(event.target.files?.[0])}
            type="file"
          />
          <input
            aria-label="Link berkas media"
            className="min-w-0 flex-1 rounded border border-edge bg-ink px-2 py-1 text-xs text-signal"
            data-testid="filler-link"
            onChange={(event) => setLink(event.target.value)}
            onKeyDown={(event) => {
              // Enter menambahkan: mengetik link lalu harus memindahkan tangan ke mouse untuk
              // satu tombol di sebelahnya adalah gesekan yang tidak dibeli apa pun.
              if (event.key === 'Enter') addLink()
            }}
            placeholder="https://…/klip.mp4"
            type="text"
            value={link}
          />
          <button
            aria-label="Tambah link"
            className="btn shrink-0"
            data-testid="filler-link-add"
            disabled={full}
            onClick={addLink}
            type="button"
          >
            +
          </button>
        </div>

        <NumberField
          label="Durasi gambar (detik)"
          field="filler.imageDurationSec"
          value={filler.imageDurationSec}
          onCommit={(imageDurationSec) => onFiller({ ...filler, imageDurationSec })}
        />

        <p className="note" data-testid="filler-hint">
          Berkas video (.mp4/.webm) maks {Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB — link
          YouTube bukan berkas dan tidak bisa dipakai. Unggah klip bebas-lisensi, tanpa trek audio.
        </p>

        {error === null ? null : (
          <p className="note text-tally" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  )
}
