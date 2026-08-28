import type { ComponentType, ReactElement } from 'react'
import {
  ArrowCounterClockwise,
  ArrowsOut,
  Atom,
  Bell,
  Bomb,
  Broadcast,
  ChartLineUp,
  ChatCircleDots,
  Copy,
  GearSix,
  Gift,
  Heart,
  Lightning,
  MusicNotes,
  PaperPlaneTilt,
  Pause,
  Play,
  Plus,
  Rocket,
  ShieldCheck,
  Snowflake,
  SpeakerSimpleHigh,
  SpeakerSimpleX,
  Stop,
  Sword,
  Trophy,
  UsersThree,
} from '@phosphor-icons/react'
import type { IconProps as PhosphorIconProps } from '@phosphor-icons/react'

/**
 * Wrapper tipis di atas Phosphor.
 *
 * Sebelumnya berkas ini memuat jalur SVG-nya sendiri — belasan bentuk bergaya Feather yang
 * digambar tangan. Itu menyimpan dua masalah: ketebalan garisnya hanya konsisten selama
 * tidak ada yang menambah bentuk baru, dan bentuk-bentuknya persis yang dipakai setiap
 * antarmuka buatan-AI lain. Sekarang bentuknya datang dari satu keluarga terawat.
 *
 * Nama internalnya (`chart`, `bolt`, `swords`) DIPERTAHANKAN, jadi tidak ada satu pun call
 * site yang berubah — dan salah ketik tetap jadi galat tipe, bukan kotak kosong.
 */
const MAP: Record<string, ComponentType<PhosphorIconProps>> = {
  copy: Copy,
  muted: SpeakerSimpleX,
  sound: SpeakerSimpleHigh,
  expand: ArrowsOut,
  gear: GearSix,
  note: MusicNotes,
  chart: ChartLineUp,
  trophy: Trophy,
  bolt: Lightning,
  users: UsersThree,
  reset: ArrowCounterClockwise,
  chat: ChatCircleDots,
  bell: Bell,
  play: Play,
  shield: ShieldCheck,
  plus: Plus,
  missile: Rocket,
  // Phosphor tidak punya berkas laser; busur sepusat `Broadcast` yang paling mendekati.
  laser: Broadcast,
  bomb: Bomb,
  gift: Gift,
  heart: Heart,
  swords: Sword,
  pause: Pause,
  stop: Stop,
  send: PaperPlaneTilt,
  singularity: Atom,
  snowflake: Snowflake,
}

/** Nama ikon yang tersedia — dipakai supaya salah ketik jadi galat tipe, bukan kotak kosong. */
export type IconName = keyof typeof MAP

export interface IconProps {
  name: IconName
  size?: number
  className?: string
  /**
   * Diterima demi kompatibilitas dengan call site lama, lalu diabaikan: Phosphor mengatur
   * ketebalan lewat `weight`, dan SATU berat untuk semua ikon memang yang diinginkan.
   */
  strokeWidth?: number
  /** `true` untuk glyph pejal seperti tombol play. */
  filled?: boolean
}

export function Icon({ name, size = 14, className, filled = false }: IconProps): ReactElement {
  const Glyph = MAP[name] as ComponentType<PhosphorIconProps>
  return (
    <Glyph
      size={size}
      className={className}
      weight={filled ? 'fill' : 'regular'}
      color="currentColor"
      aria-hidden="true"
    />
  )
}
