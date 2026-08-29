/**
 * Batas satu unggahan, dan SATU angka untuk kedua sisi kabel.
 *
 * Server menegakkannya lewat `express.raw({ limit })`; klien memakainya untuk menolak berkas
 * sebelum satu byte pun naik. Dua salinan pasti menyimpang, dan yang menyimpang paling
 * mahal adalah klien yang mengizinkan lebih besar daripada server: creator menunggu unggahan
 * 300 MB selesai hanya untuk dijawab 413.
 *
 * 50 MB diturunkan dari kebutuhan: klip filler 20 detik pada 640x360 CRF 28 tanpa audio itu
 * 1-2 MB, jadi ini memberi ruang untuk 1080p apa adanya tanpa membuka pintu untuk film.
 */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

/** Bentuk yang dibaca `express.raw({ limit })`, diturunkan dari angka yang sama. */
export const MAX_UPLOAD_LIMIT = `${MAX_UPLOAD_BYTES / (1024 * 1024)}mb`
