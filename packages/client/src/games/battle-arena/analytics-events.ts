import type { EngineEvent } from './events.js'

export interface MappedAnalyticsEvent {
  type: string
  payload: Record<string, unknown>
}

/**
 * `EngineEvent` → payload analytics, atau `null` untuk event yang sengaja tidak dicatat.
 *
 * `actionApplied`, `actionDiscarded`, dan `joinRejected` dikecualikan dengan sengaja: yang
 * pertama menembak setiap kali AI menyerang — puluhan kali per detik dengan 200 fighter —
 * dan mencatatnya akan menghabiskan `ANALYTICS_CAPACITY` sebelum event yang berarti sempat
 * masuk. Hanya event bervolume rendah dan bermakna bisnis yang dipetakan.
 *
 * Payload sengaja tidak pernah membawa `Fighter` utuh — hanya `platform` dan `side`, yang
 * cukup untuk funnel engagement tanpa menyeret username atau posisi mentah ke `payload`
 * jsonb.
 */
export function toAnalyticsEvent(event: EngineEvent): MappedAnalyticsEvent | null {
  switch (event.type) {
    case 'stateChanged':
      return { type: event.type, payload: { from: event.from, to: event.to } }
    case 'fighterJoined':
      return {
        type: event.type,
        payload: { platform: event.fighter.platform, side: event.fighter.side, outcome: event.outcome },
      }
    case 'fighterDied':
      return {
        type: event.type,
        payload: {
          platform: event.fighter.platform,
          side: event.fighter.side,
          killerPlatform: event.killer?.platform ?? null,
        },
      }
    case 'roundEnded':
      return { type: event.type, payload: { winner: event.winner, roundIndex: event.roundIndex } }
    case 'matchEnded':
      return { type: event.type, payload: { winner: event.winner } }
    case 'realViewerArrived':
      return { type: event.type, payload: { removedDemoFighters: event.removedDemoFighters } }
    default:
      return null
  }
}
