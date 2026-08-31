import type { Action } from './action.js'

/**
 * Wrapper internal yang membawa nomor urut penyisipan.
 *
 * Nomor urut dipakai `drain()` untuk menggabungkan dua wadah terurut dalam
 * satu lintasan dua-pointer (merge step), tanpa sort ulang O(n log n).
 */
interface QueueEntry<A> {
  action: A
  seq: number
}

/**
 * Opsi yang diterima constructor bentuk objek.
 *
 * Semua opsional — default menghasilkan perilaku yang sama persis dengan
 * ActionQueue lama (ring buffer 500, tanpa callback).
 */
export interface ActionQueueOptions {
  /** Kapasitas ring buffer untuk action biasa (non-neverEvict). Bawaan 500. */
  capacity?: number
  /**
   * Ambang panjang wadah neverEvict yang memicu `onHighWaterMark`.
   * Bawaan 200. Hanya berarti kalau `onHighWaterMark` juga disediakan.
   */
  highWaterMark?: number
  /**
   * Dipanggil saat panjang wadah neverEvict mencapai atau melewati `highWaterMark`.
   *
   * Panggilan ini bisa terjadi LEBIH DARI SEKALI sepanjang umur queue: flag
   * di-reset setiap kali `drain()` dipanggil, sehingga lonjakan baru setelah
   * drain sebelumnya mengosongkan wadah tetap terpantau.
   */
  onHighWaterMark?: (count: number) => void
}

/**
 * Antrean FIFO dua-wadah.
 *
 * Wadah pertama — ring buffer berkapasitas tetap — menampung action biasa dan
 * membuang entri tertua saat penuh (perilaku lama, efisien untuk lonjakan
 * komentar/like). Wadah kedua — array dinamis — menampung action yang ditandai
 * `neverEvict` dan TIDAK PERNAH membuangnya karena kapasitas; ia tumbuh sesuai
 * kebutuhan dan dikosongkan setiap `drain()`.
 *
 * `drain()` menggabungkan kedua wadah dalam urutan penyisipan global (FIFO)
 * lewat merge dua-pointer, tanpa pengurutan ulang.
 */
export class ActionQueue<A extends Action = Action> {
  // ── Ring buffer: action biasa (neverEvict falsy) ──────────────────────
  private readonly ring: (QueueEntry<A> | undefined)[]
  private head = 0
  private tail = 0
  private _ringSize = 0

  // ── Array dinamis: action yang dilindungi (neverEvict === true) ───────
  private neverEvictQueue: QueueEntry<A>[] = []

  // ── Nomor urut global ────────────────────────────────────────────────
  private _nextSeq = 0

  // ── Observability ────────────────────────────────────────────────────
  private _droppedCount = 0
  private readonly _capacity: number
  private readonly _highWaterMark: number
  private readonly _onHighWaterMark: ((count: number) => void) | undefined
  private _highWaterMarkEmitted = false

  /**
   * Menerima angka tunggal (backward compat) atau objek opsi.
   *
   * ```ts
   * new ActionQueue()          // kapasitas 500, tanpa callback
   * new ActionQueue(100)       // kapasitas 100, tanpa callback (backward compat)
   * new ActionQueue({ capacity: 100, highWaterMark: 50, onHighWaterMark: fn })
   * ```
   */
  constructor(capacityOrOpts?: number | ActionQueueOptions) {
    let capacity = 500
    let highWaterMark = 200
    let onHighWaterMark: ((count: number) => void) | undefined

    if (typeof capacityOrOpts === 'number') {
      capacity = capacityOrOpts
    } else if (capacityOrOpts !== undefined) {
      capacity = capacityOrOpts.capacity ?? 500
      highWaterMark = capacityOrOpts.highWaterMark ?? 200
      onHighWaterMark = capacityOrOpts.onHighWaterMark
    }

    if (capacity < 1) throw new Error('ActionQueue capacity must be at least 1')
    this._capacity = capacity
    this._highWaterMark = highWaterMark
    this._onHighWaterMark = onHighWaterMark
    this.ring = new Array<QueueEntry<A> | undefined>(capacity)
  }

  /** Kapasitas ring buffer (action biasa). */
  get capacity(): number {
    return this._capacity
  }

  /** Jumlah total action di kedua wadah. */
  get size(): number {
    return this._ringSize + this.neverEvictQueue.length
  }

  /** Jumlah action biasa (non-neverEvict) yang dibuang karena kapasitas penuh. */
  get droppedCount(): number {
    return this._droppedCount
  }

