import type { Action } from './action.js'

/**
 * Antrean FIFO berkapasitas tetap di atas ring buffer.
 *
 * Saat penuh, action tertua dibuang agar lonjakan event tidak pernah memblokir
 * atau menumbuhkan memori tanpa batas.
 */
export class ActionQueue<A extends Action = Action> {
  private readonly buffer: (A | undefined)[]
  private head = 0
  private tail = 0
  private _size = 0
  private _droppedCount = 0

  constructor(private readonly capacity = 500) {
    if (capacity < 1) throw new Error('ActionQueue capacity must be at least 1')
    this.buffer = new Array<A | undefined>(capacity)
  }

  get size(): number {
    return this._size
  }

  get droppedCount(): number {
    return this._droppedCount
  }

  enqueue(a: A): void {
    if (this._size === this.capacity) {
      this.buffer[this.head] = undefined
      this.head = (this.head + 1) % this.capacity
      this._size--
      this._droppedCount++
    }
    this.buffer[this.tail] = a
    this.tail = (this.tail + 1) % this.capacity
    this._size++
  }

  dequeue(): A | undefined {
    if (this._size === 0) return undefined
    const a = this.buffer[this.head]
    this.buffer[this.head] = undefined
    this.head = (this.head + 1) % this.capacity
    this._size--
    return a
  }

  /**
   * Memproses semua action yang ada SAAT INI. Action yang di-enqueue dari dalam
   * handler tertinggal untuk drain berikutnya.
   */
  drain(handler: (a: A) => void): number {
    const count = this._size
    for (let i = 0; i < count; i++) {
      const a = this.dequeue()
      if (a !== undefined) handler(a)
    }
    return count
  }

  clear(): void {
    this.buffer.fill(undefined)
    this.head = 0
    this.tail = 0
    this._size = 0
  }
}
