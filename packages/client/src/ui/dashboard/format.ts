/**
 * Pemisah ribuan gaya Indonesia, tanpa `toLocaleString`.
 *
 * Node yang dibangun dengan ICU kecil diam-diam jatuh ke en-US dan mencetak "2,481" —
 * kesalahan yang lolos test di mesin pengembang dan muncul di mesin lain.
 */
export function formatCount(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** "kurang dari semenit" | "41 menit" | "1 jam" | "1 jam 5 menit" */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(Math.max(0, ms) / 60_000)
  if (totalMinutes < 1) return 'kurang dari semenit'

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes} menit`
  return minutes === 0 ? `${hours} jam` : `${hours} jam ${minutes} menit`
}

/**
 * "0:42" | "4:12" | "1:03:20" — durasi satu match.
 *
 * Bukan `formatDuration`: granularitasnya menit, sementara di daftar riwayat justru detik
 * yang membedakan match 40 detik dari match 55 detik. Keduanya hidup berdampingan; yang
 * pertama melayani panel Live Stats, yang ini melayani baris riwayat.
 */
export function formatClock(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000)
  const seconds = String(total % 60).padStart(2, '0')
  const minutes = Math.floor(total / 60) % 60
  const hours = Math.floor(total / 3600)
  if (hours === 0) return `${minutes}:${seconds}`
  return `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
}
