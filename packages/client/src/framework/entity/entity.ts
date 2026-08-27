export interface Vec2 {
  x: number
  y: number
}

/**
 * Struktur bersama semua objek game.
 *
 * `type` sengaja berupa string bebas, bukan union tertutup: framework tidak boleh
 * mengetahui jenis entity apa saja yang dipakai sebuah game.
 */
export interface Entity {
  /** Identitas slot pool. Stabil sepanjang umur instance, dipakai ulang setelah release. */
  id: string
  type: string
  position: Vec2
  velocity: Vec2
  /** Sisa umur dalam milidetik, atau -1 untuk tak terbatas. */
  lifetime: number
  active: boolean
}

export interface EntityInit {
  x?: number
  y?: number
  vx?: number
  vy?: number
  lifetime?: number
}
