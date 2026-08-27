export { createRng } from './rng.js'
export type { Rng } from './rng.js'

export { createManualClock, systemClock } from './clock.js'
export type { Clock, ManualClock } from './clock.js'

export { createEntity, resetEntityIds } from './entity/factory.js'
export { EntityPool } from './entity/pool.js'
export type { Entity, EntityInit, Vec2 } from './entity/entity.js'

export { TickScheduler } from './loop/tick-scheduler.js'
export type { TickResult, TickSchedulerOptions } from './loop/tick-scheduler.js'
export { RenderLoop } from './loop/render-loop.js'
export type { FrameCanceller, FrameScheduler, RenderLoopOptions } from './loop/render-loop.js'

export { ActionQueue } from './actions/queue.js'
export type { Action } from './actions/action.js'

export { circlesOverlap, distanceSquared } from './collision/circle.js'

export { EffectPool, effectProgress } from './effects/pool.js'
export type { Effect, EffectSpawn } from './effects/pool.js'

export { SoundQueue } from './sound/queue.js'
export type { SoundQueueOptions } from './sound/queue.js'

export type {
  IGameConfig,
  IGameEffects,
  IGameEngine,
  IGameRenderer,
  IGameSimulation,
  IGameTriggers,
} from './types/plugin.js'
