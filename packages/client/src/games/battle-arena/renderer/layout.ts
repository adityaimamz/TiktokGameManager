import {
  ARENA_MAX,
  ARENA_MIDLINE,
  ARENA_MIN,
  BOTTOM_ZONE_RATIO,
  FIGHTER_DIAMETER_PX,
  REFERENCE_STAGE_HEIGHT,
  STAGE_ASPECT,
  TOP_ZONE_RATIO,
} from '../arena.js'
import type { Orientation } from '../config/index.js'

/**
 * Tata letak bidang tayang: tiga zona bertumpuk (§9.0).
 *
 * Satu-satunya tempat persen arena berubah jadi piksel. Canvas dan React sama-sama
 * membacanya, sehingga HUD tidak mungkin bergeser terhadap arena saat jendela diubah.
 */

/*
 * Konstanta bidang tayang kini tinggal di `arena.ts`: hitbox fighter diturunkan dari
 * diameter blob dan tinggi zona arena, jadi engine harus bisa membacanya tanpa menutup
 * lingkaran impor lewat modul renderer. Di-re-export dari sini supaya pemanggil lama
 * tidak perlu tahu ia pindah.
 */
export {
  TOP_ZONE_RATIO,
  BOTTOM_ZONE_RATIO,
  REFERENCE_STAGE_HEIGHT,
  FIGHTER_DIAMETER_PX,
  STAGE_ASPECT,
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface StageLayout {
  stage: Rect
  top: Rect
  arena: Rect
  bottom: Rect
  scale: number
  orientation: Orientation
}

/** Kotak terbesar dengan rasio benar yang muat di container, tanpa terpotong. */
export function fitStage(
  containerWidth: number,
  containerHeight: number,
  orientation: Orientation,
): Rect {
  const aspect = STAGE_ASPECT[orientation]
  if (containerWidth <= 0 || containerHeight <= 0) return { x: 0, y: 0, width: 0, height: 0 }

  const widthBound = containerWidth / containerHeight < aspect
  const width = widthBound ? containerWidth : containerHeight * aspect
  const height = widthBound ? containerWidth / aspect : containerHeight

  return {
    x: (containerWidth - width) / 2,
    y: (containerHeight - height) / 2,
    width,
    height,
  }
}

export function computeStageLayout(
  containerWidth: number,
  containerHeight: number,
  orientation: Orientation,
): StageLayout {
  const stage = fitStage(containerWidth, containerHeight, orientation)
  const topHeight = stage.height * TOP_ZONE_RATIO
  const bottomHeight = stage.height * BOTTOM_ZONE_RATIO

  return {
    stage,
    top: { x: stage.x, y: stage.y, width: stage.width, height: topHeight },
    arena: {
      x: stage.x,
      y: stage.y + topHeight,
      width: stage.width,
      height: stage.height - topHeight - bottomHeight,
    },
    bottom: {
      x: stage.x,
      y: stage.y + stage.height - bottomHeight,
      width: stage.width,
      height: bottomHeight,
    },
    scale: stage.height / REFERENCE_STAGE_HEIGHT,
    orientation,
  }
}

const span = ARENA_MAX - ARENA_MIN

export function arenaX(layout: StageLayout, percent: number): number {
  return layout.arena.x + ((percent - ARENA_MIN) / span) * layout.arena.width
}

export function arenaY(layout: StageLayout, percent: number): number {
  return layout.arena.y + ((percent - ARENA_MIN) / span) * layout.arena.height
}

export function arenaLengthX(layout: StageLayout, percent: number): number {
  return (percent / span) * layout.arena.width
}

export function arenaLengthY(layout: StageLayout, percent: number): number {
  return (percent / span) * layout.arena.height
}

/** Arena selalu terbelah kiri/kanan, juga di portrait (§6.4). */
export function arenaMidlineX(layout: StageLayout): number {
  return arenaX(layout, ARENA_MIDLINE)
}

/** Ukuran piksel desain yang mengikuti tinggi panggung sebenarnya. */
export function scaled(layout: StageLayout, px: number): number {
  return px * layout.scale
}

export function fighterDiameter(layout: StageLayout): number {
  return scaled(layout, FIGHTER_DIAMETER_PX)
}
