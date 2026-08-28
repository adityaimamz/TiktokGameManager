import { useEffect } from 'react'
import type { ReactElement } from 'react'

export interface LeaveDialogProps {
  onCancel: () => void
  onLeave: () => void
}

/**
 * Modal sendiri, bukan `confirm()` bawaan browser — supaya kalimatnya bisa menyebut apa yang
 * sebenarnya mati, bukan "Are you sure?".
 *
 * DUA tombol, bukan tiga. Pernah ada "Putuskan & keluar" ketiga di sini dan ia dibuang: memutus
 * koneksi TikTok sudah satu klik jauhnya di panel Koneksi yang creator lihat lagi begitu masuk
 * kembali, jadi tombolnya cuma pintasan permanen untuk aksi yang jarang — dan bertiga mereka
 * tidak muat sebaris, jadi dialognya pecah dua baris dan tidak ada yang terlihat utama.
 * Konsekuensinya disengaja: meninggalkan ruang kendali TIDAK memutus koneksi, dan kalimat di
 * bawah mengatakannya apa adanya.
 */
export function LeaveDialog(props: LeaveDialogProps): ReactElement {
  const { onCancel } = props

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/80 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="leave-title"
    >
      <div className="stack stack-hi w-full max-w-[24rem] rounded-xl p-5">
        <h2 className="panel-title mb-2.5" id="leave-title">
          Tinggalkan ruang kendali?
        </h2>
        <p className="note mb-5 leading-relaxed">
          Match yang sedang berjalan berhenti, kill feed dan siaran ke overlay OBS ikut mati.
          Koneksi TikTok tetap hidup, dan statistik yang belum tersimpan dikirim dulu.
        </p>
        {/*
          * Tanpa `flex-wrap`, dan itu bukan kelalaian: dua tombol memang harus muat sebaris di
          * lebar ini. Kalau suatu hari labelnya tidak muat, yang salah labelnya.
          */}
        <div className="flex justify-end gap-2">
          <button className="btn btn-quiet" type="button" onClick={onCancel}>
            Batal
          </button>
          <button className="btn btn-primary" type="button" onClick={props.onLeave}>
            Tinggalkan
          </button>
        </div>
      </div>
    </div>
  )
}
