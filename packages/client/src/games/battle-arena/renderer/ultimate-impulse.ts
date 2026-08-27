/**
 * Antarmuka `Impulse`: apa yang `drawFighters` butuh dari sebuah pendorong ultimate.
 *
 * INI SATU-SATUNYA tempat penggambaran fighter mengetahui ada ultimate. Dua permintaan yang
 * berbeda dilayani satu mekanisme: bom mendorong fighter menjauh, dan petir membuat yang
 * tersambar berkedip putih (Plan 6c-2). Dua seam terpisah untuk keduanya berarti dua jalur
 * yang pasti menyimpang.
 *
 * Pelaksananya kini `UltimateFxImpulse` di `fx/fx-impulse.ts`. Kelas `UltimateImpulse` yang
 * dulu tinggal di sini dibuang bersama jalur gambar lama — antarmukanya tetap di sini karena
 * `canvas.ts` dan jalur FX sama-sama membacanya.
 */
export interface Impulse {
  dx: number
  dy: number
  /** 0–1; seberapa putih fighter digambar. Diisi `lightning`, selalu nol untuk `bomb`. */
  flash: number
}
