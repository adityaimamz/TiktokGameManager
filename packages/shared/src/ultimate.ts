/**
 * Kurva fase satu ultimate, sebagai angka murni.
 *
 * SATU SUMBER KEBENARAN untuk engine dan renderer. Engine menghitung tick pendaratan dari
 * IMPACT_AT; renderer menentukan fase yang digambar dari konstanta yang sama. Kalau keduanya
 * memegang angkanya sendiri-sendiri, HP akan turun sebelum atau sesudah ledakan terlihat dan
 * tidak ada satu test pun yang menangkapnya.
 */

/**
 * Akhir fase charge: glow menempel pada caster sampai di sini.
 *
 * KETIGANYA SATU SISTEM, seperti tiga konstanta gerak di arena.ts. Angkanya dipilih supaya
 * travel muat menampung salvo rudal yang berjenjang — 1040 ms pada durasi 2600 — sementara
 * impact justru dipersempit jadi ~180 ms. Kontras itulah yang menggantikan freeze frame dan
 * slow-motion, yang keduanya dilarang: bobot sebuah ledakan harus dipikul perbedaan tempo
 * antar-fase, karena permainan tidak boleh berhenti sedetik pun untuk memberinya panggung.
 *
 * Mengubah satu tanpa yang lain memecah entah keterbacaan salvo, entah ketajaman impact.
 */
export const CHARGE_END = 0.15
/** Akhir fase travel — sekaligus saat damage mendarat. */
export const TRAVEL_END = 0.55
export const IMPACT_AT = TRAVEL_END
/** Akhir kilatan impact; sisanya, 0.62–1, adalah aftermath. */
export const IMPACT_END = 0.62

export interface UltimateTiming {
  totalTicks: number
  /** Jarak tick dari tembak ke pendaratan. */
  landsAfterTicks: number
}

/**
 * `durationMs` sudah harus dikalikan pengali tier dan durationMultiplier oleh pemanggil —
 * lapisan ini tidak tahu apa-apa soal config game. `tickMs` masuk sebagai argumen karena
 * TICK_MS tinggal di lapisan game dan shared/ tidak boleh mengimpor dari sana.
 *
 * SETIAP ultimate memakai kurva yang sama, seramai apa pun antreannya. Pernah ada mode
 * ekspres di sini — durasi 40% dan charge yang dilewati saat backlog belum kosong — dan ia
 * dibuang atas keputusan creator: penonton yang membayar berhak melihat animasi yang sama
 * dengan yang dilihat orang sebelumnya, dan dua ultimate berdampingan dengan tempo berbeda
 * terbaca sebagai kerusakan, bukan sebagai antrean yang efisien.
 */
export function ultimateTiming(durationMs: number, tickMs: number): UltimateTiming {
  const totalTicks = Math.max(1, Math.round(durationMs / tickMs))
  return { totalTicks, landsAfterTicks: Math.round(totalTicks * IMPACT_AT) }
}

export function ultimateProgressAt(elapsedTicks: number, timing: UltimateTiming): number {
  const raw = elapsedTicks / timing.totalTicks
  if (raw < 0) return 0
  return raw > 1 ? 1 : raw
}
