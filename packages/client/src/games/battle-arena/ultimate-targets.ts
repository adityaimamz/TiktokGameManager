import { ULTIMATE_MAX_TARGETS } from '@lga/shared'
import { sideCenter } from './arena.js'
import type { BattleArenaConfig, NukeType } from './config/index.js'
import type { BattleArenaState } from './state.js'
import type { Fighter, SideId } from './types.js'

/**
 * Siapa yang dibidik satu ultimate, dipilih SAAT TEMBAK.
 *
 * Ini membalik aturan Plan 6 yang memilih korban saat mendarat, dan alasannya ada di
 * renderer: rudal yang mengejar harus tahu sasarannya sejak diluncurkan, atau tidak ada yang
 * bisa dikejar. Yang menjaga tidak adanya damage anumerta karena itu bukan lagi pemilihan
 * yang terlambat, melainkan VALIDASI ULANG saat mendarat di `combat.ts`.
 */

/**
 * Jumlah sasaran yang dikunci.
 *
 * Hanya `missileRain` yang berskala menurut tier — tiga varian lain punya satu sasaran utama,
 * dan yang membesar bagi mereka adalah RADIUS ledakannya, yang baru diselesaikan saat
 * mendarat.
 */
export function targetCountFor(
  nukeType: NukeType,
  config: BattleArenaConfig,
  tierIndex: number,
): number {
  if (nukeType !== 'missileRain') return 1

  const tiers = config.gameplay.nuke.tiers
  // Record yang sudah di udara membawa indeks dari config LAMA; creator yang memendekkan
  // daftarnya di tengah sesi tidak boleh menghasilkan NaN di sini.
  const index = Math.min(Math.max(0, tierIndex), Math.max(0, tiers.length - 1))
  const density = tiers[index]?.densityMultiplier ?? 1
  const raw = Math.round(config.gameplay.nuke.missile.baseCount * density)
  return Math.min(ULTIMATE_MAX_TARGETS, Math.max(1, raw))
}

/** Musuh yang hidup, diurutkan dari yang terdekat ke pusat zona sasaran. */
function livingByDistance(
  state: BattleArenaState,
  targetSide: SideId,
  config?: BattleArenaConfig,
): Fighter[] {
  const center = sideCenter(targetSide, config?.gameplay.sideCount ?? 2)
  const distance = (f: Fighter): number =>
    (f.position.x - center.x) ** 2 + (f.position.y - center.y) ** 2

  return state.fighters
    .list()
    .filter((f) => f.side === targetSide && f.alive)
    .sort((a, b) => distance(a) - distance(b) || a.slotIndex - b.slotIndex)
}

/**
 * Korban `laser`, menurut aturan yang disetel creator.
 *
 * `living` sudah terurut dari yang terdekat, sehingga `'nearest'` tinggal mengambil yang
 * pertama dan kedua aturan lain cukup satu lintasan dengan tie-break yang stabil — yang
 * pertama menang, dan urutannya deterministik karena `slotIndex` sudah jadi tie-break di
 * pengurutan.
 */
function laserPick(living: Fighter[], config: BattleArenaConfig): Fighter | undefined {
  const better =
    config.gameplay.nuke.laser.targetRule === 'mostKills'
      ? (f: Fighter, best: Fighter): boolean => f.kills > best.kills
      : (f: Fighter, best: Fighter): boolean => f.hp > best.hp

  if (config.gameplay.nuke.laser.targetRule === 'nearest') return living[0]

  let best = living[0]
  for (const f of living) {
    if (best === undefined || better(f, best)) best = f
  }
  return best
}

/**
 * Slot yang dikunci ultimate ini. Kosong berarti sisi lawan sudah habis.
 *
 * Daftar boleh MENGULANG saat musuh lebih sedikit daripada rudal: setiap rudal tetap harus
 * punya sasaran, dan memangkas jumlah rudal akan membuat gift mahal terlihat lebih kecil
 * justru ketika lawannya tinggal sedikit — kebalikan dari yang dibayar orangnya.
 */
export function lockTargets(
  state: BattleArenaState,
  config: BattleArenaConfig,
  nukeType: NukeType,
  targetSide: SideId,
  tierIndex: number,
): number[] {
  const living = livingByDistance(state, targetSide, config)
  if (living.length === 0) return []

  if (nukeType === 'laser') {
    const pick = laserPick(living, config)
    return pick === undefined ? [] : [pick.slotIndex]
  }

  if (nukeType !== 'missileRain') return [(living[0] as Fighter).slotIndex]

  const count = targetCountFor(nukeType, config, tierIndex)
  const slots: number[] = []
  for (let i = 0; i < count; i++) {
    slots.push((living[i % living.length] as Fighter).slotIndex)
  }
  return slots
}
