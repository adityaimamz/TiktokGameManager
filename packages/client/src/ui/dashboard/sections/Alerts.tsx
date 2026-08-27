import type { ReactElement } from 'react'
import {
  ALERT_GIFT_COINS_RANGE,
  ALERT_LABEL,
  ALERT_LIKES_RANGE,
} from '../../../platform/signals/index.js'
import type { AlertRule, CatalogEntry } from '../../../platform/signals/index.js'
import { Accordion } from './Accordion.js'
import { NumberField, SelectField, TextField, Toggle } from './Field.js'

export interface AlertsProps {
  alerts: readonly AlertRule[]
  cues: readonly CatalogEntry[]
  onAlerts: (next: AlertRule[]) => void
}

const THRESHOLD_LABEL: Partial<Record<AlertRule['kind'], string>> = {
  gift: 'Minimum koin',
  likes: 'Tiap berapa like',
}

const TEXT_MAX = 80

/**
 * Section STREAM SETTINGS yang sengaja tidak dirender di Fase 1 (§10 spec induk).
 *
 * Keempat rule memakai bentuk yang sama, jadi form-nya satu perulangan alih-alih empat
 * cabang. Ambang hanya muncul untuk rule yang benar-benar memakainya.
 */
export function Alerts(props: AlertsProps): ReactElement {
  const active = props.alerts.filter((rule) => rule.enabled).length
  // Musik bukan media alert: satu alert tidak boleh membajak trek latar yang sedang berputar.
  const options = [
    { value: '', label: 'Tanpa media' },
    ...props.cues
      .filter((cue) => cue.kind !== 'music')
      .map((cue) => ({ value: cue.id, label: cue.label })),
  ]

  const update = (kind: AlertRule['kind'], patch: Partial<AlertRule>): void => {
    props.onAlerts(
      props.alerts.map((rule) => (rule.kind === kind ? { ...rule, ...patch } : { ...rule })),
    )
  }

  return (
    <Accordion title="STREAM SETTINGS" count={`${active} alert aktif`}>
      {props.alerts.map((rule) => (
        <div className="border-t border-edge/60 py-1.5 first:border-t-0" key={rule.kind}>
          <Toggle
            label={ALERT_LABEL[rule.kind]}
            checked={rule.enabled}
            onChange={(enabled) => update(rule.kind, { enabled })}
          />
          {rule.enabled ? (
            <>
              {THRESHOLD_LABEL[rule.kind] === undefined ? null : (
                <NumberField
                  label={THRESHOLD_LABEL[rule.kind] as string}
                  value={rule.threshold}
                  range={{
                    label: THRESHOLD_LABEL[rule.kind] as string,
                    range: rule.kind === 'gift' ? ALERT_GIFT_COINS_RANGE : ALERT_LIKES_RANGE,
                  }}
                  onCommit={(threshold) => update(rule.kind, { threshold })}
                />
              )}
              <TextField
                label="Teks banner"
                value={rule.text}
                maxLength={TEXT_MAX}
                placeholder="{user} mengirim {value}!"
                onChange={(text) => update(rule.kind, { text })}
              />
              <SelectField
                label={`Media alert ${ALERT_LABEL[rule.kind]}`}
                value={rule.cueId ?? ''}
                options={options}
                onChange={(value) => update(rule.kind, { cueId: value === '' ? null : value })}
              />
            </>
          ) : null}
        </div>
      ))}
    </Accordion>
  )
}
