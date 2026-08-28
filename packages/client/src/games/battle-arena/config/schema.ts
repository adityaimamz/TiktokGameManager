import type { BattleActionType, TargetKind } from '../actions.js'
import type { SideId } from '../types.js'


/** Union satu anggota: mode menang baru bisa ditambah tanpa merusak config tersimpan. */
export type WinMode = 'firstToNKills'

export type RoundsBestOf = 1 | 3 | 5 | 7
export const ROUNDS_BEST_OF_VALUES: readonly RoundsBestOf[] = [1, 3, 5, 7]

/** Fase 1 hanya menjalankan 'flat' dan 'perLike'; dua sisanya ada agar Fase 2 tak perlu migrasi. */
export type GrowMode = 'flat' | 'perCoin' | 'perLike' | 'perFollow'

/**
 * Req 14 AC1: empat tipe ultimate awal, plus `singularity` dan `chainFreeze` dari jalur FX
 * (Ultimate FX Lab). Menambah tipe tidak menyentuh combat.ts — hanya expandToBlast di
 * ultimate-targets/combat perlu tahu nama-nama yang berperilaku "area".
 *
 * URUTAN MENGIKAT: `NUKE_TYPES.indexOf` adalah field `variant` di format wire snapshot.
 * Tipe baru HARUS ditambah di paling akhir, atau record lama menggambar varian yang salah.
 */
export type NukeType = 'missileRain' | 'laser' | 'bomb' | 'lightning' | 'singularity' | 'chainFreeze'
export const NUKE_TYPES: readonly NukeType[] = [
  'missileRain',
  'laser',
  'bomb',
  'lightning',
  'singularity',
  'chainFreeze',
]

/**
 * Satu tingkat nilai gift.
 *
 * Yang berskala hanyalah PRESENTASI: durasi, kepadatan salvo, radius impact, dan intensitas
 * callout. Damage sengaja TIDAK ada di sini — gift mahal terlihat lebih besar, bukan memukul
 * lebih keras (spec §7.5). Jangan menambahkan damageMultiplier; itu bukan kelalaian.
 */
export interface NukeTier {
  minCoins: number
  durationMultiplier: number
  densityMultiplier: number
  radiusMultiplier: number
  calloutIntensity: number
}

/** Bagaimana `laser` memilih satu korban di antara musuh yang hidup. */
export type LaserTargetRule = 'highestHp' | 'mostKills' | 'nearest'
export const LASER_TARGET_RULES: readonly LaserTargetRule[] = ['highestHp', 'mostKills', 'nearest']

export interface MissileConfig {
  /** Jumlah rudal pada tier netral; densityMultiplier mengalikannya. */
  baseCount: number
  /** Batas kecepatan putar rudal. Inilah yang membuat lintasannya melengkung, bukan lurus. */
  turnRateDegPerSec: number
  /**
   * Jeda peluncuran antar-rudal — PERMINTAAN, bukan jaminan.
   *
   * Engine menjepitnya ke jendela yang benar-benar tersedia saat rilis, sehingga salvo besar
   * mendapat jeda lebih rapat daripada angka ini. `durationMs` adalah knob yang sebenarnya
   * untuk melebarkan salvo.
   */
  launchStaggerMs: number
  /** Kecepatan rudal, persen lebar arena per detik. */
  speedPctPerSec: number
}

export interface NukeConfig {
  type: NukeType
  damage: number
  durationMs: number
  /** Jumlah ultimate yang boleh BERANIMASI bersamaan. Sisanya mengantre, tidak dibuang. */
  hardCap: number
  /** Lama record ultimate ditahan setelah animasinya habis atau ditandai stale, demi callout. */
  calloutHoldMs: number
  /** Radius ledakan dasar, persen lebar arena; tier.radiusMultiplier mengalikannya. */
  blastRadiusPct: number
  /** Partikel dasar untuk charge, asap aftermath, dan debris; × densityMultiplier. */
  particleBase: number
  missile: MissileConfig
  lightning: { branches: number }
  laser: { targetRule: LaserTargetRule }
  /** Menaik menurut minCoins; entri pertama selalu minCoins 0. */
  tiers: NukeTier[]
}

