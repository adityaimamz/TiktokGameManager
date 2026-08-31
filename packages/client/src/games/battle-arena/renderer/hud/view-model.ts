import { NO_SLOT, SIDE_B } from '@lga/shared'
import type { SnapshotView } from '@lga/shared'
import type { BattleArenaConfig } from '../../config/index.js'
import { matchStateFromIndex, nukeTypeFromIndex, sideFromIndex } from '../../snapshot.js'
import type { RosterEntry } from '../../snapshot.js'
import { tierFor } from '../ultimate.js'
import type { MatchState } from '../../state-machine.js'
import type { SideId } from '../../types.js'

/**
 * Isi HUD sebagai fungsi murni (keputusan E6).
 *
 * Setiap keputusan yang bisa salah — siapa unggul, berapa titik ronde terisi, siapa MVP —
 * hidup di sini, bukan di JSX, supaya bisa diuji tanpa DOM.
 */

export interface ScoreSideModel {
  side: SideId
  name: string
  color: string
  score: number
  leading: boolean
  roundDots: boolean[]
}

/**
 * Satu titik per ronde di sepanjang best-of.
 *
 * `current` adalah ronde yang sedang berjalan — ia digambar lebih lebar, bukan sekadar
 * lebih terang, supaya posisinya terbaca tanpa membedakan warna.
 */
export type RoundDot = 'a' | 'b' | 'current' | 'empty'

export interface ScoreBarModel {
  a: ScoreSideModel
  b: ScoreSideModel
  killsToWin: number
  roundNumber: number
  bestOf: number
  /** Deret ronde untuk satu baris titik di bawah skor. */
  dots: RoundDot[]
}

const dots = (bestOf: number, won: number): boolean[] =>
  Array.from({ length: bestOf }, (_, index) => index < won)

/**
 * Ronde yang sudah diputuskan diisi dari kedua ujung: kemenangan A menumpuk dari kiri,
 * kemenangan B dari kanan. Sisa di tengah adalah ronde yang belum dimainkan.
 */
function roundDots(bestOf: number, wonA: number, wonB: number, current: number): RoundDot[] {
  return Array.from({ length: bestOf }, (_, index) => {
    if (index < wonA) return 'a'
    if (index >= bestOf - wonB) return 'b'
    return index === current - 1 ? 'current' : 'empty'
  })
}

export function scoreBarModel(view: SnapshotView, config: BattleArenaConfig): ScoreBarModel {
  const { roundScoreA, roundScoreB, roundsWonA, roundsWonB } = view.header
  const bestOf = config.gameplay.roundsBestOf
  const decided = roundsWonA + roundsWonB
  const roundNumber = Math.min(decided + 1, bestOf)

  return {
    dots: roundDots(bestOf, roundsWonA, roundsWonB, roundNumber),
    a: {
      side: 'a',
      name: config.sides.a.name,
      color: config.sides.a.color,
      score: roundScoreA,
      leading: roundScoreA > roundScoreB,
      roundDots: dots(bestOf, roundsWonA),
    },
    b: {
      side: 'b',
      name: config.sides.b.name,
      color: config.sides.b.color,
      score: roundScoreB,
      leading: roundScoreB > roundScoreA,
      roundDots: dots(bestOf, roundsWonB),
    },
    killsToWin: config.gameplay.killsToWinRound,
    roundNumber,
    bestOf,
  }
}

/**
 * Satu kalimat pendek untuk pil status di kaki arena, dan `null` saat tidak ada yang perlu
 * dikatakan.
 *
 * Pil ini menjawab "kenapa tidak ada yang bergerak" — pertanyaan yang hanya muncul saat
 * arena diam. Selama `battle` arena menjawabnya sendiri, jadi kalimatnya cuma menutupi lantai
 * arena di menit-menit yang justru paling ramai. `null`, bukan string kosong: pil kosong
 * masih mengecat kapsul gelap dan titik berkedipnya di atas siaran creator.
 */
const MATCH_STATUS: Record<MatchState, string | null> = {
  idle: 'READY TO START',
  waitingFighters: 'WAITING FOR PLAYERS',
  countdown: 'GET READY',
  battle: null,
  victory: 'ROUND OVER',
  result: 'MATCH OVER',
  reset: 'RESETTING',
}

