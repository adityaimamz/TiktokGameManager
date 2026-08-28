import type { ConnectionState } from '@lga/shared'
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

/** Koneksi yang benar-benar akan hilang kalau dashboard ditinggalkan. */
const LIVE: readonly ConnectionState[] = ['connected', 'reconnecting']

/**
 * Apakah meninggalkan ruang kendali menghilangkan sesuatu.
 *
 * Perluasan `shouldWarnOnUnload`, bukan predikat kedua: keduanya menjawab pertanyaan yang sama
 * untuk dua pintu yang berbeda — menutup tab dan kembali ke katalog — dan menyalinnya berarti
 * dua jawaban yang pasti menyimpang.
 *
 * `connecting` sengaja TIDAK dihitung: percobaan sambung pertama belum punya apa pun untuk
 * hilang, dan mengadang creator di situ hanya membuat tombol kembali terasa rusak.
 */
export function leaveWarning(match: MatchState, connection: ConnectionState): boolean {
  return shouldWarnOnUnload(match) || LIVE.includes(connection)
}
