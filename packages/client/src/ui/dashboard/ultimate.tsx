import type { ReactElement } from 'react'
import type { NukeType } from '../../games/battle-arena/config/index.js'
import type { SideId } from '../../games/battle-arena/types.js'
import { Icon } from './icons.js'
import type { IconName } from './icons.js'

/**
 * Empat serangan ultimate.
 *
 * Menekan satu tombol menulis `gameplay.nuke.type` ke config lalu menembakkan aksi `nuke`
 * sungguhan ke sisi yang dipilih — memilih jenis ultimate memang keputusan config, dan
 * dropdown jenis di panel setelan menampilkan pilihan terakhir itu.
 *
 * Animasinya TIDAK hidup di sini. Efek nuke lahir di snapshot dan digambar canvas.ts, jadi
 * overlay OBS melihatnya persis seperti preview. Jangan menambahkan animasi DOM di berkas
 * ini: apa pun yang digambar di sini tidak akan pernah sampai ke penonton.
 */

/** Union yang sama persis dengan NukeType — satu daftar, bukan dua yang bisa berbeda. */
export type UltimateKind = NukeType

export interface UltimateButton {
  kind: UltimateKind
  label: string
  icon: IconName
}

export const ULTIMATES: readonly UltimateButton[] = [
  { kind: 'missileRain', label: 'Missile rain', icon: 'missile' },
  { kind: 'laser', label: 'Laser', icon: 'laser' },
  { kind: 'bomb', label: 'Bomb', icon: 'bomb' },
  { kind: 'lightning', label: 'Petir', icon: 'bolt' },
  { kind: 'singularity', label: 'Singularity', icon: 'singularity' },
  { kind: 'chainFreeze', label: 'Chain freeze', icon: 'snowflake' },
]

export interface UltimateButtonsProps {
  side: SideId
  onSide: (side: SideId) => void
  onFire: (kind: UltimateKind) => void
  /** Nama sisi dari config creator, supaya tombol sasaran menyebut nama yang benar. */
  sideNames: { a: string; b: string }
  /** Jenis yang tersimpan di config, ditandai supaya creator tahu mana yang terakhir dipakai. */
  currentKind: UltimateKind
}

/**
 * Isi uji ultimate — TANPA panel sendiri.
 *
 * Ia hidup di dalam accordion "Aksi uji" ([TestActions.tsx](./sections/TestActions.tsx))
 * berdampingan dengan aksi uji lain, bukan sebagai kartu terpisah: keduanya sama-sama alat
 * uji yang hanya disentuh saat menyiapkan sesi.
 */
export function UltimateButtons(props: UltimateButtonsProps): ReactElement {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
          Uji ultimate
        </span>

        {/* Ultimate selalu punya SASARAN. Tanpa pilihan ini tombolnya berbohong soal siapa
            yang kena — dan yang benar-benar terkena damage adalah sisi yang dipilih di sini. */}
        <div className="flex flex-none gap-1" role="group" aria-label="Sasaran ultimate">
          {(['a', 'b'] as const).map((side) => (
            <button
              className="seg-btn px-2.5 py-1 text-[10px]"
              key={side}
              type="button"
              aria-pressed={props.side === side}
              aria-label={`Sasaran ${props.sideNames[side]}`}
              onClick={() => props.onSide(side)}
            >
              {side.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {ULTIMATES.map((ultimate) => (
          <button
            aria-pressed={props.currentKind === ultimate.kind}
            className={`flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-1 py-2 font-data text-[10px] font-bold uppercase tracking-[0.08em] transition-colors ${
              props.currentKind === ultimate.kind
                ? 'border-[#BE96FF]/60 bg-[#A06EFF]/[0.28] text-[#EADFFF]'
                : 'border-white/[0.12] bg-white/[0.045] text-dim hover:bg-white/[0.09]'
            }`}
            key={ultimate.kind}
            type="button"
            onClick={() => props.onFire(ultimate.kind)}
          >
            <Icon name={ultimate.icon} size={12} strokeWidth={2} />
            {ultimate.label}
          </button>
        ))}
      </div>

      <p className="note mt-2">
        Menembakkan nuke sungguhan ke sisi yang dipilih. Penonton di OBS melihat ledakan yang sama.
      </p>
    </div>
  )
}