export type OverlayMode = 'fullscreen' | 'compact'
export type Orientation = 'landscape' | 'portrait'

export type EffectType =
  | 'hit'
  | 'heal'
  | 'explosion'
  | 'critical'
  | 'gift'
  | 'join'
  | 'kill'
  | 'victory'
  | 'nuke'
export const EFFECT_TYPES: readonly EffectType[] = [
  'hit',
  'heal',
  'explosion',
  'critical',
  'gift',
  'join',
  'kill',
  'victory',
  'nuke',
]

export type SoundEvent =
  | 'attack'
  | 'hit'
  | 'heal'
  | 'death'
  | 'join'
  | 'countdown'
  | 'roundWin'
  | 'matchWin'
  /** Satu knop untuk keenam varian nuke; url-nya per varian, lihat ULTIMATE_SOUND_URL. */
  | 'ultimate'
export const SOUND_EVENTS: readonly SoundEvent[] = [
  'attack',
  'hit',
  'heal',
  'death',
  'join',
  'countdown',
  'roundWin',
  'matchWin',
  'ultimate',
]

export const SIDE_NAME_MAX_LENGTH = 30
export const KEYWORD_MAX_LENGTH = 20
export const MAX_ALIASES = 5
export const MAX_TRIGGER_RULES = 50

/**
 * Panjang dua nama sebuah rule, sebagai DATA.
 *
 * `label` adalah judul kartu di panel creator; `legend.caption` adalah teks yang dibaca
 * penonton di rail. Keduanya dipakai `validateConfig` DAN kolom teks di panel, jadi angka
 * yang tampil di UI tidak mungkin berbeda dari angka yang benar-benar ditegakkan.
 */
export const RULE_LABEL_MAX_LENGTH = 60
export const LEGEND_CAPTION_MAX_LENGTH = 40

export interface SideConfig {
  name: string
  keyword: string
  aliases: string[]
  color: string
  backgroundImage: string | null
}

export interface TriggerRule {
  id: string
  /** Label di panel config, mis. "Join Side A". Bukan teks yang tampil di legend. */
  label: string
  enabled: boolean
  when:
    | { kind: 'comment'; matchSide: SideId }
    | { kind: 'like'; everyNLikes: number }
    /** Daftar nama KOSONG berarti gift apa pun; itu yang membuat satu bentuk melayani
     *  daftar ber-OR dan tangkapan umum sekaligus (Req 29). */
    | { kind: 'gift'; giftNames: string[]; minCount: number }
    | { kind: 'follow' }
  then: {
    actionType: BattleActionType
    target: TargetKind
    value: number
    nukeType?: NukeType
    /**
     * HP maksimal yang SEKALIGUS didapat pengirim saat ultimate ini melesat.
     *
     * Jumlah TETAP milik rule ini, bukan turunan koin maupun `gameplay.hpGainedPerGrow` yang
     * melayani jalur like: yang memilah gift mahal dari gift murah adalah `minCount` dan daftar
     * nama gift di rule yang sama. Hanya sah pada rule gift yang aksinya 'nuke' —
     * `validateRule` membuangnya di luar itu, aturan yang sama dengan `nukeType`. Absen berarti
     * mati, jadi config lama di localStorage creator tetap sah tanpa migrasi.
     */
    growWithNuke?: number
  }
  legend: {
    show: boolean
    /** Teks di action legend. "{side}" diganti nama sisi yang cocok. */
    caption: string
    icon: string
  }
}

export interface UiConfig {
  showJoinedMessages: boolean
  showFloatingDamage: boolean
  showFighterNames: boolean
  showTopFighters: boolean
  leaderboardEntries: number
  screenShake: boolean
}

