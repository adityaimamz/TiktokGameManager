import type { ReactElement } from 'react'
import type { BattleArenaConfig } from '../../../games/battle-arena/config/index.js'
import type { SideId } from '../../../games/battle-arena/types.js'
import { UltimateButtons } from '../ultimate.js'
import type { UltimateButtonsProps } from '../ultimate.js'
import { Accordion } from './Accordion.js'
import { TEST_ACTIONS } from './test-actions.js'
import type { TestActionId } from './test-actions.js'

export interface TestActionsProps {
  onFire: (id: TestActionId) => void
  /** Warna swatch. Opsional supaya test komponen tidak perlu membangun config. */
  config?: BattleArenaConfig
  /** Opsional: tanpanya blok Uji ultimate tidak dirender (dipakai test komponen). */
  ultimate?: UltimateButtonsProps
}

export function TestActions(props: TestActionsProps): ReactElement {
  const color = (side: SideId): string =>
    props.config?.sides[side].color ?? (side === 'a' ? '#3b82f6' : '#ef4444')

  return (
    <section>
      <Accordion title="Aksi uji">
        <div className="grid grid-cols-2 gap-2">
          {TEST_ACTIONS.map((button) => (
            <button
              className={`btn btn-wide ${button.side === null ? 'col-span-2' : ''}`.trim()}
              key={button.id}
              type="button"
              onClick={() => props.onFire(button.id)}
            >
              {button.side === null ? null : (
                <span
                  className="mr-[7px] inline-block h-2 w-2 rounded-sm align-[1px]"
                  style={{ background: color(button.side) }}
                />
              )}
              {button.label}
            </button>
          ))}
        </div>

        {/* Ultimate hidup di sini, bukan di panel sendiri: sama-sama alat uji yang hanya
            disentuh saat menyiapkan sesi. */}
        {props.ultimate === undefined ? null : (
          <>
            <div className="my-3 h-px bg-white/10" />
            <UltimateButtons {...props.ultimate} />
          </>
        )}
      </Accordion>
    </section>
  )
}
