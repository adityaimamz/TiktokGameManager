import type { ReactElement } from 'react'
import {
  GIFT_MIN_COUNT_RANGE,
  KEYWORD_MAX_LENGTH,
  LEGEND_CAPTION_MAX_LENGTH,
  MAX_TRIGGER_RULES,
  RULE_LABEL_MAX_LENGTH,
} from '../../../games/battle-arena/config/index.js'
import type { BattleArenaConfig } from '../../../games/battle-arena/config/index.js'
import type { BattleActionType, TargetKind } from '../../../games/battle-arena/actions.js'
import { useGiftCatalog } from '../../useGiftCatalog.js'
import { Accordion } from './Accordion.js'
import { NumberField, SelectField, TextField, Toggle } from './Field.js'
import {
  ACTION_TYPE_OPTIONS,
  TARGET_OPTIONS,
  WHEN_OPTIONS,
  actionChoiceOf,
  addRule,
  removeRule,
  giftPicks,
  toggleGiftName,
  triggerCards,
  withActionChoice,
  withGiftNames,
  withHpGainedPerGrow,
  withKeyword,
  withLikeThreshold,
  withMinCount,
  withLegendCaption,
  withRuleEnabled,
  withRuleLegendShown,
  withRuleLabel,
  withThen,
  withWhen,
} from './action-triggers.js'
import type { ActionChoice } from './action-triggers.js'

export interface ActionTriggersProps {
  config: BattleArenaConfig
  onConfig: (config: BattleArenaConfig) => void
  /** Hanya untuk test komponen; produksi memakai fetch bawaan. */
  fetchImpl?: typeof fetch
  /** Room yang sedang tersambung — penanda untuk meminta ulang katalog gift. */
  roomId?: string | null
}

const WHEN_ICON: Record<string, string> = { comment: '💬', like: '♡', gift: '🎁', follow: '＋' }

/** Nilai `then.value` yang ditulis ulang validateConfig tidak boleh bisa diketik di sini. */
const VALUE_OWNED_BY_CONFIG: readonly BattleActionType[] = ['grow', 'nuke', 'spawn']

/**
 * Editor rule penuh — tanpa state draft dan tanpa tombol Save.
 *
 * Setiap perubahan langsung masuk config dan mengalir lewat debounce `flushConfig` yang
 * sudah ada, sama seperti seluruh panel setelan. Yang TIDAK bisa diketik di sini adalah
 * angka yang ditulis ulang validateConfig — ambang like, HP per grow, damage nuke — karena
 * menulis ke sana berarti menulis ke tempat yang akan ditimpa saat config dimuat ulang.
 */
