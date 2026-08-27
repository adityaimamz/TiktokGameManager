import type { MatchSummary } from '@lga/shared'
import { formatClock } from '../format.js'

export interface MatchRow {
  id: number
  /**
   * Nama sisi yang BERLAKU SEKARANG, bukan yang tersimpan bersama match-nya.
   *
   * ponytail: nama tim tidak pernah ditulis ke database, jadi riwayat lama ikut berganti
   * label saat creator mengganti nama tim. Jalur naiknya: kolom `side_a_name`/`side_b_name`
   * di tabel `matches`, dan itu menuntut migrasi — baru layak kalau ada yang benar-benar
   * berganti nama tim di tengah jalan.
   */
  nameA: string
  nameB: string
  /** Skor sebuah match best-of-N adalah ronde yang dimenangkan, bukan kill. */
  score: string
  winner: 'a' | 'b' | null
  /** "4:12", atau "—" bila durasinya tidak pernah tertulis. */
  duration: string
  /** Jumlah fighter match itu — yang membedakan match ramai dari match sepi. */
  fighters: number
}

export interface WinRateView {
  /** Persen bulat. Ketiganya sengaja TIDAK dipaksa berjumlah 100. */
  a: number
  b: number
  draws: number
  winsA: number
  winsB: number
  drawCount: number
  total: number
  /** Jendelanya ditulis apa adanya: persentase tanpa jendela adalah persentase yang berbohong. */
  label: string
}

export interface MatchStatsView {
  rows: MatchRow[]
  /** `null` saat riwayatnya kosong — nol persen dan "belum ada data" bukan hal yang sama. */
  winRate: WinRateView | null
  empty: boolean
}

export function matchStats(
  matches: readonly MatchSummary[],
  sides: { a: string; b: string },
): MatchStatsView {
  const rows = matches.map((match) => ({
    id: match.id,
    nameA: sides.a,
    nameB: sides.b,
    score: `${match.roundsWonA} – ${match.roundsWonB}`,
    winner: match.winnerSide,
    duration: match.durationMs === null ? '—' : formatClock(match.durationMs),
    fighters: match.totalFighters,
  }))

  if (matches.length === 0) return { rows, winRate: null, empty: true }

  const total = matches.length
  const winsA = matches.filter((match) => match.winnerSide === 'a').length
  const winsB = matches.filter((match) => match.winnerSide === 'b').length
  const drawCount = total - winsA - winsB
  const share = (count: number): number => Math.round((count / total) * 100)

  return {
    rows,
    winRate: {
      a: share(winsA),
      b: share(winsB),
      draws: share(drawCount),
      winsA,
      winsB,
      drawCount,
      total,
      label: `${total} match terakhir`,
    },
    empty: false,
  }
}
