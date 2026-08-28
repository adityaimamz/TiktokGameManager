import type { ReactElement } from 'react'

/**
 * Lencana heksagon: dua garis gradien yang mengunci identitas produk di pojok kiri.
 *
 * Satu komponen, bukan dua salinan: katalog dan ruang kendali memakai lencana yang PERSIS
 * sama dan hanya berbeda baris bawahnya. Menyalinnya berarti keduanya pasti menyimpang —
 * dan yang menyimpang adalah hal pertama yang dilihat creator tiap kali membuka aplikasi.
 */
export function Wordmark({ surface }: { surface: string }): ReactElement {
  return (
    <div className="flex flex-none items-center gap-[11px]">
      <div className="relative grid h-[38px] w-[38px] place-items-center">
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(135deg,#2F80FF,#B02BFF 52%,#FF2D78)',
            clipPath: 'polygon(50% 0,100% 26%,100% 74%,50% 100%,0 74%,0 26%)',
            boxShadow: '0 0 22px rgba(120,80,255,.65)',
          }}
        />
        <div
          className="absolute inset-[1.5px] bg-[#0a0b16]"
          style={{ clipPath: 'polygon(50% 0,100% 26%,100% 74%,50% 100%,0 74%,0 26%)' }}
        />
        <span
          className="relative font-data text-[17px] font-bold"
          style={{
            background: 'linear-gradient(135deg,#6FD0FF,#FF6FA8)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          i
        </span>
      </div>
      <div className="flex flex-col gap-px">
        <span className="font-data text-base font-bold uppercase leading-none tracking-[0.14em]">
          Interactify
        </span>
        <span className="font-ui text-[9.5px] font-semibold uppercase tracking-[0.34em] text-muted">
          / {surface}
        </span>
      </div>
    </div>
  )
}