export function ActionTriggers(props: ActionTriggersProps): ReactElement {
  const { catalog, reload } = useGiftCatalog(props.fetchImpl, props.roomId ?? null)
  const cards = triggerCards(props.config)
  const active = cards.filter((card) => card.enabled).length
  const atLimit = props.config.triggers.length >= MAX_TRIGGER_RULES

  return (
    <section>
      <Accordion title="Action triggers" count={`${active} aktif`}>
        <div className="flex flex-col gap-2.5">
          {cards.map((card) => (
            <div
              // Kartu ini memuat kontrol yang namanya berulang di tiap kartu — "Di layar",
              // dan nanti mungkin yang lain. Grup bernama-lah yang membuat pembaca layar
              // menyebut rule mana yang sedang disetel, tanpa memanjangkan label yang tampil.
              aria-label={card.title}
              className="rounded-[10px] border border-[#232734] bg-ink/50 p-3"
              key={card.id}
              role="group"
              style={{ borderLeft: `3px solid ${card.accent}` }}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  {/* Judul kartu adalah label toggle-nya sendiri: dua teks yang sama bikin
                      pembaca layar menyebutkannya dua kali. */}
                  <Toggle
                    label={card.title}
                    checked={card.enabled}
                    onChange={(enabled) =>
                      props.onConfig(withRuleEnabled(props.config, card.id, enabled))
                    }
                  />
                </div>
                {/* Saklar KEDUA, dan sengaja berdampingan dengan yang pertama: "aktif"
                    menjawab apakah pemicunya menangkap, "di layar" menjawab apakah penonton
                    diberi tahu. Rule yang tersembunyi tetap bekerja penuh. */}
                <div className="w-[104px] shrink-0">
                  <Toggle
                    label="Di layar"
                    checked={card.showOnScreen}
                    onChange={(show) =>
                      props.onConfig(withRuleLegendShown(props.config, card.id, show))
                    }
                  />
                </div>
                <button
                  aria-label={`Hapus ${card.title}`}
                  className="mt-1.5 shrink-0 rounded px-1.5 text-dim hover:text-signal"
                  onClick={() => props.onConfig(removeRule(props.config, card.id))}
                  type="button"
                >
                  ×
                </button>
              </div>

              {/*
                * DUA nama, sengaja terpisah.
                *
                * "Nama" hanya judul kartu di panel ini — yang creator pakai untuk menemukan
                * rule-nya di daftar panjang. "Teks di layar" adalah yang benar-benar dibaca
                * penonton di rail arena dan di gift history. Menyatukannya berarti creator
                * harus memilih antara daftar yang enak dicari dan perintah yang enak diikuti.
                */}
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <TextField
                    label="Nama"
                    value={card.title}
                    maxLength={RULE_LABEL_MAX_LENGTH}
                    placeholder="Judul kartu di panel ini"
                    onChange={(label) =>
                      props.onConfig(withRuleLabel(props.config, card.id, label))
                    }
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <TextField
                    label="Teks di layar"
                    value={card.caption}
                    maxLength={LEGEND_CAPTION_MAX_LENGTH}
                    placeholder="Yang dibaca penonton"
                    onChange={(caption) =>
                      props.onConfig(withLegendCaption(props.config, card.id, caption))
                    }
                  />
                </div>
              </div>

              {/* WHEN — jenis pemicu, lalu detail yang hanya jenis itu punya. */}
              <div className="mt-1.5 flex items-end gap-2">
                <span className="chip mb-2 shrink-0">{WHEN_ICON[card.whenIcon] ?? ''}</span>

                <div className="min-w-0 flex-1">
                  <SelectField
                    label={`Pemicu ${card.title}`}
                    value={card.when.kind}
                    options={WHEN_OPTIONS.map((option) => ({
                      value: option.value,
                      label: option.label,
                    }))}
                    onChange={(kind) => props.onConfig(withWhen(props.config, card.id, kind))}
                  />
                </div>

                {card.keyword === null ? null : (
                  <div className="min-w-0 flex-1">
                    <TextField
                      label={`Keyword ${card.title}`}
                      value={card.keyword}
                      maxLength={KEYWORD_MAX_LENGTH}
                      onChange={(keyword) =>
                        props.onConfig(withKeyword(props.config, card.id, keyword))
                      }
                    />
                  </div>
                )}

                {card.everyNLikes === null ? null : (
                  <div className="min-w-0 flex-1">
                    <NumberField
                      label="Setiap berapa like"
                      field="likes.threshold"
                      value={card.everyNLikes}
                      onCommit={(value) => props.onConfig(withLikeThreshold(props.config, value))}
                    />
                  </div>
                )}
              </div>

              {card.keywordWarning === null ? null : (
                <p className="mt-1.5 rounded-[9px] border border-standby/35 bg-standby/10 px-2 py-1.5 text-[11px] leading-relaxed text-standby">
                  ⚠ {card.keywordWarning}
                </p>
              )}

              {/* Detail gift: katalog room sebagai petak yang bisa diklik, lalu ambangnya. */}
              {card.when.kind !== 'gift' ? null : (
                <div className="mt-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="readout-label">{`Hadiah pemicu ${card.title}`}</span>
                    {/* Server belajar hadiah baru sepanjang siaran; ini yang menjemputnya. */}
                    <button
                      className="readout-label text-[#5AA0FF] hover:text-signal"
                      onClick={reload}
                      type="button"
                    >
                      ↻ Muat ulang ({catalog.length})
                    </button>
                  </div>
                  {card.when.giftNames.length === 0 ? (
                    <p className="note mb-1.5">Belum ada yang dipilih — rule ini menerima gift apa pun.</p>
                  ) : null}
                  <ul
                    aria-label={`Hadiah pemicu ${card.title}`}
                    className="mb-1.5 grid max-h-[188px] grid-cols-[repeat(auto-fill,minmax(74px,1fr))] gap-1.5 overflow-y-auto"
                  >
                    {giftPicks(catalog, card.when.giftNames).map((pick) => (
                      <li key={pick.name}>
                        <button
                          aria-pressed={pick.selected}
                          className={`flex w-full flex-col items-center gap-1 rounded-[9px] border px-1 py-1.5 transition-colors ${
                            pick.selected
                              ? 'border-[#5AA0FF]/60 bg-[#5AA0FF]/12'
                              : 'border-edge bg-ink/50 hover:border-white/25'
                          }`}
                          onClick={() =>
                            props.onConfig(
                              withGiftNames(
                                props.config,
                                card.id,
                                toggleGiftName(
                                  (card.when as { giftNames: string[] }).giftNames,
                                  pick.name,
                                ),
                              ),
                            )
                          }
                          title={`${pick.name} · ${pick.coins} koin`}
                          type="button"
                        >
                          {pick.iconUrl === null ? (
                            <span className="grid h-7 w-7 place-items-center text-base">🎁</span>
                          ) : (
                            <img alt="" className="h-7 w-7 object-contain" src={pick.iconUrl} />
                          )}
                          <span className="w-full truncate text-center text-[10px] leading-tight text-signal">
                            {pick.name}
                          </span>
                          <span className="font-data text-[9.5px] font-bold tabular-nums text-muted">
                            {pick.coins} 🪙
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>

                  <NumberField
                    label={`Minimal jumlah ${card.title}`}
                    range={{ label: 'minimal jumlah hadiah', range: GIFT_MIN_COUNT_RANGE }}
                    value={card.when.minCount}
                    onCommit={(value) => props.onConfig(withMinCount(props.config, card.id, value))}
                  />
                </div>
              )}

              {/* THEN — aksi, sasaran, dan nilainya. */}
              <div className="mt-1.5 flex gap-2">
                <div className="min-w-0 flex-1">
                  <SelectField
                    label={`Aksi ${card.title}`}
                    value={actionChoiceOf(card.then, props.config)}
                    options={ACTION_TYPE_OPTIONS.map((option) => ({
                      value: option.value,
                      label: option.label,
                    }))}
                    onChange={(choice: ActionChoice) =>
                      props.onConfig(withActionChoice(props.config, card.id, choice))
                    }
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <SelectField
                    label={`Sasaran ${card.title}`}
                    value={card.then.target}
                    options={TARGET_OPTIONS.map((option) => ({
                      value: option.value,
                      label: option.label,
                    }))}
                    onChange={(target: TargetKind) =>
                      props.onConfig(withThen(props.config, card.id, { target }))
                    }
                  />
                </div>

                {card.growValue !== null ? (
                  <div className="min-w-0 flex-1">
                    <NumberField
                      label="HP per grow"
                      field="gameplay.hpGainedPerGrow"
                      value={card.growValue}
                      onCommit={(value) => props.onConfig(withHpGainedPerGrow(props.config, value))}
                    />
                  </div>
                ) : card.then.actionType === 'nuke' ? (
                  <div className="min-w-0 flex-1">
                    <NumberField
                      label="Damage nuke"
                      field="gameplay.nuke.damage"
                      value={props.config.gameplay.nuke.damage}
                      onCommit={(damage) =>
                        props.onConfig({
                          ...props.config,
                          gameplay: {
                            ...props.config.gameplay,
                            nuke: { ...props.config.gameplay.nuke, damage },
                          },
                        })
                      }
                    />
                  </div>
                ) : VALUE_OWNED_BY_CONFIG.includes(card.then.actionType) ? null : (
                  <div className="min-w-0 flex-1">
                    <NumberField
                      label={`Nilai ${card.title}`}
                      range={{ label: 'nilai aksi', range: { min: 0, max: 10_000, integer: true } }}
                      value={card.then.value}
                      onCommit={(value) => props.onConfig(withThen(props.config, card.id, { value }))}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <button
          className="btn btn-wide mt-2.5"
          disabled={atLimit}
          onClick={() => props.onConfig(addRule(props.config))}
          type="button"
        >
          + Tambah trigger
        </button>

        <p className="note mt-2.5">
          {atLimit
            ? `Batas ${MAX_TRIGGER_RULES} trigger tercapai. Hapus satu untuk menambah yang baru.`
            : 'Kartu di panggung ikut berubah sendiri — teksnya diturunkan dari aksi dan sasaran di sini.'}
        </p>
      </Accordion>
    </section>
  )
}
