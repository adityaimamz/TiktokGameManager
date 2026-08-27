import type { NukeTier } from '../config/index.js'
import type { InterpolatedUltimate } from './interpolate.js'
import type { UltimatePhase } from './ultimate.js'

/**
 * Kosakata bersama kerangka ultimate: penjepit ke bidang arena, dan tipe yang dipakai
 * keenam varian jalur FX.
 *
 * Berkas ini pernah juga MENGGAMBAR (`drawUltimateArt` beserta charge, reticle, vignette,
 * dan aftermath-nya), dan namanya berasal dari masa itu. Sejak jalur FX jadi satu-satunya
 * yang hidup, yang tersisa di sini hanyalah kosakata — namanya dibiarkan supaya sebelas
 * baris impor tidak perlu bergerak demi kerapian nama.
 */

export const clampToArena = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value

/** Satu sasaran yang sudah diselesaikan dari slot ke piksel. */
export interface FrameTarget {
  x: number
  y: number
  alive: boolean
}

/** Segala yang keempat varian butuhkan, dihitung sekali per gambar. */
export interface UltimateFrame {
  /** Warna sisi CASTER — penonton harus bisa membaca siapa yang menembak. */
  colour: string
  /** Titik asal dalam piksel; mengikuti caster selama charge, beku sesudahnya. */
  ox: number
  oy: number
  /** Pusat separuh lawan dalam piksel. */
  tx: number
  ty: number
  left: number
  right: number
  top: number
  bottom: number
  phase: UltimatePhase
  /** Kemajuan 0–1 di dalam fase yang sedang berjalan. */
  local: number
  /** Progress mentah 0–1. Dibutuhkan varian yang waktunya melewati batas fase. */
  progress: number
  /**
   * Sasaran yang sudah diselesaikan ke piksel dari `targetSlots`.
   *
   * Dipakai ulang antar-frame; selalu berhenti di `targetCount`.
   */
  targets: FrameTarget[]
  targetCount: number
  /**
   * Record asalnya, untuk besaran waktu yang dikirim engine.
   *
   * HANYA `staggerProgress` dan `msPerProgress` yang sah dibaca dari sini. Sisanya sudah
   * diterjemahkan ke piksel di field lain frame ini, dan membacanya lagi dari `source`
   * berarti melewatkan penjepitan arena.
   */
  source: InterpolatedUltimate
  tier: NukeTier
}
