import type { ReactElement } from 'react'

/**
 * Ikon garis 24×24, diambil dari desain Interactify.
 *
 * Satu berkas berisi jalur mentahnya, bukan sebuah paket ikon: yang dipakai hanya belasan
 * bentuk dan semuanya bergaya sama (stroke 2.2, ujung bulat). Warna selalu `currentColor`
 * supaya pemanggil cukup mengatur `color` atau `stroke` lewat kelas atau style.
 */
const PATHS: Record<string, readonly string[]> = {
  copy: [
    'M9 9h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2z',
    'M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  ],
  muted: ['M11 5 6 9H2v6h4l5 4z', 'm22 9-6 6M16 9l6 6'],
  sound: ['M11 5 6 9H2v6h4l5 4z', 'M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13'],
  expand: ['M3 9V4h5M21 9V4h-5M3 15v5h5M21 15v5h-5'],
  gear: [
    'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z',
    'M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.33-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6h.08A1.7 1.7 0 0 0 10 3.05V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.08a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z',
  ],
  note: ['M12 20v-8M12 12a5 5 0 0 0 5-5V4h-3', 'M12 16.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z'],
  chart: ['M3 17l5-6 4 4 5-8 4 5'],
  trophy: ['M6 4h12v4a6 6 0 0 1-12 0z', 'M6 6H3v2a4 4 0 0 0 3 3.9M18 6h3v2a4 4 0 0 1-3 3.9M9 20h6M12 14v6'],
  bolt: ['M13 2 4 14h7l-1 8 9-12h-7z'],
  users: [
    'M16 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2',
    'M13 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z',
    'M20 20v-2a4 4 0 0 0-3-3.8',
  ],
  reset: ['M3 12a9 9 0 1 0 3-6.7L3 8', 'M3 3v5h5'],
  chat: ['M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z'],
  bell: ['M18 9a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8', 'M13.7 21a2 2 0 0 1-3.4 0'],
  play: ['M7 4v16l13-8z'],
  shield: ['M12 3 4 6v6c0 4.4 3.2 8.2 8 9 4.8-.8 8-4.6 8-9V6z', 'm9 12 2 2 4-4'],
  plus: ['M12 5v14M5 12h14'],
  missile: ['M12 2c2.5 3 3.5 6 3.5 9L12 22 8.5 11C8.5 8 9.5 5 12 2z', 'M8.5 13 5 17M15.5 13 19 17'],
  laser: ['M2 12h13', 'm15 8 6 4-6 4z'],
  bomb: ['M17 15a6 6 0 1 1-12 0 6 6 0 0 1 12 0z', 'm15.5 8.5 2-2M19 4l1.5-1.5M18 8h2'],
  gift: ['M20 12v9H4v-9', 'M2 7h20v5H2z', 'M12 21V7', 'M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7z', 'M12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z'],
  heart: ['M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 21.5l8.8-9.1a5 5 0 0 0 0-6.8z'],
  swords: ['M14.5 14.5 21 21M3 3l7 7', 'M3 21l7-7M21 3l-7 7'],
  pause: ['M8 4v16M16 4v16'],
  stop: ['M6 6h12v12H6z'],
  send: ['M22 2 11 13', 'M22 2 15 22l-4-9-9-4z'],
  singularity: ['M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0', 'M12 12m-9 0a9 9 0 1 0 18 0 9 9 0 1 0-18 0'],
  snowflake: ['M12 2v20', 'M4.2 7 19.8 17', 'M19.8 7 4.2 17'],
}

/** Nama ikon yang tersedia — dipakai supaya salah ketik jadi galat tipe, bukan kotak kosong. */
export type IconName = keyof typeof PATHS

export interface IconProps {
  name: IconName
  size?: number
  className?: string
  strokeWidth?: number
  /** `true` untuk bentuk pejal seperti tombol play. */
  filled?: boolean
}

export function Icon({
  name,
  size = 14,
  className,
  strokeWidth = 2.2,
  filled = false,
}: IconProps): ReactElement {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {(PATHS[name] ?? []).map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
