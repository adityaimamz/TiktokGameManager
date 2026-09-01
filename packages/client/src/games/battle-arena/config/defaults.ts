import { EFFECT_TYPES, SOUND_EVENTS } from './schema.js'
import type {
  BattleArenaConfig,
  EffectConfig,
  EffectType,
  SoundConfig,
  SoundEvent,
  TriggerRule,
} from './schema.js'

/** Enam rule bawaan: join per sisi, Grow lewat like, dan tiga contoh gift yang masih mati. */
function defaultTriggers(): TriggerRule[] {
  return [
    {
      id: 'join-a',
      label: 'Join Side A',
      enabled: true,
      when: { kind: 'comment', matchSide: 'a' },
      then: { actionType: 'spawn', target: 'sideA', value: 0 },
      legend: { show: true, caption: 'JOIN {side}', icon: 'join' },
    },
    {
      id: 'join-b',
      label: 'Join Side B',
      enabled: true,
      when: { kind: 'comment', matchSide: 'b' },
      then: { actionType: 'spawn', target: 'sideB', value: 0 },
      legend: { show: true, caption: 'JOIN {side}', icon: 'join' },
    },
    {
      id: 'join-c',
      label: 'Join Side C',
      enabled: true,
      when: { kind: 'comment', matchSide: 'c' },
      then: { actionType: 'spawn', target: 'sideC', value: 0 },
      legend: { show: true, caption: 'JOIN {side}', icon: 'join' },
    },
    {
      id: 'join-d',
      label: 'Join Side D',
      enabled: true,
      when: { kind: 'comment', matchSide: 'd' },
      then: { actionType: 'spawn', target: 'sideD', value: 0 },
      legend: { show: true, caption: 'JOIN {side}', icon: 'join' },
    },
    {
      id: 'grow-hp',
      label: 'Grow my blob (HP)',
      enabled: true,
      when: { kind: 'like', everyNLikes: 10 },
      then: { actionType: 'grow', target: 'sender', value: 5 },
      legend: { show: true, caption: 'GROW HP', icon: 'like' },
    },
    {
      id: 'gift-heal',
      label: 'Gift heals my blob',
      enabled: false,
      when: { kind: 'gift', giftNames: ['Rose'], minCount: 1 },
      then: { actionType: 'heal', target: 'sender', value: 50 },
      legend: { show: true, caption: 'HEAL ME', icon: 'gift' },
    },
    {
      id: 'gift-hasten',
      label: 'Gift speeds up my attacks',
      enabled: false,
      when: { kind: 'gift', giftNames: ['Finger Heart'], minCount: 1 },
      then: { actionType: 'hasten', target: 'sender', value: 250 },
      legend: { show: true, caption: 'FASTER ATTACKS', icon: 'gift' },
    },
    {
      id: 'gift-barrage',
      label: 'Big gift barrages the enemy',
      enabled: false,
      when: { kind: 'gift', giftNames: [], minCount: 5 },
      then: { actionType: 'damage', target: 'sideB', value: 20 },
      legend: { show: true, caption: 'BARRAGE {side}', icon: 'gift' },
    },
  ]
}

function defaultEffects(): Record<EffectType, EffectConfig> {
  const out = {} as Record<EffectType, EffectConfig>
  for (const type of EFFECT_TYPES) out[type] = { intensity: 1, durationMultiplier: 1 }
  return out
}

function defaultSound(): Record<SoundEvent, SoundConfig> {
  const out = {} as Record<SoundEvent, SoundConfig>
  for (const event of SOUND_EVENTS) out[event] = { enabled: true, volume: 0.8 }
  return out
}

/**
 * Config yang langsung bisa dipakai tanpa input creator (Req 31 AC2).
 *
 * Selalu membangun objek baru — tidak boleh ada satu pun referensi bersama, karena
 * config yang dimuat dari penyimpanan akan dimutasi di atas hasil fungsi ini.
 */
export function defaultConfig(): BattleArenaConfig {
  return {
    schemaVersion: 2,
    ui: {
      showJoinedMessages: true,
      showFloatingDamage: true,
      showFighterNames: false,
      showTopFighters: true,
      leaderboardEntries: 5,
      screenShake: true,
    },
    sides: {
      a: { name: 'Team A', keyword: 'a', aliases: [], color: '#3b82f6', backgroundImage: null },
      b: { name: 'Team B', keyword: 'b', aliases: [], color: '#ef4444', backgroundImage: null },
      c: { name: 'Team C', keyword: 'c', aliases: [], color: '#10b981', backgroundImage: null },
      d: { name: 'Team D', keyword: 'd', aliases: [], color: '#f59e0b', backgroundImage: null },
    },
    gameplay: {
      sideCount: 2,
      winMode: 'firstToNKills',
      roundsBestOf: 5,
      killsToWinRound: 30,
      maxFightersPerSide: 30,
      maxTriggersPerGift: 10,
      baseHp: 200,
      baseDamage: 10,
      attackIntervalSec: 1,
      hpGainedPerGrow: 5,
      growMode: 'flat',
      nuke: {
        type: 'missileRain',
        damage: 50,
        durationMs: 2600,
        hardCap: 6,
        calloutHoldMs: 1800,
        blastRadiusPct: 9,
        particleBase: 24,
        missile: {
          baseCount: 4,
          turnRateDegPerSec: 300,
          launchStaggerMs: 100,
          speedPctPerSec: 120,
        },
        lightning: { branches: 3 },
        laser: { targetRule: 'highestHp' },
        tiers: [
          { minCoins: 0, durationMultiplier: 1, densityMultiplier: 1, radiusMultiplier: 1, calloutIntensity: 1 },
          { minCoins: 100, durationMultiplier: 1, densityMultiplier: 1.5, radiusMultiplier: 1.4, calloutIntensity: 1.5 },
          { minCoins: 1000, durationMultiplier: 1, densityMultiplier: 2, radiusMultiplier: 1.8, calloutIntensity: 2 },
        ],
      },
      autoJoinGifter: true,
      countdownDurationSec: 5,
      celebrationDurationSec: 5,
      idleMovement: true,
      practiceFighters: true,
    },
    likes: { threshold: 10 },
    triggers: defaultTriggers(),
    effects: defaultEffects(),
    sound: defaultSound(),
    simulation: { commentsPerSecond: 0.6, likesPerSecond: 2, giftsPerSecond: 0.1 },
    overlay: {
      transparency: 100,
      mode: 'fullscreen',
      orientation: 'portrait',
      arenaBackground: { kind: 'transparent' },
      flashCeiling: 0.45,
      flashCeilingReducedMotion: 0.15,
    },
    filler: { enabled: false, items: [], imageDurationSec: 15 },
  }
}
