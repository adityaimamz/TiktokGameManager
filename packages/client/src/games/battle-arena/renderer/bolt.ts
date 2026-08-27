/**
 * Bentuk satu sambaran petir sebagai ANGKA, tanpa canvas sama sekali.
 *
 * Midpoint displacement: dua ujung ditetapkan, lalu tiap titik tengah digeser tegak lurus
 * dengan amplitudo yang separuh tiap tingkat. Itu yang menghasilkan patahan berjenjang — kasar
 * di skala besar, halus di skala kecil — alih-alih gigi gergaji berpola yang langsung terbaca
 * sebagai gambar buatan.
 *
 * Simpangannya diturunkan dari `(seed, indeks)` lewat pola hash yang sudah dipakai
 * `shakeOffset`, bukan dari angka acak: renderer ada di bawah games/ tempat `Math.random()`
 * dilarang, dan frame yang sama harus selalu menghasilkan bentuk yang sama supaya tab dashboard
 * dan tab overlay mustahil menggambar petir yang berbeda.
 *
 * Ia hidup di berkasnya sendiri karena `lightning.ts` memanggilnya di TIGA tempat — sambaran
 * utama, cabang, dan arc sekunder — dan karena geometrinya justru bagian yang paling bisa
 * diuji tanpa satu pun perintah gambar.
 */

/** Berapa kali jalurnya dibagi dua. Empat tingkat = 17 titik: cukup patah, belum jadi bulu. */
export const DISPLACEMENT_LEVELS = 4

export const BOLT_POINTS = 2 ** DISPLACEMENT_LEVELS + 1

/** −1..1 dari satu bilangan, deterministik. Pola yang sama dengan `shakeOffset`. */
function hash(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453
  return (s - Math.floor(s)) * 2 - 1
}

export function boltPath(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  amplitude: number,
  seed: number,
  out: number[],
): number[] {
  out.length = BOLT_POINTS * 2

  const dx = x1 - x0
  const dy = y1 - y0
  // Kedua ujung boleh berimpit — sasaran yang berdiri persis di titik pusat area bukan kasus
  // langka. Panjang nol memberi normal sembarang, dan itu lebih baik daripada NaN.
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  // Normal satuan: SELURUH simpangan tegak lurus arah sambaran, jadi bentuknya tetap terbaca
  // sebagai satu jalur berapa pun arahnya — termasuk saat petir menyeberang mendatar.
  const nx = -dy / len
  const ny = dx / len

  const last = BOLT_POINTS - 1
  out[0] = x0
  out[1] = y0
  out[last * 2] = x1
  out[last * 2 + 1] = y1

  let step = last
  let amp = amplitude
  while (step > 1) {
    const half = step / 2
    for (let i = half; i < last; i += step) {
      const a = (i - half) * 2
      const b = (i + half) * 2
      const mx = ((out[a] as number) + (out[b] as number)) / 2
      const my = ((out[a + 1] as number) + (out[b + 1] as number)) / 2
      const push = hash(seed * 131.7 + i * 7.31) * amp
      out[i * 2] = mx + nx * push
      out[i * 2 + 1] = my + ny * push
    }
    step = half
    amp *= 0.5
  }

  return out
}
