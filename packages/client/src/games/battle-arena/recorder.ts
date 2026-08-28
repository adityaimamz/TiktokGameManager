import { isSyntheticPlatform } from '@lga/shared'
import type { MatchPlayerRecord, MatchRecord } from '@lga/shared'
import type { EngineEvent } from './events.js'
import type { BattleArenaState } from './state.js'

export interface MatchRecorderOptions {
  getState: () => Readonly<BattleArenaState>
  now: () => number
  submit: (record: MatchRecord) => void
  gameId?: string
}

/**
 * Mengubah akhir sebuah match menjadi satu `MatchRecord`.
 *
 * Ia berlangganan `EngineEvent` dan tidak pernah memutasi apa pun — engine tidak berubah
 * sebaris pun untuk mendapatkan persistence. `events.ts` memang ditulis untuk ini.
 *
 * Tinggal di `games/` karena `EngineEvent` adalah tipe Battle Arena. Yang ia serahkan ke
 * persistence adalah `MatchRecord` yang generik, sehingga `platform/persistence` tetap
 * tidak tahu game mana pun ada — dan game kedua mendapat penyimpanan tanpa kode baru.
 */
export class MatchRecorder {
  private readonly opts: MatchRecorderOptions
  private readonly gameId: string
  private startedAtMs: number | null = null

  constructor(opts: MatchRecorderOptions) {
    this.opts = opts
    this.gameId = opts.gameId ?? 'battle-arena'
  }

  onEvent(event: EngineEvent): void {
    if (event.type === 'stateChanged' && event.to === 'waitingFighters') {
      // Setiap masuk ke waitingFighters adalah match baru: itu satu-satunya pintu masuk,
      // baik dari start pertama maupun dari layar victory match sebelumnya.
      this.startedAtMs = event.atMs
      return
    }

    if (event.type !== 'matchEnded') return

    // Match yang tidak pernah terlihat mulai — recorder dipasang di tengah jalan — tidak
    // punya durasi yang bisa dipercaya, dan durasi palsu lebih buruk daripada satu baris
    // yang hilang.
    if (this.startedAtMs === null) return

    const state = this.opts.getState()
    const record: MatchRecord = {
      gameId: this.gameId,
      startedAtMs: this.startedAtMs,
      endedAtMs: this.opts.now(),
      winnerSide: event.winner,
      roundsWonA: state.roundsWon.a,
      roundsWonB: state.roundsWon.b,
      totalFighters: state.fighters.count,
      players: collectPlayers(state),
    }

    this.startedAtMs = null
    this.opts.submit(record)
  }
}

/**
 * Viewer sungguhan saja (P5).
 *
 * Fighter demo, practice, dan creator tidak pernah menyeberang ke server — statistiknya
 * hidup di memori dan hilang saat match berakhir, persis seperti yang §12 spec induk
 * tetapkan. `totalFighters` tetap menghitung semuanya, karena itu memang jumlah yang ada
 * di arena.
 *
 * Koin gift TIDAK ikut: `match_players` tidak punya kolomnya, dan total sepanjang masa
 * ditulis `LiveLedger` lewat jalur progres. Mengirimnya dari sini juga akan menghitungnya
 * dua kali (spec Plan 13 §3 — satu kolom, satu penulis).
 */
function collectPlayers(state: Readonly<BattleArenaState>): MatchPlayerRecord[] {
  const players: MatchPlayerRecord[] = []
  for (const fighter of state.fighters.list()) {
    if (isSyntheticPlatform(fighter.platform)) continue
    players.push({
      platform: 'tiktok',
      username: fighter.username,
      avatarUrl: fighter.avatarUrl,
      side: fighter.side,
      kills: fighter.kills,
      deaths: fighter.deaths,
    })
  }
  return players
}
