import type { Entity, EntityInit } from './entity.js'

let nextId = 0

/** Hanya untuk test — mengembalikan penomoran id ke nol. */
export function resetEntityIds(): void {
  nextId = 0
}

export function createEntity(type: string, init: EntityInit = {}): Entity {
  return {
    id: `${type}#${nextId++}`,
    type,
    position: { x: init.x ?? 0, y: init.y ?? 0 },
    velocity: { x: init.vx ?? 0, y: init.vy ?? 0 },
    lifetime: init.lifetime ?? -1,
    active: true,
  }
}
