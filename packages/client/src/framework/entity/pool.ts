import type { Entity, EntityInit } from './entity.js'
import { createEntity } from './factory.js'

/** Indeks internal untuk penghapusan O(1) dari daftar aktif. */
const INDEX = Symbol('poolIndex')

interface Indexed {
  [INDEX]?: number
}

/**
 * Kumpulan entity yang dipakai ulang.
 *
 * Setelah warmup tidak ada alokasi baru selama pool belum kehabisan, sehingga
 * tekanan garbage collector tetap datar meski ratusan entity lahir dan mati
 * setiap detik.
 */
export class EntityPool<T extends Entity = Entity> {
  private readonly free: T[] = []
  private readonly activeList: T[] = []
  private _capacity = 0

  constructor(
    private readonly type: string,
    initialSize: number,
    private readonly make: (type: string) => T = (t) => createEntity(t) as T,
  ) {
    for (let i = 0; i < initialSize; i++) {
      const e = this.make(this.type)
      e.active = false
      this.free.push(e)
      this._capacity++
    }
  }

  get capacity(): number {
    return this._capacity
  }

  get activeCount(): number {
    return this.activeList.length
  }

  acquire(init: EntityInit = {}): T {
    let e = this.free.pop()
    if (e === undefined) {
      e = this.make(this.type)
      this._capacity++
    }
    e.position.x = init.x ?? 0
    e.position.y = init.y ?? 0
    e.velocity.x = init.vx ?? 0
    e.velocity.y = init.vy ?? 0
    e.lifetime = init.lifetime ?? -1
    e.active = true
    ;(e as T & Indexed)[INDEX] = this.activeList.length
    this.activeList.push(e)
    return e
  }

  release(e: T): void {
    if (!e.active) return
    e.active = false

    const indexed = e as T & Indexed
    const idx = indexed[INDEX] ?? -1
    const last = this.activeList.pop()
    if (last !== undefined && last !== e && idx >= 0) {
      this.activeList[idx] = last
      ;(last as T & Indexed)[INDEX] = idx
    }
    indexed[INDEX] = -1
    this.free.push(e)
  }

  releaseAll(): void {
    for (let i = this.activeList.length - 1; i >= 0; i--) {
      const e = this.activeList[i] as T
      e.active = false
      ;(e as T & Indexed)[INDEX] = -1
      this.free.push(e)
    }
    this.activeList.length = 0
  }

  /**
   * Iterasi mundur, sehingga melepas entity yang sedang dikunjungi aman.
   * Melepas entity LAIN di dalam callback tidak didukung.
   */
  forEachActive(fn: (e: T) => void): void {
    for (let i = this.activeList.length - 1; i >= 0; i--) {
      fn(this.activeList[i] as T)
    }
  }
}
