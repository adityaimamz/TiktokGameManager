import type { Effect, EffectPool } from '../../framework/effects/pool.js'
import type { BattleArenaConfig, EffectType, NukeType, SoundEvent } from './config/index.js'
import type { EngineEvent } from './events.js'

/** Durasi dasar per tipe efek, sebelum dikalikan durationMultiplier creator (Req 27 AC2). */
export const EFFECT_DURATIONS_MS: Record<EffectType, number> = {
  hit: 250,
  heal: 400,
  explosion: 600,
  critical: 400,
  gift: 800,
  join: 600,
  kill: 700,
  victory: 2000,
  nuke: 1200,
}

/** Bunyi yang menyertai tiap efek, atau null bila efeknya diam (Req 27 AC6). */
export const EFFECT_SOUND_CUES: Record<EffectType, SoundEvent | null> = {
  hit: 'hit',
  heal: 'heal',
  explosion: null,
  critical: 'hit',
  gift: null,
  join: 'join',
  kill: 'death',
  victory: 'matchWin',
  nuke: 'death',
}

/**
 * Bunyi yang menyertai event engine — pasangan `EFFECT_SOUND_CUES` untuk empat cue yang
 * tidak punya efek sama sekali.
 *
 * Tembakan, hitung mundur, dan kemenangan tidak men-spawn `Effect` apa pun, jadi lewat
 * tabel efek saja keempat knopnya di panel SOUND mengatur bunyi yang tidak pernah ada.
 * `effects.test.ts` menjaga gabungan kedua tabel menutup seluruh `SOUND_EVENTS`.
 */
export const EVENT_SOUND_CUES: Partial<Record<EngineEvent['type'], SoundEvent>> = {
  attacksFired: 'attack',
  countdownTick: 'countdown',
  roundEnded: 'roundWin',
  matchEnded: 'matchWin',
}

/**
 * Dua MOMEN BUNYI, bukan fase animasi.
 *
 * Sengaja BUKAN `UltimatePhase`: nama itu sudah dipakai `renderer/ultimate.ts` untuk empat
 * fase gambar (`charge`/`travel`/`impact`/`aftermath`), dan keduanya tembus barrel
 * `games/battle-arena/index.ts` yang sama. `impact` kebetulan ada di kedua daftar dan
 * memang menunjuk saat yang sama; dua lainnya tidak punya pasangan.
 */
export type UltimateSoundPhase = 'launch' | 'impact'

export interface UltimateSound {
  url: string
  /** Panjang berkasnya, ms. Dipakai `SoundQueue` untuk menghitung konkurensi. */
  durationMs: number
}

/**
 * Dua bunyi per varian, disajikan dari `packages/client/public/sfx/`.
 *
 * DUA, bukan satu: animasi ultimate punya dua puncak — saat melesat dan saat mendarat di
 * `IMPACT_AT` — dan satu one-shot di detik nol tidak bisa menandai keduanya. Bomb harus
 * terdengar dilempar lalu meledak; pecahan chainFreeze harus jatuh di frame yang sama dengan
 * kristal yang hancur.
 *
 * Berkas, bukan oscillator: `AudioEngine` mensintesis nada dan tidak bisa membunyikan guruh
 * atau desing rudal. Jalur pemutarnya karena itu `MediaCue` — sama dengan soundboard.
 *
 * `durationMs` ditulis di sini, bukan dibaca dari berkasnya: `SoundQueue` butuh angkanya
 * sebelum satu byte pun diunduh. Ia juga yang dijaga `ultimate-cue.test.ts` supaya sebuah
 * berkas launch tidak pernah menumpuk ke fase impact.
 *
 * `Record<NukeType, …>` dengan sengaja: varian ketujuh menolak dikompilasi sampai kedua
 * berkasnya ada, aturan yang sama dengan tabel varian di `renderer/fx/index.ts`.
 */
export const ULTIMATE_SOUND: Record<NukeType, Record<UltimateSoundPhase, UltimateSound>> = {
  missileRain: {
    launch: { url: '/sfx/ultimate-missile-rain-launch.ogg', durationMs: 1700 },
    impact: { url: '/sfx/ultimate-missile-rain-impact.ogg', durationMs: 1230 },
  },
  bomb: {
    launch: { url: '/sfx/ultimate-bomb-launch.ogg', durationMs: 1100 },
    impact: { url: '/sfx/ultimate-bomb-impact.ogg', durationMs: 1390 },
  },
  laser: {
    launch: { url: '/sfx/ultimate-laser-launch.ogg', durationMs: 950 },
    impact: { url: '/sfx/ultimate-laser-impact.ogg', durationMs: 1240 },
  },
  lightning: {
    launch: { url: '/sfx/ultimate-lightning-launch.ogg', durationMs: 1200 },
    impact: { url: '/sfx/ultimate-lightning-impact.ogg', durationMs: 1390 },
  },
  singularity: {
    launch: { url: '/sfx/ultimate-singularity-launch.ogg', durationMs: 1740 },
    impact: { url: '/sfx/ultimate-singularity-impact.ogg', durationMs: 1580 },
  },
  chainFreeze: {
    launch: { url: '/sfx/ultimate-chain-freeze-launch.ogg', durationMs: 1930 },
    impact: { url: '/sfx/ultimate-chain-freeze-impact.ogg', durationMs: 430 },
  },
}

export interface SpawnGameEffectOptions {
  type: EffectType
  x: number
  y: number
  /** Muatan numerik, mis. angka damage yang melayang. */
  value?: number
  /**
   * Durasi dasar khusus, menggantikan tabel — dipakai nuke, yang durasinya diatur creator
   * (Req 14 AC4). Tetap dikalikan durationMultiplier seperti efek lain.
   */
  durationMs?: number
}

/**
 * Memunculkan efek dengan durasi, intensitas, dan bunyi yang sudah disesuaikan config.
 *
 * Satu-satunya jalan efek dibuat di Battle Arena, sehingga pengaturan creator tidak
 * mungkin terlewat di salah satu pemanggil.
 */
export function spawnGameEffect(
  pool: EffectPool,
  config: BattleArenaConfig,
  opts: SpawnGameEffectOptions,
): Effect {
  const tuning = config.effects[opts.type]
  const cue = EFFECT_SOUND_CUES[opts.type]
  const audible = cue !== null && config.sound[cue].enabled

  return pool.spawn({
    type: opts.type,
    x: opts.x,
    y: opts.y,
    duration: (opts.durationMs ?? EFFECT_DURATIONS_MS[opts.type]) * tuning.durationMultiplier,
    intensity: tuning.intensity,
    value: opts.value ?? 0,
    soundCue: audible ? cue : null,
  })
}
