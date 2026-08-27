import type { MatchState } from '../../games/battle-arena/state-machine.js'

/**
 * Menutup tab pemilik menghentikan match (§6.1 spec induk), jadi browser diminta bertanya
 * lebih dulu.
 *
 * Predikatnya murni supaya bisa diuji untuk ketujuh state tanpa DOM; effect yang memasang
 * listener hanya memanggilnya. `idle` dan `result` tidak diperingatkan: yang satu belum
 * punya apa-apa, yang satu sudah selesai dan hasilnya sudah diserahkan ke server.
 */
export function shouldWarnOnUnload(state: MatchState): boolean {
  return state !== 'idle' && state !== 'result'
}
