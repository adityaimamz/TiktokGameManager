import type { BattleArenaConfig } from '../config/index.js'
import type { AvatarCache } from './avatar-cache.js'
import type { DeathFade } from './death-fade.js'
import type { HpDisplay } from './hp-display.js'
import type { InterpolatedFighter } from './interpolate.js'
import type { StageLayout } from './layout.js'

/**
 * Segala yang dibutuhkan satu frame, dan tidak satu pun di antaranya adalah state game.
 *
 * Tinggal di berkasnya sendiri, bukan di `canvas.ts`, semata karena arah impor: `canvas.ts`
 * memanggil `drawLaser`, dan `laser.ts` butuh tipe ini — keduanya di satu berkas berarti
 * lingkaran yang ditolak dependency-cruiser.
 */
export interface RenderDeps {
  layout: StageLayout
  config: BattleArenaConfig
  avatars: AvatarCache
  /** Gambar latar yang sudah dimuat, atau null bila belum/siap. */
  image?: (url: string) => CanvasImageSource | null
  nowMs: number
  /** Seberapa pudar tiap slot yang mati. Diisi renderer, diamati sebelum menggambar. */
  deathFade: DeathFade
  /** HP yang sedang digambar tiap slot — mengejar nilai sebenarnya, tidak melompat. */
  hpDisplay: HpDisplay
  /**
   * HP yang menggerakkan UKURAN, dilacak terpisah dari yang menggerakkan bar.
   *
   * Dua kurva berbeda dari satu angka yang sama: bar hanya perlu turun mulus, sementara
   * ukuran juga harus naik — cepat dan memantul, supaya gift yang masuk terasa mendarat
   * alih-alih sekadar tercatat.
   */
  sizeDisplay: HpDisplay
  /**
   * prefers-reduced-motion, dibaca sekali di lapisan ui/ dan diteruskan ke sini.
   *
   * Renderer TIDAK memanggil matchMedia sendiri: itu API peramban, dan renderer yang
   * menyentuhnya berhenti murni serta tidak bisa diuji di node.
   */
  reducedMotion: boolean
  /**
   * Fighter yang SUDAH diinterpolasi untuk frame ini.
   *
   * Ada di sini supaya varian ultimate bisa mengejar fighter tertentu tanpa mengubah tanda
   * tangan keempat berkas varian sekaligus. `RenderDeps` memang sudah berperan sebagai
   * konteks satu frame — layout, nowMs, deathFade, hpDisplay — dan ini anggota yang sejenis.
   *
   * PERINGATAN yang sama dengan SnapshotView: array-nya dipakai ulang antar-frame dan boleh
   * lebih panjang dari yang berlaku. Selalu berhenti di `fighterCount`.
   */
  fighters: readonly InterpolatedFighter[]
  fighterCount: number
}
