import { Component, useEffect } from 'react'
import type { ErrorInfo, ReactElement, ReactNode } from 'react'

/** Penanda sesi supaya pemulihan overlay tidak pernah jadi lingkaran muat-ulang. */
const RELOADED_KEY = 'lga.overlay.reloaded'

/** Jeda sebelum overlay memuat ulang dirinya. Cukup lama untuk terbaca, cukup singkat untuk siaran. */
export const OVERLAY_RELOAD_MS = 3_000

export interface ErrorBoundaryProps {
  children?: ReactNode
  /**
   * Apa yang digambar sebagai ganti anak yang jatuh.
   *
   * Dibiarkan kosong berarti TIDAK menggambar apa pun, dan itu yang dipakai overlay OBS:
   * panel kesalahan di sana akan terbakar ke siaran creator.
   */
  fallback?: ReactNode
  /** Default `console.error`. Ada supaya test tidak perlu memata-matai console. */
  onError?: (error: unknown) => void
}

interface ErrorBoundaryState {
  failed: boolean
}

/**
 * Satu-satunya penahan exception render yang React punya.
 *
 * Yang ia lakukan: mengubah layar putih tanpa jalan keluar menjadi sesuatu yang terlihat.
 * Yang ia TIDAK lakukan: menyelamatkan match. Subtree yang gagal tetap di-unmount dan
 * engine yang hidup di dalamnya tetap berhenti bersama effect cleanup-nya. Menyelamatkan
 * match menuntut engine keluar dari pohon React sepenuhnya — keputusan tersendiri, bukan
 * sesuatu yang bisa ditambal dari sini.
 *
 * Komponen kelas karena memang tidak ada padanan hook-nya: `getDerivedStateFromError` dan
 * `componentDidCatch` hanya ada di kelas.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    if (this.props.onError !== undefined) {
      this.props.onError(error)
      return
    }
    console.error('[ui] render gagal', error, info.componentStack)
  }

  override render(): ReactNode {
    // Sengaja TIDAK mencoba melanjutkan render dari state yang sudah rusak: itu persis cara
    // membuat bug kedua yang lebih sulit dilacak daripada yang pertama.
    if (this.state.failed) return this.props.fallback ?? null
    return this.props.children
  }
}

export interface OverlayRecoveryProps {
  /** Default `window.location.reload()`. Diinjeksi supaya test tidak memuat ulang jsdom. */
  reload?: () => void
  delayMs?: number
}

/**
 * Overlay OBS tidak ada yang menunggui.
 *
 * Tanpa ini, satu exception render berarti panggung kosong sampai siaran selesai dan creator
 * mungkin tidak pernah menyadarinya. Sekali saja — `sessionStorage` menahan penandanya —
 * supaya kesalahan yang deterministik tidak berubah jadi lingkaran muat-ulang.
 */
export function OverlayRecovery(props: OverlayRecoveryProps = {}): ReactElement | null {
  const reload = props.reload
  const delayMs = props.delayMs ?? OVERLAY_RELOAD_MS

  useEffect(() => {
    try {
      if (sessionStorage.getItem(RELOADED_KEY) === '1') return
      sessionStorage.setItem(RELOADED_KEY, '1')
    } catch {
      // Mode privat menolak sessionStorage. Lanjut tanpa penjaga: satu muat ulang yang
      // mungkin berulang masih lebih baik daripada overlay yang mati diam-diam.
    }
    const handle = setTimeout(() => {
      if (reload !== undefined) {
        reload()
        return
      }
      window.location.reload()
    }, delayMs)
    return () => clearTimeout(handle)
  }, [reload, delayMs])

  return null
}
