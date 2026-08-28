/**
 * CanvasRenderingContext2D palsu yang mencatat apa yang digambar.
 *
 * Hanya untuk test — dependency-cruiser menolak impor direktori ini dari kode produksi.
 * Test menegaskan urutan layer dan argumen gambar, bukan piksel, sehingga tidak perlu
 * canvas asli dan tetap jalan di environment node.
 */

export interface DrawCall {
  op: string
  args: unknown[]
}

export interface RecordingContext {
  readonly calls: DrawCall[]
  ops(): string[]
  callsOf(op: string): DrawCall[]
  firstIndexOf(op: string): number
  reset(): void
}

export function createRecordingContext(
  width = 1600,
  height = 900,
): CanvasRenderingContext2D & RecordingContext {
  const calls: DrawCall[] = []
  const own: Record<string, unknown> = {
    calls,
    canvas: { width, height },
    measureText: (text: string) => ({ width: String(text).length * 6 }),
    ops: () => calls.map((call) => call.op),
    callsOf: (op: string) => calls.filter((call) => call.op === op),
    firstIndexOf: (op: string) => calls.findIndex((call) => call.op === op),
    reset: () => {
      calls.length = 0
    },
  }

  const proxy = new Proxy(own, {
    get(target, prop) {
      if (typeof prop === 'symbol') return undefined
      const existing = target[prop]
      if (existing !== undefined) return existing
      const recorder = (...args: unknown[]): undefined => {
        calls.push({ op: prop, args })
        return undefined
      }
      target[prop] = recorder
      return recorder
    },
    set(target, prop, value) {
      if (typeof prop !== 'symbol') calls.push({ op: `set:${prop}`, args: [value] })
      target[prop as string] = value
      return true
    },
  })

  return proxy as unknown as CanvasRenderingContext2D & RecordingContext
}
