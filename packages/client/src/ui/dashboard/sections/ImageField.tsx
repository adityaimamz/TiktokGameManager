import { useId, useState } from 'react'
import type { ReactElement } from 'react'
import { uploadFile } from '../upload.js'

export interface ImageFieldProps {
  label: string
  value: string | null
  onChange: (url: string | null) => void
  /** Diinjeksi di test. */
  upload?: (file: File) => Promise<string | null>
}

export function ImageField(props: ImageFieldProps): ReactElement {
  const id = useId()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const upload = props.upload ?? ((file: File) => uploadFile(file))

  const pick = async (file: File | undefined): Promise<void> => {
    if (file === undefined) return
    setBusy(true)
    setError(null)
    const url = await upload(file)
    setBusy(false)
    if (url === null) {
      // Latar lama dipertahankan: kegagalan unggah tidak boleh menghapus yang sudah tampil.
      setError('Gambar gagal diunggah. Latar sebelumnya dipertahankan.')
      return
    }
    props.onChange(url)
  }

  return (
    <div className="py-1.5">
      <span className="readout-label">{props.label}</span>
      <div className="flex items-center gap-2.5">
        {props.value === null ? null : (
          <img
            className="h-10 w-14 rounded border border-edge object-cover"
            src={props.value}
            alt=""
          />
        )}
        <label className="btn cursor-pointer" htmlFor={id}>
          {busy ? 'Mengunggah…' : 'Ganti'}
        </label>
        <input
          className="hidden"
          id={id}
          type="file"
          aria-label={props.label}
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => void pick(event.target.files?.[0])}
        />
        {props.value === null ? null : (
          <button
            className="panel-action"
            type="button"
            aria-label={`Hapus ${props.label}`}
            onClick={() => props.onChange(null)}
          >
            Hapus
          </button>
        )}
      </div>
      {error === null ? null : (
        <p className="note mt-1 text-tally" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