export function matchStatusLabel(view: SnapshotView): string | null {
  return MATCH_STATUS[matchStateFromIndex(view.header.matchState)]
}

export interface FighterRow {
  slotIndex: number
  username: string
  avatarUrl: string | null
  side: SideId
  kills: number
}

function rows(view: SnapshotView, roster: ReadonlyMap<number, RosterEntry>): FighterRow[] {
  const out: FighterRow[] = []
  for (let i = 0; i < view.header.fighterCount; i++) {
    const fighter = view.fighters[i]
    if (fighter === undefined || fighter.kills <= 0) continue
    const entry = roster.get(fighter.slotIndex)
    if (entry === undefined) continue
    out.push({
      slotIndex: fighter.slotIndex,
      username: entry.username,
      avatarUrl: entry.avatarUrl,
      side: sideFromIndex(fighter.side),
      kills: fighter.kills,
    })
  }
  // Slot menaik sebagai pemecah seri: tanpa itu, dua fighter berkill sama akan bertukar
  // tempat tiap frame dan papan peringkat berkedip.
  out.sort((left, right) => right.kills - left.kills || left.slotIndex - right.slotIndex)
  return out
}

export function topFighters(
  view: SnapshotView,
  roster: ReadonlyMap<number, RosterEntry>,
  config: BattleArenaConfig,
): FighterRow[] {
  if (!config.ui.showTopFighters) return []
  return rows(view, roster).slice(0, config.ui.leaderboardEntries)
}

export function mvp(
  view: SnapshotView,
  roster: ReadonlyMap<number, RosterEntry>,
): FighterRow | null {
  return rows(view, roster)[0] ?? null
}

export interface VictoryModel {
  kind: 'round' | 'match'
  side: SideId
  name: string
  color: string
  mvp: FighterRow | null
  totalKills: { a: number; b: number }
  fighterCount: number
  roundsWon: { a: number; b: number }
}

export function victoryModel(
  view: SnapshotView,
  roster: ReadonlyMap<number, RosterEntry>,
  config: BattleArenaConfig,
): VictoryModel | null {
  const state = matchStateFromIndex(view.header.matchState)
  if (state !== 'victory' && state !== 'result') return null
  if (view.header.roundWinner < 0) return null

  const side = sideFromIndex(view.header.roundWinner)
  const totalKills = { a: 0, b: 0 }
  for (let i = 0; i < view.header.fighterCount; i++) {
    const fighter = view.fighters[i]
    if (fighter === undefined) continue
    if (fighter.side === SIDE_B) totalKills.b += fighter.kills
    else totalKills.a += fighter.kills
  }

  return {
    kind: state === 'result' ? 'match' : 'round',
    side,
    name: config.sides[side].name,
    color: config.sides[side].color,
    mvp: mvp(view, roster),
    totalKills,
    fighterCount: view.header.fighterCount,
    roundsWon: { a: view.header.roundsWonA, b: view.header.roundsWonB },
  }
}

/**
 * TOP GIFTER datang dari payload roster, BUKAN dari snapshot fighter.
 *
 * Dulu fungsi ini menyapu `view.fighters` dan membaca `fighter.giftCoins`, dan itu salah di
 * tiga cara sekaligus: angka itu dinolkan tiap match baru, ia hanya ada untuk orang yang
 * sudah punya fighter, dan gift PERTAMA dari penonton baru pun luput karena penjumlahannya
 * berjalan satu tick sebelum `ensureGifterJoined`. Engine sekarang menumpuk tally sesinya
 * sendiri dan menitipkan pemuncaknya di `RosterPayload.topGifter`; di sini tidak ada lagi
 * yang perlu dihitung.
 */
export type { SessionGifter } from '../../snapshot.js'

/** Band tidak boleh tumbuh menutupi arena; sisanya diringkas jadi satu angka. */
export const CALLOUT_MAX_ROWS = 3

export interface CalloutRow {
  slot: number
  username: string
  avatarUrl: string | null
  side: SideId
  /** Nama ultimate seperti yang dibaca penonton, mis. "LASER". */
  label: string
  killCount: number
  totalDamage: number
  /** Pengali presentasi dari tier — gift mahal tampil lebih tegas. */
  intensity: number
}

export interface CalloutModel {
  rows: CalloutRow[]
  overflow: number
}

