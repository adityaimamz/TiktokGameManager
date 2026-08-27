import { SIDE_B } from '@lga/shared'
import type { SnapshotView } from '@lga/shared'
import type { BattleArenaConfig } from '../../../games/battle-arena/config/index.js'
import { formatCount } from '../format.js'

export interface SideReadout {
  name: string
  /** Warna sisi datang dari config creator, jadi ia tidak bisa jadi token Tailwind. */
  color: string
  score: string
}

export interface GameInfoView {
  a: SideReadout
  b: SideReadout
  fields: { label: string; value: string }[]
  /** "3/5" untuk pil ronde di kepala kartu. */
  roundLabel: string
  /** Fighter yang masih berdiri, kedua sisi. */
  fighterTotal: string
  /**
   * Pangsa TOTAL HP sisi A, 0–100.
   *
   * Bukan pangsa kill: bar ini menjawab "siapa yang sedang menguasai lapangan SEKARANG",
   * dan skor kill sudah dijawab dua angka besar di atasnya. Arena kosong jatuh di 50.
   */
  dominanceA: number
}

export function gameInfoView(view: SnapshotView | null, config: BattleArenaConfig): GameInfoView {
  const header = view?.header ?? null
  const scoreA = header?.roundScoreA ?? 0
  const scoreB = header?.roundScoreB ?? 0
  const bestOf = config.gameplay.roundsBestOf
  const decided = (header?.roundsWonA ?? 0) + (header?.roundsWonB ?? 0)

  let aliveA = 0
  let aliveB = 0
  let hpA = 0
  let hpB = 0
  // PERINGATAN dari shared/snapshot.ts: array fighters boleh lebih panjang dari yang
  // berlaku, karena decoder memakai ulang objeknya. Selalu berhenti di fighterCount.
  for (let i = 0; i < (header?.fighterCount ?? 0); i++) {
    const fighter = view?.fighters[i]
    if (fighter === undefined || fighter.alive === 0) continue
    if (fighter.side === SIDE_B) {
      aliveB++
      hpB += Math.max(0, fighter.hp)
    } else {
      aliveA++
      hpA += Math.max(0, fighter.hp)
    }
  }

  const round = Math.min(decided + 1, bestOf)

  return {
    a: { name: config.sides.a.name, color: config.sides.a.color, score: formatCount(scoreA) },
    b: { name: config.sides.b.name, color: config.sides.b.color, score: formatCount(scoreB) },
    roundLabel: `${round}/${bestOf}`,
    fighterTotal: formatCount(aliveA + aliveB),
    dominanceA: hpA + hpB === 0 ? 50 : Math.round((hpA / (hpA + hpB)) * 100),
    fields: [
      { label: 'Ronde', value: `${round} dari best of ${bestOf}` },
      {
        label: 'Unggul',
        value:
          scoreA === scoreB ? 'Seri' : scoreA > scoreB ? config.sides.a.name : config.sides.b.name,
      },
      { label: 'Fighter', value: `${formatCount(aliveA)} vs ${formatCount(aliveB)}` },
    ],
  }
}
