import { SIDE_B, SIDE_C, SIDE_D } from '@lga/shared'
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
  c?: SideReadout
  d?: SideReadout
  sideCount: 2 | 4
  fields: { label: string; value: string }[]
  /** "3/5" untuk pil ronde di kepala kartu. */
  roundLabel: string
  /** Fighter yang masih berdiri, seluruh kubu. */
  fighterTotal: string
  /**
   * Pangsa TOTAL HP sisi A, 0–100.
   */
  dominanceA: number
}

export function gameInfoView(view: SnapshotView | null, config: BattleArenaConfig): GameInfoView {
  const header = view?.header ?? null
  const sideCount = config.gameplay.sideCount ?? 2
  const scoreA = header?.roundScoreA ?? 0
  const scoreB = header?.roundScoreB ?? 0
  const scoreC = header?.roundScoreC ?? 0
  const scoreD = header?.roundScoreD ?? 0
  const bestOf = config.gameplay.roundsBestOf
  const decided =
    (header?.roundsWonA ?? 0) +
    (header?.roundsWonB ?? 0) +
    (sideCount === 4 ? (header?.roundsWonC ?? 0) + (header?.roundsWonD ?? 0) : 0)

  let aliveA = 0
  let aliveB = 0
  let aliveC = 0
  let aliveD = 0
  let hpA = 0
  let hpB = 0
  let hpC = 0
  let hpD = 0

  // PERINGATAN dari shared/snapshot.ts: array fighters boleh lebih panjang dari yang
  // berlaku, karena decoder memakai ulang objeknya. Selalu berhenti di fighterCount.
  for (let i = 0; i < (header?.fighterCount ?? 0); i++) {
    const fighter = view?.fighters[i]
    if (fighter === undefined || fighter.alive === 0) continue
    if (fighter.side === SIDE_B) {
      aliveB++
      hpB += Math.max(0, fighter.hp)
    } else if (fighter.side === SIDE_C) {
      aliveC++
      hpC += Math.max(0, fighter.hp)
    } else if (fighter.side === SIDE_D) {
      aliveD++
      hpD += Math.max(0, fighter.hp)
    } else {
      aliveA++
      hpA += Math.max(0, fighter.hp)
    }
  }

  const round = Math.min(decided + 1, bestOf)
  const totalHp = hpA + hpB + (sideCount === 4 ? hpC + hpD : 0)
  const totalAlive = aliveA + aliveB + (sideCount === 4 ? aliveC + aliveD : 0)

  const scores = [
    { side: 'a', score: scoreA, name: config.sides.a.name },
    { side: 'b', score: scoreB, name: config.sides.b.name },
  ]
  if (sideCount === 4) {
    scores.push({ side: 'c', score: scoreC, name: config.sides.c.name })
    scores.push({ side: 'd', score: scoreD, name: config.sides.d.name })
  }
  const maxScore = Math.max(...scores.map((s) => s.score))
  const leaders = scores.filter((s) => s.score === maxScore && s.score > 0)
  const leaderLabel = leaders.length === 1 ? leaders[0]?.name ?? 'Seri' : 'Seri'

  return {
    sideCount,
    a: { name: config.sides.a.name, color: config.sides.a.color, score: formatCount(scoreA) },
    b: { name: config.sides.b.name, color: config.sides.b.color, score: formatCount(scoreB) },
    c:
      sideCount === 4
        ? { name: config.sides.c.name, color: config.sides.c.color, score: formatCount(scoreC) }
        : undefined,
    d:
      sideCount === 4
        ? { name: config.sides.d.name, color: config.sides.d.color, score: formatCount(scoreD) }
        : undefined,
    roundLabel: `${round}/${bestOf}`,
    fighterTotal: formatCount(totalAlive),
    dominanceA: totalHp === 0 ? 50 : Math.round((hpA / totalHp) * 100),
    fields: [
      { label: 'Ronde', value: `${round} dari best of ${bestOf}` },
      {
        label: 'Unggul',
        value: leaderLabel,
      },
      {
        label: 'Fighter',
        value:
          sideCount === 4
            ? `${formatCount(aliveA)} / ${formatCount(aliveB)} / ${formatCount(aliveC)} / ${formatCount(aliveD)}`
            : `${formatCount(aliveA)} vs ${formatCount(aliveB)}`,
      },
    ],
  }
}
