/**
 * URL gambar → gambar siap pakai, atau null selama belum siap.
 *
 * Renderer tidak boleh menunggu apa pun: satu frame yang menahan diri demi gambar latar
 * berarti seluruh panggung tersendat. Selama pemuatan berjalan, pemanggil menerima null dan
 * menggambar tanpa latar.
 */

export interface ImageLike {
  complete: boolean
  naturalWidth: number
}

function defaultLoad(url: string): ImageLike {
  const image = new Image()
  image.src = url
  return image
}

export function createImageCache(
  load: (url: string) => ImageLike = defaultLoad,
): (url: string) => CanvasImageSource | null {
  const cache = new Map<string, ImageLike>()

  return (url) => {
    let image = cache.get(url)
    if (image === undefined) {
      image = load(url)
      cache.set(url, image)
    }
    // naturalWidth ikut diperiksa: gambar yang gagal dimuat juga berakhir complete.
    return image.complete && image.naturalWidth > 0 ? (image as unknown as CanvasImageSource) : null
  }
}
