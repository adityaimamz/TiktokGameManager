/**
 * Satu titik cahaya sebagai TIGA LAPIS, bukan satu bentuk padat ber-`shadowBlur`.
 *
 * Arah gayanya sci-fi/realistis: core mendekati putih, badan bersaturasi tinggi, glow lebih
 * lebar dan lebih gelap. Outline tebal dan garis keras tidak pernah dipakai di sini.
 *
 * `shadowBlur` TIDAK PERNAH disetel di berkas ini, dan itu keputusan performa yang mengikat.
 * Menolak cache bentuk prosedural — demi determinisme lintas-tab — berarti semua ini dihitung
 * dan digambar ULANG TIAP FRAME; pada ~290 partikel, tiga fill ber-blur per partikel
 * menghabiskan seluruh anggaran 4 ms sendirian. Lapisan beralpha memberi kelembutan yang sama
 * tanpa itu, dan lebih sesuai arah gayanya: blur melebar merata, sementara lapisan bisa
 * menjaga core tetap tajam sekaligus glow tetap lebar.
 *
 * `shadowBlur` disisakan untuk elemen besar yang jumlahnya bisa dihitung jari — core berkas
 * laser, bolt utama petir, dan bola api bomb.
 */
const LAYERS: readonly { scale: number; alpha: number; white: boolean }[] = [
  { scale: 1, alpha: 0.22, white: false },
  { scale: 0.62, alpha: 0.55, white: false },
  { scale: 0.28, alpha: 0.95, white: true },
]

export function layeredGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  colour: string,
  alpha: number,
): void {
  if (alpha <= 0 || radius <= 0) return

  ctx.globalCompositeOperation = 'lighter'
  for (const layer of LAYERS) {
    ctx.globalAlpha = alpha * layer.alpha
    ctx.fillStyle = layer.white ? '#ffffff' : colour
    ctx.beginPath()
    ctx.arc(x, y, radius * layer.scale, 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * Warna ketiga lapis sebuah GARIS cahaya, dari terluar ke terdalam.
 *
 * Dipisah jadi tiga alih-alih satu warna + putih karena `lightning` butuh badan biru-putih
 * yang berbeda dari glow warna sisinya, sementara `laser` memang cukup dengan warna sisi di
 * dua lapis luar.
 */
export type GlowPalette = readonly [glow: string, body: string, core: string]

export const GLOW_LAYERS = 3

const STROKE_WIDTHS: readonly number[] = [4.5, 2, 1]
const STROKE_ALPHAS: readonly number[] = [0.22, 0.55, 0.95]

/**
 * Menyiapkan gaya lapis ke-`layer` sebuah garis cahaya, lalu BERHENTI.
 *
 * Pemanggilnya yang menelusuri path dan memanggil `stroke()` — tiap lapis punya lebar sendiri
 * sehingga path-nya memang harus ditelusuri ulang. Menerima callback penelusur akan mengalokasi
 * satu closure per garis per frame, dan jalur ini berjalan enam puluh kali per detik.
 *
 * `coreWidth` adalah lebar lapis TERDALAM, bukan terluar: §2.1 spec meminta laser tipis, dan
 * satu-satunya angka yang punya arti di sana adalah setebal apa core-nya.
 */
export function strokeLayer(
  ctx: CanvasRenderingContext2D,
  layer: number,
  palette: GlowPalette,
  coreWidth: number,
  alpha: number,
): void {
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = coreWidth * (STROKE_WIDTHS[layer] ?? 1)
  ctx.globalAlpha = alpha * (STROKE_ALPHAS[layer] ?? 1)
  ctx.strokeStyle = palette[layer] ?? palette[2]
}
