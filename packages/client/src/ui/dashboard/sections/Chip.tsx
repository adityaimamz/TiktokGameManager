import type { ReactElement } from 'react'
import type { ChipTone } from './connection-view.js'

/** `neutral` kini merah: satu-satunya pemakainya adalah koneksi yang TERPUTUS atau GAGAL. */
const TONE_CLASS: Record<ChipTone, string> = {
  neutral: 'chip-off',
  standby: 'chip-standby',
  live: 'chip-live',
}

/** Keadaan dibawa bentuk dan posisi, bukan hanya warna: titik + pil + huruf mono. */
export function Chip({ label, tone }: { label: string; tone: ChipTone }): ReactElement {
  return (
    <span className={`chip ${TONE_CLASS[tone]}`.trim()}>
      <span className="chip-dot" />
      {label}
    </span>
  )
}
