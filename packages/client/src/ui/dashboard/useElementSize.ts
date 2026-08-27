import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

export interface Size {
  width: number
  height: number
}

/**
 * Ukuran sebuah elemen, dipantau lewat ResizeObserver.
 *
 * Canvas butuh piksel sungguhan — `width`/`height` atribut, bukan CSS — jadi monitor tidak
 * bisa diskalakan dengan `aspect-ratio` saja. `fallback` dipakai sampai pengukuran pertama
 * tiba DAN di lingkungan tanpa ResizeObserver (jsdom), sehingga test komponen tetap
 * merender panggung berukuran wajar alih-alih 0×0.
 */
export function useElementSize<T extends HTMLElement>(
  ref: RefObject<T | null>,
  fallback: Size,
): Size {
  const [size, setSize] = useState<Size>(fallback)
  const last = useRef(fallback)

  useEffect(() => {
    const element = ref.current
    if (element === null || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (box === undefined) return
      // Pembulatan ke piksel bulat: pecahan membuat canvas dirender ulang tiap frame saat
      // jendela diseret, tanpa satu piksel pun berubah di layar.
      const next = { width: Math.round(box.width), height: Math.round(box.height) }
      if (next.width === last.current.width && next.height === last.current.height) return
      last.current = next
      setSize(next)
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return size
}

/** Kotak 9:16 terbesar yang muat, dibulatkan supaya canvas tidak pernah pecahan piksel. */
export function fitPortrait(available: Size, maxHeight: number): Size {
  const height = Math.max(0, Math.min(available.height, maxHeight, (available.width * 16) / 9))
  return { width: Math.round((height * 9) / 16), height: Math.round(height) }
}
