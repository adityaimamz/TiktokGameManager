import type { ReactElement, ReactNode } from 'react'
import {
  ROUNDS_BEST_OF_VALUES,
  SIDE_NAME_MAX_LENGTH,
} from '../../../games/battle-arena/config/index.js'
import type { BattleArenaConfig, RoundsBestOf } from '../../../games/battle-arena/config/index.js'
import type { SideId } from '../../../games/battle-arena/types.js'
import { Accordion } from './Accordion.js'
import { ColorField, NumberField, SelectField, TextField, Toggle } from './Field.js'
import { ImageField } from './ImageField.js'
import {
  formatAliases,
  parseAliases,
  soundRows,
  toggleRows,
  withGameplay,
  withOverlay,
  withSide,
  withSimulation,
  withSound,
  withToggle,
  withUi,
} from './game-settings.js'

export interface GameSettingsProps {
  config: BattleArenaConfig
  onConfig: (config: BattleArenaConfig) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Sub-section memakai <details> native: nol kode accordion, keyboard dan cari-di-halaman gratis. */
function Group(props: { title: string; children: ReactNode }): ReactElement {
  return (
    <details className="border-t border-edge-dim pt-2" open>
      <summary className="panel-title cursor-pointer py-1">{props.title}</summary>
      <div className="pb-2">{props.children}</div>
    </details>
  )
}

function SideGroup(props: {
  side: SideId
  label: string
  config: BattleArenaConfig
  onConfig: (config: BattleArenaConfig) => void
}): ReactElement {
  const side = props.config.sides[props.side]
  const patch = (next: Parameters<typeof withSide>[2]): void =>
    props.onConfig(withSide(props.config, props.side, next))

  return (
    <Group title={props.label}>
      <TextField
        label={`Nama ${props.label}`}
        value={side.name}
        maxLength={SIDE_NAME_MAX_LENGTH}
        onChange={(name) => patch({ name })}
      />
      <TextField
        label={`Alias ${props.label}`}
        value={formatAliases(side.aliases)}
        maxLength={120}
        placeholder="dipisah koma, maksimal 5"
        onChange={(raw) => patch({ aliases: parseAliases(raw) })}
      />
      <ColorField
        label={`Warna ${props.label}`}
        value={side.color}
        onChange={(color) => patch({ color })}
      />
      <ImageField
        label={`Latar ${props.label}`}
        value={side.backgroundImage}
        onChange={(backgroundImage) => patch({ backgroundImage })}
      />
    </Group>
  )
}

export function GameSettings(props: GameSettingsProps): ReactElement {
  const { config, onConfig } = props

  return (
    <section>
      <Accordion title="Game settings" open={props.open} onOpenChange={props.onOpenChange}>
        <div className="flex flex-col">
          <SideGroup side="a" label="Side A" config={config} onConfig={onConfig} />
          <SideGroup side="b" label="Side B" config={config} onConfig={onConfig} />

          <Group title="Match">
            <SelectField
              label="Win mode"
              value={config.gameplay.winMode}
              options={[{ value: 'firstToNKills', label: 'First to N kills' }]}
              onChange={(winMode) => onConfig(withGameplay(config, { winMode }))}
            />
            <SelectField
              label="Rounds (best of)"
              value={config.gameplay.roundsBestOf}
              options={ROUNDS_BEST_OF_VALUES.map((value) => ({ value, label: String(value) }))}
              onChange={(roundsBestOf) =>
                onConfig(withGameplay(config, { roundsBestOf: roundsBestOf as RoundsBestOf }))
              }
            />
            <NumberField
              label="Kill untuk memenangkan ronde"
              field="gameplay.killsToWinRound"
              value={config.gameplay.killsToWinRound}
              onCommit={(killsToWinRound) => onConfig(withGameplay(config, { killsToWinRound }))}
            />
            <NumberField
              label="Maksimal fighter per sisi"
              field="gameplay.maxFightersPerSide"
              value={config.gameplay.maxFightersPerSide}
              onCommit={(maxFightersPerSide) =>
                onConfig(withGameplay(config, { maxFightersPerSide }))
              }
            />
            <NumberField
              label="HP per grow"
              field="gameplay.hpGainedPerGrow"
              value={config.gameplay.hpGainedPerGrow}
              onCommit={(hpGainedPerGrow) => onConfig(withGameplay(config, { hpGainedPerGrow }))}
            />
            <SelectField
              label="Mode grow"
              value={config.gameplay.growMode === 'perLike' ? 'perLike' : 'flat'}
              options={[
                { value: 'flat', label: 'Tetap per pemicu' },
                { value: 'perLike', label: 'Per like' },
              ]}
              onChange={(growMode) =>
                onConfig(withGameplay(config, { growMode: growMode as 'flat' | 'perLike' }))
              }
            />
            <NumberField
              label="Base HP"
              field="gameplay.baseHp"
              value={config.gameplay.baseHp}
              onCommit={(baseHp) => onConfig(withGameplay(config, { baseHp }))}
            />
            <NumberField
              label="Base damage"
              field="gameplay.baseDamage"
              value={config.gameplay.baseDamage}
              onCommit={(baseDamage) => onConfig(withGameplay(config, { baseDamage }))}
            />
            <NumberField
              label="Jeda serangan (detik)"
              field="gameplay.attackIntervalSec"
              value={config.gameplay.attackIntervalSec}
              onCommit={(attackIntervalSec) => onConfig(withGameplay(config, { attackIntervalSec }))}
            />
            <NumberField
              label="Hitung mundur (detik)"
              field="gameplay.countdownDurationSec"
              value={config.gameplay.countdownDurationSec}
              onCommit={(countdownDurationSec) =>
                onConfig(withGameplay(config, { countdownDurationSec }))
              }
            />
            <NumberField
              label="Perayaan (detik)"
              field="gameplay.celebrationDurationSec"
              value={config.gameplay.celebrationDurationSec}
              onCommit={(celebrationDurationSec) =>
                onConfig(withGameplay(config, { celebrationDurationSec }))
              }
            />
          </Group>

          <Group title="Tampilan">
            {toggleRows(config).map((row) => (
              <Toggle
                key={row.key}
                label={row.label}
                checked={row.checked}
                onChange={(value) => onConfig(withToggle(config, row.key, value))}
              />
            ))}
            {config.ui.showTopFighters ? (
              <NumberField
                label="Jumlah entri papan"
                field="ui.leaderboardEntries"
                value={config.ui.leaderboardEntries}
                onCommit={(leaderboardEntries) => onConfig(withUi(config, { leaderboardEntries }))}
              />
            ) : null}
          </Group>

          <Group title="Overlay">
            <NumberField
              label="Transparansi"
              field="overlay.transparency"
              value={config.overlay.transparency}
              onCommit={(transparency) => onConfig(withOverlay(config, { transparency }))}
            />
            <SelectField
              label="Orientasi"
              value={config.overlay.orientation}
              options={[
                { value: 'portrait', label: 'Portrait 9:16' },
                { value: 'landscape', label: 'Landscape 16:9' },
              ]}
              onChange={(orientation) =>
                onConfig(
                  withOverlay(config, { orientation: orientation as 'portrait' | 'landscape' }),
                )
              }
            />
            <SelectField
              label="Latar arena"
              value={config.overlay.arenaBackground.kind}
              options={[
                { value: 'transparent', label: 'Transparan' },
                { value: 'color', label: 'Warna' },
                { value: 'image', label: 'Gambar' },
              ]}
              onChange={(kind) =>
                onConfig(
                  withOverlay(config, {
                    arenaBackground:
                      kind === 'color'
                        ? { kind: 'color', value: '#0d0e14' }
                        : kind === 'image'
                          ? { kind: 'image', url: '' }
                          : { kind: 'transparent' },
                  }),
                )
              }
            />
            {config.overlay.arenaBackground.kind === 'color' ? (
              <ColorField
                label="Warna latar arena"
                value={config.overlay.arenaBackground.value}
                onChange={(value) =>
                  onConfig(withOverlay(config, { arenaBackground: { kind: 'color', value } }))
                }
              />
            ) : null}
            {config.overlay.arenaBackground.kind === 'image' ? (
              <ImageField
                label="Gambar latar arena"
                value={
                  config.overlay.arenaBackground.url === ''
                    ? null
                    : config.overlay.arenaBackground.url
                }
                onChange={(url) =>
                  onConfig(
                    withOverlay(config, { arenaBackground: { kind: 'image', url: url ?? '' } }),
                  )
                }
              />
            ) : null}
          </Group>

          <Group title="Sound">
            {soundRows(config).map((row) => (
              <div key={row.event}>
                <Toggle
                  label={row.label}
                  checked={row.enabled}
                  onChange={(enabled) => onConfig(withSound(config, row.event, { enabled }))}
                />
                {row.enabled ? (
                  <input
                    className="w-full accent-tally"
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={row.volume}
                    aria-label={`Volume ${row.label}`}
                    onChange={(event) =>
                      onConfig(withSound(config, row.event, { volume: Number(event.target.value) }))
                    }
                  />
                ) : null}
              </div>
            ))}
          </Group>

          {/* Bukan "Simulator": panel Simulator sudah ada sendiri di kolom yang sama. */}
          <Group title="Laju simulasi">
            <NumberField
              label="Komentar per detik"
              field="simulation.commentsPerSecond"
              value={config.simulation.commentsPerSecond}
              onCommit={(commentsPerSecond) =>
                onConfig(withSimulation(config, { commentsPerSecond }))
              }
            />
            <NumberField
              label="Like per detik"
              field="simulation.likesPerSecond"
              value={config.simulation.likesPerSecond}
              onCommit={(likesPerSecond) => onConfig(withSimulation(config, { likesPerSecond }))}
            />
            <NumberField
              label="Gift per detik"
              field="simulation.giftsPerSecond"
              value={config.simulation.giftsPerSecond}
              onCommit={(giftsPerSecond) => onConfig(withSimulation(config, { giftsPerSecond }))}
            />
            <p className="note mt-1">
              Rata-rata, bukan kadens tetap: tiap aliran dijitter supaya chat datang bergerombol
              lalu diam seperti live sungguhan. Jumlah penonton sintetis mengikuti batas fighter
              per sisi.
            </p>
          </Group>
        </div>
      </Accordion>
    </section>
  )
}