/**
 * Baris callout gifter — fitur utama Plan 6b, bukan hiasan (spec §1).
 *
 * Ledakan adalah bungkus, nama gifter adalah isinya. Baris hasil (`killCount`) yang
 * mengubah persepsi dari "aku beli animasi" jadi "aku mengubah pertandingan"; sebelum
 * mendarat ia nol, dan komponen menyembunyikannya.
 *
 * `casterSlot === NO_SLOT` sengaja TIDAK menghasilkan baris: callout adalah lapis mewah,
 * dan jaminan §1 dipegang gift history yang sudah tampil di overlay. Baris tanpa nama
 * lebih buruk daripada tidak ada baris.
 */
export function calloutModel(
  view: SnapshotView,
  roster: ReadonlyMap<number, RosterEntry>,
  config: BattleArenaConfig,
): CalloutModel {
  const rows: CalloutRow[] = []
  /*
   * Satu baris per CASTER, bukan per record.
   *
   * `holdForCallout` menahan sebuah record selama calloutHoldMs setelah animasinya habis,
   * sementara `isBusy` sudah melepas gifter-nya begitu progress mencapai 1 — jadi orang yang
   * sama bisa punya dua record hidup sekaligus, dan namanya muncul dua kali di frame yang
   * sama.
   *
   * URUTANNYA MENGIKAT: penyaringan NO_SLOT terjadi di dalam loop, SEBELUM dedup ini. Dua
   * gifter yang sama-sama tidak punya fighter berbagi casterSlot NO_SLOT; dedup yang
   * mendahului penyaringan akan menggabungkan dua orang berbeda jadi satu baris, dan itu
   * menghapus nama seseorang — pelanggaran langsung aturan keras spec §1.
   */
  const rowIndexBySlot = new Map<number, number>()
  const progressBySlot = new Map<number, number>()

  // PERINGATAN dari shared/snapshot.ts: array ultimates boleh lebih panjang dari yang
  // berlaku. Selalu berhenti di ultimateCount.
  for (let i = 0; i < view.header.ultimateCount; i++) {
    const ultimate = view.ultimates[i]
    if (ultimate === undefined || ultimate.casterSlot === NO_SLOT) continue

    const entry = roster.get(ultimate.casterSlot)
    if (entry === undefined) continue

    const type = nukeTypeFromIndex(ultimate.variant)
    const row: CalloutRow = {
      slot: ultimate.slot,
      username: entry.username,
      avatarUrl: entry.avatarUrl,
      side: entry.side,
      label: (type ?? config.gameplay.nuke.type).toUpperCase(),
      killCount: ultimate.killCount,
      totalDamage: ultimate.totalDamage,
      intensity: tierFor(ultimate.tier, config).calloutIntensity,
    }

    const existing = rowIndexBySlot.get(ultimate.casterSlot)
    if (existing === undefined) {
      rowIndexBySlot.set(ultimate.casterSlot, rows.length)
      progressBySlot.set(ultimate.casterSlot, ultimate.progress)
      rows.push(row)
      continue
    }

    // Progress yang lebih KECIL menang: yang masih beranimasi mengalahkan yang sudah selesai
    // dan hanya sedang ditahan. Baris yang menemani ledakan yang SEDANG terlihat lebih
    // berguna daripada sisa yang sudah lewat.
    if (ultimate.progress >= (progressBySlot.get(ultimate.casterSlot) ?? 1)) continue
    progressBySlot.set(ultimate.casterSlot, ultimate.progress)
    rows[existing] = row
  }

  return {
    rows: rows.slice(0, CALLOUT_MAX_ROWS),
    overflow: Math.max(0, rows.length - CALLOUT_MAX_ROWS),
  }
}

/**
 * Pemisah ribuan gaya Inggris, tanpa `toLocaleString`.
 *
 * Kembarannya `formatCount` di `ui/dashboard/format.ts` memakai TITIK dan melayani dashboard;
 * renderer tidak boleh mengimpornya — itu impor ke atas, dan depcruise menolaknya. Regex,
 * bukan `toLocaleString('en-US')`, dengan alasan yang sama yang sudah dicatat di sana: Node
 * yang dibangun dengan ICU kecil diam-diam mengubah jawabannya.
 */
export function formatCoins(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
