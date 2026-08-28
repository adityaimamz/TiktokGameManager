import { useEffect } from 'react'
import type { ReactElement } from 'react'

export interface LeaveDialogProps {
  onCancel: () => void
  /** `true` berarti putuskan koneksi TikTok sekalian. */
  onLeave: (disconnect: boolean) => void
}

/**
 * Modal sendiri, bukan `confirm()` bawaan browser.
 *
 * Bawaan hanya punya dua tombol, sementara pilihan ketiga — pergi TANPA memutus koneksi —
 * justru inti keputusannya: creator yang cuma melirik katalog tidak boleh dipaksa menyambung
 * ulang saat kembali, dan sambung ulang berarti jeda chat di tengah siaran.
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
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="leave-title"
    >
      <div className="stack w-full max-w-[27rem] rounded-xl p-5">
        <h2 className="panel-title mb-2" id="leave-title">
          Tinggalkan ruang kendali?
        </h2>
        <p className="note mb-4 leading-relaxed">
          Match yang sedang berjalan berhenti, kill feed dan siaran ke overlay OBS ikut mati.
          Statistik yang belum tersimpan dikirim dulu sebelum keluar.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            className="btn-icon px-3 py-1.5 text-[12px]"
            type="button"
            onClick={onCancel}
          >
            Batal
          </button>
          <button
            className="btn-primary rounded-[9px] border px-3 py-1.5 text-[12px]"
            type="button"
            onClick={() => props.onLeave(false)}
          >
            Biarkan tersambung
          </button>
          <button
            className="btn-danger rounded-[9px] border px-3 py-1.5 text-[12px]"
            type="button"
            onClick={() => props.onLeave(true)}
          >
            Putuskan &amp; keluar
          </button>
        </div>
      </div>
    </div>
  )
}
