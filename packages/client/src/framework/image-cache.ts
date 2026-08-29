/**
 * URL gambar → gambar siap pakai PADA UKURAN YANG DIMINTA, atau null selama belum siap.
 *
 * Renderer tidak boleh menunggu apa pun: satu frame yang menahan diri demi gambar latar
 * berarti seluruh panggung tersendat. Selama pemuatan berjalan, pemanggil menerima null dan
 * menggambar tanpa latar.
 *
 * Ukurannya ikut jadi urusan cache karena penskalaan adalah biaya per-frame yang tidak ada
 * di jalur mana pun sampai latar FOTO diizinkan. `drawImage(img, x, y, w, h)` atas sebuah
 * `HTMLImageElement` 4000×3000 meresample penuh setiap kali dipanggil — enam puluh kali per
 * detik, dan beberapa kali per frame kalau satu panggung memasang lebih dari satu latar —
 * sementara peramban tidak menyimpan hasilnya dengan andal. Diskalakan sekali ke sebuah
 * canvas, ia juga jadi lebih tajam: satu `drawImage` beropsi kualitas tinggi mengalahkan
 * resample cepat yang dipilih peramban untuk jalur real-time.
 */

export interface ImageLike {
  complete: boolean
  naturalWidth: number
}

/** Tempat menampung salinan berskala. Diinjeksi supaya test bisa jalan tanpa DOM. */
export interface ScaleTarget {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
}

interface Entry {
  image: ImageLike
  target: ScaleTarget | null
  width: number
  height: number
}

function defaultLoad(url: string): ImageLike {
  const image = new Image()
  image.src = url
  return image
}

/** null saat tidak ada DOM (node/test) atau peramban menolak context 2D. */
function defaultTarget(): ScaleTarget | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  return ctx === null ? null : { canvas, ctx }
}

export function createImageCache(
  load: (url: string) => ImageLike = defaultLoad,
  target: () => ScaleTarget | null = defaultTarget,
): (url: string, width: number, height: number) => CanvasImageSource | null {
  const cache = new Map<string, Entry>()

  return (url, width, height) => {
    let entry = cache.get(url)
    if (entry === undefined) {
      entry = { image: load(url), target: null, width: 0, height: 0 }
      cache.set(url, entry)
    }

    // naturalWidth ikut diperiksa: gambar yang gagal dimuat juga berakhir complete.
    const { image } = entry
    if (!image.complete || image.naturalWidth <= 0) return null
    const source = image as unknown as CanvasImageSource

    const w = Math.max(1, Math.round(width))
    const h = Math.max(1, Math.round(height))

    // Tanpa canvas — node, atau peramban yang menolak context 2D — jalurnya persis seperti
    // sebelum cache ini bisa menskalakan: gambar aslinya, diresample oleh pemanggil.
    entry.target ??= target()
    if (entry.target === null) return source

    // ponytail: satu ukuran tersimpan per URL. URL yang sama diminta pada DUA ukuran
    // berbeda dalam satu frame akan saling membatalkan cache dan menskalakan ulang terus;
    // kunci per `url|w|h` kalau ternyata ada yang memakainya begitu.
    if (entry.width !== w || entry.height !== h) {
      entry.target.canvas.width = w
      entry.target.canvas.height = h
      // SESUDAH resize, tidak sebelum: mengubah `canvas.width` mereset state context-nya,
      // termasuk kualitas penghalusan yang justru jadi alasan jalur ini ada.
      entry.target.ctx.imageSmoothingQuality = 'high'
      entry.target.ctx.drawImage(source, 0, 0, w, h)
      entry.width = w
      entry.height = h
    }
    return entry.target.canvas
  }
}
