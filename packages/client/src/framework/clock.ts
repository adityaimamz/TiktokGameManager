/**
 * Sumber waktu monotonik dalam milidetik.
 *
 * Framework dan kode game DILARANG memanggil Date.now() atau performance.now()
 * langsung — keduanya lewat sini agar test bisa memajukan waktu secara eksplisit.
 */
export interface Clock {
  now(): number
}

export interface ManualClock extends Clock {
  advance(ms: number): void
  set(ms: number): void
}

/** Clock produksi. Memakai performance.now() bila tersedia, jatuh ke Date.now(). */
export function systemClock(): Clock {
  const hasPerf = typeof performance !== 'undefined' && typeof performance.now === 'function'
  return { now: hasPerf ? () => performance.now() : () => Date.now() }
}

/** Clock untuk test: hanya bergerak saat advance()/set() dipanggil. */
export function createManualClock(start = 0): ManualClock {
  let t = start
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms
    },
    set: (ms: number) => {
      t = ms
    },
  }
}