export interface GameplayConfig {
  winMode: WinMode
  roundsBestOf: RoundsBestOf
  killsToWinRound: number
  maxFightersPerSide: number
  baseHp: number
  baseDamage: number
  attackIntervalSec: number
  hpGainedPerGrow: number
  growMode: GrowMode
  nuke: NukeConfig
  /** Gift dari viewer yang belum punya fighter otomatis mendaftarkannya (spec §6.2). */
  autoJoinGifter: boolean
  countdownDurationSec: number
  celebrationDurationSec: number
  idleMovement: boolean
  practiceFighters: boolean
}

export interface LikesConfig {
  threshold: number
}

export interface EffectConfig {
  intensity: number
  durationMultiplier: number
}

export interface SoundConfig {
  enabled: boolean
  volume: number
}

export interface SimulationConfig {
  /** Obrolan biasa — bukan keyword join. Aliran inilah yang membuat chat terasa hidup. */
  commentsPerSecond: number
  likesPerSecond: number
  giftsPerSecond: number
}

export type ArenaBackground =
  | { kind: 'color'; value: string }
  | { kind: 'transparent' }
  | { kind: 'image'; url: string }

export type FillerKind = 'video' | 'image'
export const FILLER_KINDS: readonly FillerKind[] = ['video', 'image']

/** Batas kasar supaya config creator tidak dipenuhi ratusan URL yang tidak pernah tampil. */
export const FILLER_ITEMS_MAX = 8
export const FILLER_URL_MAX_LENGTH = 500

export interface FillerItem {
  url: string
  kind: FillerKind
}

/**
 * Isi band bawah panggung: potongan video atau gambar yang berputar.
 *
 * Ia menumpang config game — bukan topik sinyal sendiri — dengan alasan yang sama seperti
 * `SideConfig.backgroundImage` dan `overlay.arenaBackground`: ia menghias panggung dan tidak
 * mengubah satu pun aturan main, sementara topik `config` sudah ditahan `SignalHub` untuk
 * overlay yang baru menyambung. Overlay di device lain karena itu mendapat daftarnya gratis.
 */
export interface FillerConfig {
  enabled: boolean
  items: FillerItem[]
  /** Berapa lama satu GAMBAR bertahan. Video ditentukan panjang berkasnya sendiri. */
  imageDurationSec: number
}

export interface OverlayConfig {
  transparency: number
  mode: OverlayMode
  orientation: Orientation
  arenaBackground: ArenaBackground
  /** Plafon alpha flash gabungan; puncak yang menumpuk di-CLAMP, bukan dijumlah. */
  flashCeiling: number
  flashCeilingReducedMotion: number
}

export interface BattleArenaConfig {
  schemaVersion: number
  ui: UiConfig
  sides: { a: SideConfig; b: SideConfig }
  gameplay: GameplayConfig
  likes: LikesConfig
  triggers: TriggerRule[]
  effects: Record<EffectType, EffectConfig>
  sound: Record<SoundEvent, SoundConfig>
  simulation: SimulationConfig
  overlay: OverlayConfig
  filler: FillerConfig
}

export interface NumericRange {
  min: number
  max: number
  integer: boolean
}

/**
 * Rentang setiap field numerik, sebagai DATA.
 *
 * Validator dan pesan error untuk creator (Req 16 AC6) sama-sama membaca tabel ini,
 * jadi rentang yang ditampilkan di UI tidak mungkin berbeda dari rentang yang benar-benar
 * ditegakkan. Kunci memakai jalur "section.field" supaya bisa dipetakan langsung ke form.
 */