  /** Jumlah action neverEvict yang saat ini mengantre. */
  get neverEvictSize(): number {
    return this.neverEvictQueue.length
  }

  enqueue(a: A): void {
    const seq = this._nextSeq++

    if (a.neverEvict) {
      this.neverEvictQueue.push({ action: a, seq })

      if (
        this._onHighWaterMark !== undefined &&
        this.neverEvictQueue.length >= this._highWaterMark &&
        !this._highWaterMarkEmitted
      ) {
        this._highWaterMarkEmitted = true
        this._onHighWaterMark(this.neverEvictQueue.length)
      }
      return
    }

    // Non-neverEvict: ring buffer, drop-oldest saat penuh (perilaku lama).
    if (this._ringSize === this._capacity) {
      this.ring[this.head] = undefined
      this.head = (this.head + 1) % this._capacity
      this._ringSize--
      this._droppedCount++
    }
    this.ring[this.tail] = { action: a, seq }
    this.tail = (this.tail + 1) % this._capacity
    this._ringSize++
  }

  dequeue(): A | undefined {
    if (this._ringSize === 0 && this.neverEvictQueue.length === 0) return undefined

    // Ambil dari wadah yang entri terdepannya ber-seq terkecil.
    const ringEntry = this._ringSize > 0 ? this.ring[this.head] : undefined
    const neqEntry = this.neverEvictQueue.length > 0 ? this.neverEvictQueue[0] : undefined

    if (ringEntry !== undefined && (neqEntry === undefined || ringEntry.seq < neqEntry.seq)) {
      this.ring[this.head] = undefined
      this.head = (this.head + 1) % this._capacity
      this._ringSize--
      return ringEntry.action
    }

    if (neqEntry !== undefined) {
      this.neverEvictQueue.shift()
      return neqEntry.action
    }

    return undefined
  }

  /**
   * Memproses semua action yang ada SAAT INI, dalam urutan penyisipan global.
   *
   * Implementasinya dua-pointer merge (seperti merge step di merge sort):
   * ring buffer dan neverEvictQueue masing-masing sudah terurut by seq secara
   * internal, jadi merge O(n) cukup. Action yang di-enqueue dari dalam handler
   * tertinggal untuk drain berikutnya — snapshot kedua wadah diambil di awal.
   *
   * Setelah selesai, kedua wadah kosong:
   * `this._ringSize === 0 && this.neverEvictQueue.length === 0`
   */
  drain(handler: (a: A) => void): number {
    // ── Reset high water mark supaya spike berikutnya bisa trigger ulang ──
    this._highWaterMarkEmitted = false

    // ── Snapshot ukuran saat ini (action yang masuk selama drain tertunda) ──
    const ringCount = this._ringSize
    const neq = this.neverEvictQueue

    // Pisahkan neverEvictQueue SEKARANG: ganti referensi dengan array kosong
    // baru, sehingga enqueue() selama handler mengisi array BARU dan tidak
    // mencemari batch ini.
    const neqCount = neq.length
    if (neqCount > 0) {
      this.neverEvictQueue = []
    }

    const totalCount = ringCount + neqCount

    if (totalCount === 0) return 0

    // ── Two-pointer merge ───────────────────────────────────────────────
    // Pointer ring: baca dari head, maju ringProcessed kali.
    // Pointer neq: baca dari index 0..neqCount-1.
    let ringProcessed = 0
    let neqIdx = 0

    while (ringProcessed < ringCount || neqIdx < neqCount) {
      // Ambil entry terdepan dari masing-masing wadah (yang belum diproses).
      const ringEntry =
        ringProcessed < ringCount ? this.ring[this.head] : undefined
      const neqEntry =
        neqIdx < neqCount ? neq[neqIdx] : undefined

      if (ringEntry !== undefined && (neqEntry === undefined || ringEntry.seq < neqEntry.seq)) {
        // Ring buffer menang: proses dan majukan head.
        this.ring[this.head] = undefined
        this.head = (this.head + 1) % this._capacity
        this._ringSize--
        ringProcessed++
        handler(ringEntry.action)
      } else if (neqEntry !== undefined) {
        // neverEvictQueue menang (atau ring habis): proses dan majukan idx.
        neqIdx++
        handler(neqEntry.action)
      }
    }

    return totalCount
  }

  clear(): void {
    this.ring.fill(undefined)
    this.head = 0
    this.tail = 0
    this._ringSize = 0
    this.neverEvictQueue = []
  }
}
