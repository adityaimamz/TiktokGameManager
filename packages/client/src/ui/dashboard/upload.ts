import { serverBaseUrl } from '../../platform/server-url.js'
/**
 * Berkas dikirim sebagai badan request, bukan multipart.
 *
 * Server memakai express.raw() dengan daftar tipe yang diizinkan, jadi tidak ada multer, tidak
 * ada boundary parsing, dan tidak ada dependensi baru — satu fetch sudah cukup. Gambar, GIF,
 * dan mp3 semuanya lewat sini; yang memutuskan tipe mana yang sah adalah server.
 */
/**
 * Satu handler untuk kedua pengunggah.
 *
 * `ImageField` dan `Soundboard` sama-sama lewat `uploadFile`, jadi kabelnya dipasang di sini
 * dan bukan sebagai prop di masing-masing komponen: satu tempat, dan pengunggah ketiga ikut
 * tercakup gratis. Pesan galat di panel TETAP tampil — ini tambahan, bukan pengganti.
 *
 * ponytail: satu handler global; jadikan daftar pelanggan hanya kalau pendengarnya lebih dari satu.
 */
let uploadErrorHandler: ((message: string) => void) | null = null

export function setUploadErrorHandler(handler: ((message: string) => void) | null): void {
  uploadErrorHandler = handler
}

export async function uploadFile(
  file: File,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const response = await fetchImpl(`${serverBaseUrl()}/api/uploads`, {
      method: 'POST',
      headers: { 'content-type': file.type },
      body: file,
    })
    if (!response.ok) {
      uploadErrorHandler?.('Berkas gagal diunggah.')
      return null
    }
    const body = (await response.json()) as { url?: unknown }
    // Server menjawab path relatif; di deploy terpisah path itu menunjuk ke CDN halaman,
    // bukan ke server. ponytail: URL absolut ikut tersimpan di config creator, jadi
    // memindahkan server membuat latar lama gagal dimuat — unggah ulang, atau simpan
    // path relatif dan gabungkan saat render kalau itu jadi masalah.
    return typeof body.url === 'string' ? `${serverBaseUrl()}${body.url}` : null
  } catch {
    // Server mati tidak boleh menjatuhkan panel; pemanggil menampilkan pesan dan lanjut.
    uploadErrorHandler?.('Server tidak menjawab saat mengunggah.')
    return null
  }
}