export const NUMERIC_RANGES = {
  'ui.leaderboardEntries': { min: 1, max: 20, integer: true },
  'gameplay.killsToWinRound': { min: 1, max: 999, integer: true },
  'gameplay.maxFightersPerSide': { min: 1, max: 100, integer: true },
  'gameplay.baseHp': { min: 1, max: 9999, integer: true },
  'gameplay.baseDamage': { min: 1, max: 9999, integer: true },
  'gameplay.attackIntervalSec': { min: 0.5, max: 30, integer: false },
  'gameplay.hpGainedPerGrow': { min: 1, max: 9999, integer: true },
  'gameplay.nuke.damage': { min: 10, max: 500, integer: true },
  'gameplay.nuke.durationMs': { min: 1000, max: 3000, integer: true },
  'gameplay.nuke.hardCap': { min: 1, max: 12, integer: true },
  'gameplay.nuke.calloutHoldMs': { min: 500, max: 5000, integer: true },
  'gameplay.nuke.blastRadiusPct': { min: 2, max: 30, integer: false },
  'gameplay.nuke.particleBase': { min: 4, max: 80, integer: true },
  // Batas atasnya adalah ULTIMATE_MAX_TARGETS dari @lga/shared. Ditulis literal karena tabel
  // ini dibaca form dashboard sebagai data statis; `schema.test.ts` menjaga keduanya sama.
  'gameplay.nuke.missile.baseCount': { min: 1, max: 10, integer: true },
  'gameplay.nuke.missile.turnRateDegPerSec': { min: 60, max: 900, integer: false },
  'gameplay.nuke.missile.launchStaggerMs': { min: 0, max: 500, integer: true },
  'gameplay.nuke.missile.speedPctPerSec': { min: 30, max: 400, integer: false },
  'gameplay.nuke.lightning.branches': { min: 0, max: 8, integer: true },
  'gameplay.countdownDurationSec': { min: 1, max: 10, integer: false },
  'gameplay.celebrationDurationSec': { min: 2, max: 15, integer: false },
  'likes.threshold': { min: 1, max: 9999, integer: true },
  'simulation.commentsPerSecond': { min: 0, max: 50, integer: false },
  'simulation.likesPerSecond': { min: 0, max: 50, integer: false },
  'simulation.giftsPerSecond': { min: 0, max: 50, integer: false },
  'overlay.transparency': { min: 0, max: 100, integer: true },
  'overlay.flashCeiling': { min: 0, max: 1, integer: false },
  'overlay.flashCeilingReducedMotion': { min: 0, max: 1, integer: false },
  'filler.imageDurationSec': { min: 5, max: 120, integer: false },
} satisfies Record<string, NumericRange>

export type NumericField = keyof typeof NUMERIC_RANGES

/** Rentang yang tidak berada di satu section datar, jadi tidak masuk NUMERIC_RANGES. */
export const EFFECT_INTENSITY_RANGE: NumericRange = { min: 0.1, max: 2, integer: false }
export const EFFECT_DURATION_MULTIPLIER_RANGE: NumericRange = { min: 0.5, max: 3, integer: false }
export const SOUND_VOLUME_RANGE: NumericRange = { min: 0, max: 1, integer: false }

/** Rentang di dalam entri tier, jadi tidak berada di section datar mana pun. */
export const TIER_MIN_COINS_RANGE: NumericRange = { min: 0, max: 1_000_000, integer: true }
export const TIER_MULTIPLIER_RANGE: NumericRange = { min: 0.1, max: 5, integer: false }
export const MAX_NUKE_TIERS = 5

/** Nama gift TikTok terpanjang jauh di bawah ini; batasnya hanya menjaga config. */
export const GIFT_NAME_MAX_LENGTH = 40
export const MAX_GIFT_NAMES = 20
/** Tidak masuk NUMERIC_RANGES: ia hidup di dalam rule, bukan di section datar. */
export const GIFT_MIN_COUNT_RANGE: NumericRange = { min: 1, max: 999, integer: true }
/** Sama: bonus HP `then.growWithNuke` hidup di dalam rule. Nol berarti mati. */
export const GROW_WITH_NUKE_RANGE: NumericRange = { min: 0, max: 99_999, integer: true }
