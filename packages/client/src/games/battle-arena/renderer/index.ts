export { AvatarCache, initialFor } from './avatar-cache.js'
export type { AvatarImage, AvatarLoader, AvatarCacheOptions } from './avatar-cache.js'

export { DEATH_FADE_MS, DeathFade } from './death-fade.js'

export { HP_CATCHUP_MS, HpDisplay } from './hp-display.js'

export { flashAlpha, phaseProgress, tierFor, ultimatePhaseAt } from './ultimate.js'
export type { UltimatePhase } from './ultimate.js'

export { clampToArena } from './ultimate-draw.js'
export type { FrameTarget, UltimateFrame } from './ultimate-draw.js'

export {
  BattleArenaRenderer,
  clearStage,
  drawArenaFlash,
  drawEffects,
  drawFighters,
  drawProjectiles,
  drawZones,
  hpColor,
  truncate,
} from './canvas.js'
export type { BattleArenaRendererOptions, RenderDeps } from './canvas.js'

export {
  alphaFromElapsed,
  extrapolateProjectile,
  interpolateFighters,
  interpolateUltimates,
  lerp,
  lerpAngle,
} from './interpolate.js'
export type { InterpolatedFighter, InterpolatedUltimate, Point } from './interpolate.js'

export {
  BOTTOM_ZONE_RATIO,
  FIGHTER_DIAMETER_PX,
  REFERENCE_STAGE_HEIGHT,
  STAGE_ASPECT,
  TOP_ZONE_RATIO,
  arenaLengthX,
  arenaLengthY,
  arenaMidlineX,
  arenaX,
  arenaY,
  computeStageLayout,
  fighterDiameter,
  fitStage,
  scaled,
} from './layout.js'
export type { Rect, StageLayout } from './layout.js'

export { ActionLegend } from './hud/ActionLegend.js'
export { Callout } from './hud/Callout.js'
export type { ActionLegendProps } from './hud/ActionLegend.js'
export { Hud } from './hud/Hud.js'
export type { HudProps } from './hud/Hud.js'
export { ScoreBar } from './hud/ScoreBar.js'
export { TopFighters } from './hud/TopFighters.js'
export { Feeds } from './hud/Feeds.js'
export { VictoryBanner } from './hud/VictoryBanner.js'

export {
  FEED_ENTRANCE_MS,
  FEED_ENTRANCE_OFFSET_PX,
  FEED_FADE_MS,
  GIFT_FEED_MAX,
  GIFT_FEED_TTL_MS,
  JOIN_FEED_MAX,
  JOIN_FEED_TTL_MS,
  KILL_FEED_MAX,
  KILL_FEED_TTL_MS,
  feedEntrance,
  feedEntryFromEvent,
  feedOpacity,
  pruneFeed,
  pushFeed,
} from './hud/feed.js'
export type { FeedEntry, GiftFeedEntry, JoinFeedEntry, KillFeedEntry } from './hud/feed.js'

export {
  CALLOUT_MAX_ROWS,
  calloutModel,
  mvp,
  scoreBarModel,
  topFighters,
  victoryModel,
} from './hud/view-model.js'
export type {
  CalloutModel,
  CalloutRow,
  FighterRow,
  ScoreBarModel,
  ScoreSideModel,
  VictoryModel,
} from './hud/view-model.js'
