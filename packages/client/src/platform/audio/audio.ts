/**
 * Bunyi disintesis di tempat, bukan diputar dari berkas (Req 1 AC5).
 *
 * Id bertipe string dan bukan SoundEvent milik game mana pun: lapisan ini tidak boleh tahu
 * game apa yang sedang aktif. Resep yang tidak dikenal tetap berbunyi dengan nada cadangan,
 * karena game kedua yang meminta bunyi baru lebih baik terdengar salah daripada diam tanpa
 * satu pun petunjuk.
 */

export interface AudioParamLike {
  value?: number
  setValueAtTime(value: number, time: number): void
  linearRampToValueAtTime(value: number, time: number): void
}

export interface GainLike {
  gain: AudioParamLike
  connect(destination: unknown): void
  disconnect(): void
}

export interface OscillatorLike {
  type: string
  frequency: AudioParamLike
  connect(destination: unknown): void
  start(time: number): void
  stop(time: number): void
}

export interface AudioContextLike {
  currentTime: number
  state: string
  destination: unknown
  createGain(): GainLike
  createOscillator(): OscillatorLike
  resume(): Promise<void>
  close(): Promise<void>
}

export interface AudioEngineOptions {
  /** Diinjeksi di test. Mengembalikan null berarti browser tidak menyediakan audio. */
  createContext?: () => AudioContextLike | null
}

interface Recipe {
  wave: string
  /** Frekuensi awal dan akhir dalam Hz; sama berarti nada datar. */
  from: number
  to: number
  ms: number
  gain: number
}

/** Delapan SoundEvent Battle Arena kebetulan memakai nama yang sama; tabel ini tetap generik. */
const RECIPES: Record<string, Recipe> = {
  attack: { wave: 'square', from: 320, to: 180, ms: 70, gain: 0.22 },
  hit: { wave: 'triangle', from: 900, to: 220, ms: 90, gain: 0.3 },
  heal: { wave: 'sine', from: 420, to: 880, ms: 260, gain: 0.26 },
  death: { wave: 'sawtooth', from: 260, to: 60, ms: 320, gain: 0.3 },
  join: { wave: 'sine', from: 520, to: 780, ms: 160, gain: 0.24 },
  countdown: { wave: 'square', from: 660, to: 660, ms: 120, gain: 0.26 },
  roundWin: { wave: 'triangle', from: 520, to: 1040, ms: 500, gain: 0.34 },
  matchWin: { wave: 'sine', from: 440, to: 1320, ms: 900, gain: 0.38 },
}

const FALLBACK: Recipe = { wave: 'sine', from: 440, to: 440, ms: 120, gain: 0.22 }

function defaultContext(): AudioContextLike | null {
  const Ctor = (globalThis as { AudioContext?: new () => AudioContextLike }).AudioContext
  if (Ctor === undefined) return null
  try {
    return new Ctor()
  } catch {
    return null
  }
}

export class AudioEngine {
  private readonly ctx: AudioContextLike | null
  private readonly master: GainLike | null
  private muted = false

  constructor(opts: AudioEngineOptions = {}) {
    this.ctx = (opts.createContext ?? defaultContext)()
    if (this.ctx === null) {
      this.master = null
      return
    }
    this.master = this.ctx.createGain()
    this.master.gain.value = 1
    this.master.connect(this.ctx.destination)
  }

  /** Panjang bunyi dalam ms — dipakai SoundQueue untuk menghitung konkurensi. */
  durationMs(id: string): number {
    return (RECIPES[id] ?? FALLBACK).ms
  }

  play(id: string, volume: number): void {
    const ctx = this.ctx
    const master = this.master
    if (ctx === null || master === null) return

    const recipe = RECIPES[id] ?? FALLBACK
    const now = ctx.currentTime
    const end = now + recipe.ms / 1000

    const oscillator = ctx.createOscillator()
    oscillator.type = recipe.wave
    oscillator.frequency.setValueAtTime(recipe.from, now)
    if (recipe.to !== recipe.from) oscillator.frequency.linearRampToValueAtTime(recipe.to, end)

    // Envelope turun ke nol: tanpa itu tiap bunyi berakhir dengan klik yang terdengar jelas
    // di stream, karena gelombang dipotong di tengah siklus.
    const envelope = ctx.createGain()
    const peak = recipe.gain * Math.max(0, Math.min(1, volume))
    envelope.gain.setValueAtTime(peak, now)
    envelope.gain.linearRampToValueAtTime(0, end)

    oscillator.connect(envelope)
    envelope.connect(master)
    oscillator.start(now)
    oscillator.stop(end)
  }

  /**
   * Mute menyetel gain master, BUKAN menghentikan antrean.
   *
   * Antrean tetap berjalan saat dibungkam, sehingga melepas mute langsung berbunyi normal
   * alih-alih meledakkan bunyi yang tertunda.
   */
  setMuted(muted: boolean): void {
    this.muted = muted
    if (this.master !== null) this.master.gain.value = muted ? 0 : 1
  }

  get isMuted(): boolean {
    return this.muted
  }

  /**
   * AudioContext lahir `suspended` dan browser menolak membunyikan apa pun sebelum ada
   * gestur user. Tanpa panggilan ini seluruh panel Sound terlihat bekerja dan senyap total,
   * tanpa satu pun pesan error.
   */
  async resume(): Promise<void> {
    if (this.ctx === null) return
    try {
      await this.ctx.resume()
    } catch {
      // Browser menolak; bunyi berikutnya akan mencoba lagi.
    }
  }

  dispose(): void {
    this.master?.disconnect()
    void this.ctx?.close().catch(() => {})
  }
}
