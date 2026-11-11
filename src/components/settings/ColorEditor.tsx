import { useEffect, useMemo, useState } from 'react'
import { storeActions, useStore } from '../../store'
import { goBack, openSettings, useIsMobile, useOverlays } from '../../lib/nav'
import { appConfirm } from '../../lib/dialogs'
import {
  CUSTOM_THRESHOLDS,
  PRESET_PALETTES,
  deriveColors,
  fixAccent,
  isHexColor,
  paletteWarnings,
  resolveCustomSide,
  type ColorScheme,
  type PaletteWarning,
} from '../../lib/palette'
import type { CustomPalette, CustomPaletteSide, PaletteOverrides } from '../../types'
import { CommandButton } from '../PageHeader'
import { Icon } from '../icons'
import { paletteStyle, useColorScheme } from './DisplaySettings'

const MAIN_FIELDS: { key: 'bg' | 'ink' | 'accent'; label: string; note?: string }[] = [
  { key: 'bg', label: '背景' },
  { key: 'ink', label: '文字' },
  { key: 'accent', label: 'アクセント', note: 'ボタン・リンク・いまの章の印に使う' },
]

const OVERRIDE_FIELDS: { key: keyof PaletteOverrides; label: string }[] = [
  { key: 'sub', label: '補助の文字' },
  { key: 'line', label: '線' },
  { key: 'edge', label: '入力欄の枠' },
  { key: 'tint', label: '帯の色' },
  { key: 'onAccent', label: 'ボタンの文字' },
  { key: 'danger', label: '消すときの色' },
]

const SCHEME_LABELS: Record<ColorScheme, string> = { light: '明るいとき', dark: '暗いとき' }

function newPaletteId(): string {
  return `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** 色の選択欄と16進の入力欄。16進は #RRGGBB になったときだけ反映する */
function ColorField({
  id,
  label,
  value,
  note,
  onChange,
  onReset,
}: {
  id: string
  label: string
  value: string
  note?: string
  onChange: (hex: string) => void
  /** 自動に戻す（細かく決めるの欄だけ） */
  onReset?: () => void
}) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  return (
    <div className="color-field">
      <label htmlFor={id}>{label}</label>
      <input
        type="color"
        value={value.toLowerCase()}
        aria-label={`${label}の色を選ぶ`}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
      />
      <input
        id={id}
        className="set-input"
        value={text}
        spellCheck={false}
        maxLength={7}
        onChange={(e) => {
          const v = e.target.value.trim()
          setText(v)
          const hex = v.startsWith('#') ? v : `#${v}`
          if (isHexColor(hex)) onChange(hex.toUpperCase())
        }}
        onBlur={() => setText(value)}
      />
      {onReset && (
        <button className="nm-link" onClick={onReset}>
          自動に戻す
        </button>
      )}
      {note && <small>{note}</small>}
    </div>
  )
}

/** 警告1つを「近い色で直す」ときに変える色 */
function fixFor(w: PaletteWarning, side: CustomPaletteSide): Partial<CustomPaletteSide> {
  if (w.kind === 'ink') return { ink: fixAccent(side.ink, side.bg, CUSTOM_THRESHOLDS.ink) }
  if (w.kind === 'accent') return { accent: fixAccent(side.accent, side.bg, CUSTOM_THRESHOLDS.accent) }
  // ボタンの文字: 上書きしていれば自動へ戻す。自動でも足りなければアクセントをボタンの文字から離す
  if (side.overrides?.onAccent) {
    const { onAccent: _drop, ...rest } = side.overrides
    void _drop
    return { overrides: rest }
  }
  const onAccent = deriveColors(side.bg, side.ink, side.accent).onAccent
  return { accent: fixAccent(side.accent, onAccent, CUSTOM_THRESHOLDS.onAccent) }
}

/** 見本（物語の画面の一部をこの色で描く） */
function Sample({ side, mobile }: { side: CustomPaletteSide; mobile: boolean }) {
  const colors = resolveCustomSide(side)
  return (
    <div className={'color-sample' + (mobile ? ' mobile' : '')} style={paletteStyle(colors)}>
      {!mobile && (
        <>
          <div className="color-sample-crumb">霧坂高校 天文部　/　第3章</div>
          <div className="color-sample-title">屋上の観測会</div>
        </>
      )}
      <div className="color-sample-prose">
        <p>「合ってる。去年もここで見た」</p>
        {!mobile && <p>　千歳はそれだけ言って、ノートの端に何かを書きつけた。去年。すずが入部する前の話だ。</p>}
      </div>
      {!mobile && <div className="color-sample-note">千歳は去年の話を避けている</div>}
      <div className="color-sample-next">
        <div className="color-sample-row">
          <span className="color-sample-btn">続ける</span>
          <span className="color-sample-link">展開を選ぶ</span>
        </div>
        {!mobile && <div className="color-sample-input">こうしてほしい、を書いて続ける</div>}
      </div>
    </div>
  )
}

/**
 * 色を作る（P9 段8）。今の色をもとに、明るいとき・暗いときそれぞれの背景・文字・アクセントを選ぶ。
 * 残りの色は `palette.ts` の式で自動に決め、「細かく決める」で上書きできる。読みにくくても保存は止めず、
 * 警告と「近い色で直す」を出す。PC は左に欄・右に見本、モバイルは見本を上に置いた1列
 */
export default function ColorEditor() {
  const mobile = useIsMobile()
  const editId = useOverlays((o) => o.colorEditId)
  const ui = useStore((st) => st.ui)
  const { setUiPrefs } = storeActions()
  const scheme = useColorScheme()

  // 開いたときの値から作りはじめる（直す＝その色、作る＝いまの色をもとに）
  const [initial] = useState(() => {
    const existing = editId ? ui.customPalettes.find((c) => c.id === editId) : undefined
    if (existing) return { palette: existing, baseLabel: '' }
    const preset = PRESET_PALETTES.find((p) => p.id === ui.palette)
    const custom = ui.customPalettes.find((c) => c.id === ui.palette)
    const pick = (s: ColorScheme): CustomPaletteSide => {
      if (custom) return { bg: custom[s].bg, ink: custom[s].ink, accent: custom[s].accent }
      const c = (preset ?? PRESET_PALETTES[0])[s]
      return { bg: c.bg, ink: c.ink, accent: c.accent }
    }
    const baseLabel = custom ? custom.name || '自分の色' : (preset ?? PRESET_PALETTES[0]).label
    const palette: CustomPalette = {
      id: newPaletteId(),
      name: `自分の色 ${ui.customPalettes.length + 1}`,
      light: pick('light'),
      dark: pick('dark'),
    }
    return { palette, baseLabel }
  })
  const isNew = !editId || !ui.customPalettes.some((c) => c.id === editId)
  const [draft, setDraft] = useState<CustomPalette>(initial.palette)
  const [tab, setTab] = useState<ColorScheme>(scheme)
  const side = draft[tab]
  const otherTab: ColorScheme = tab === 'light' ? 'dark' : 'light'

  const warnings = useMemo(() => paletteWarnings(resolveCustomSide(side)), [side])
  const otherWarnings = useMemo(() => paletteWarnings(resolveCustomSide(draft[otherTab])), [draft, otherTab])
  const auto = useMemo(() => deriveColors(side.bg, side.ink, side.accent), [side])
  const overrideCount = Object.keys(side.overrides ?? {}).length

  const patchSide = (patch: Partial<CustomPaletteSide>) =>
    setDraft((d) => ({ ...d, [tab]: { ...d[tab], ...patch } }))

  const setOverride = (key: keyof PaletteOverrides, hex: string | null) =>
    setDraft((d) => {
      const cur = { ...(d[tab].overrides ?? {}) }
      if (hex === null) delete cur[key]
      else cur[key] = hex
      const next: CustomPaletteSide = { bg: d[tab].bg, ink: d[tab].ink, accent: d[tab].accent }
      if (Object.keys(cur).length > 0) next.overrides = cur
      return { ...d, [tab]: next }
    })

  const save = () => {
    const name = draft.name.trim() || '自分の色'
    const list = ui.customPalettes.some((c) => c.id === draft.id)
      ? ui.customPalettes.map((c) => (c.id === draft.id ? { ...draft, name } : c))
      : [...ui.customPalettes, { ...draft, name }]
    setUiPrefs({ customPalettes: list, palette: draft.id })
    goBack()
  }

  const remove = async () => {
    if (!(await appConfirm({ message: `「${draft.name || '自分の色'}」を消しますか？`, okLabel: '消す', danger: true })))
      return
    setUiPrefs({
      customPalettes: ui.customPalettes.filter((c) => c.id !== draft.id),
      ...(ui.palette === draft.id ? { palette: 'ai' } : {}),
    })
    goBack()
  }

  const warningBox =
    warnings.length > 0 ? (
      <div className="color-status bad" role="alert">
        <Icon name="alert-triangle" size={18} />
        <div>
          {warnings.map((w) => (
            <p key={w.kind}>
              {w.message}（いまは {w.ratio.toFixed(1)}:1、目安は {w.need}:1 以上）。
              <button className="nm-link" onClick={() => patchSide(fixFor(w, side))}>
                近い色で直す
              </button>
            </p>
          ))}
        </div>
      </div>
    ) : (
      <div className="color-status ok" role="status">
        <Icon name="check" size={18} />
        <div>
          <p>どの文字も読みやすい組み合わせです。</p>
        </div>
      </div>
    )

  const otherNote =
    otherWarnings.length > 0 ? (
      <p className="set-desc">
        {SCHEME_LABELS[otherTab]}にも読みにくい所があります。
        <button className="nm-link" onClick={() => setTab(otherTab)}>
          {SCHEME_LABELS[otherTab]}を見る
        </button>
      </p>
    ) : null

  const tabs = (
    <div className={mobile ? 'set-seg wide' : 'color-tabs'} role="tablist" aria-label="明暗">
      {(['light', 'dark'] as const).map((s) => (
        <button
          key={s}
          role="tab"
          aria-selected={tab === s}
          className={(mobile ? 'set-seg-btn' : 'color-tab') + (tab === s ? ' on' : '')}
          onClick={() => setTab(s)}
        >
          {SCHEME_LABELS[s]}
        </button>
      ))}
    </div>
  )

  const fields = (
    <div>
      {MAIN_FIELDS.map((f) => (
        <ColorField
          key={`${tab}-${f.key}`}
          id={`color-${f.key}`}
          label={f.label}
          value={side[f.key]}
          note={mobile ? undefined : f.note}
          onChange={(hex) => patchSide({ [f.key]: hex })}
        />
      ))}
    </div>
  )

  const details = (
    <details className="color-details">
      <summary>
        細かく決める（補助の文字・線・入力欄の枠・帯の色。{overrideCount > 0 ? `${overrideCount} つを変えている` : 'いまは自動'}）
      </summary>
      {OVERRIDE_FIELDS.map((f) => {
        const v = side.overrides?.[f.key]
        return (
          <ColorField
            key={`${tab}-${f.key}`}
            id={`color-o-${f.key}`}
            label={f.label}
            value={v ?? auto[f.key]}
            onChange={(hex) => setOverride(f.key, hex)}
            onReset={v ? () => setOverride(f.key, null) : undefined}
          />
        )
      })}
    </details>
  )

  const nameField = (
    <div>
      <label htmlFor="color-name" className="set-label">
        名前
      </label>
      <input
        id="color-name"
        className="set-input"
        value={draft.name}
        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
      />
      {isNew && initial.baseLabel && <p className="set-desc">{initial.baseLabel}をもとに作りはじめました</p>}
    </div>
  )

  const saveLabel = warnings.length + otherWarnings.length > 0 ? 'このまま使う' : 'この色を使う'

  if (mobile) {
    return (
      <div className="shell-page set-page color-page mobile">
        <header className="reader-head review-head">
          <button className="icon-btn" onClick={goBack} title="戻る" aria-label="戻る">
            <Icon name="chevron-left" size={20} />
          </button>
          <h1 className="review-head-title">{isNew ? '色を作る' : '色を直す'}</h1>
        </header>
        <div className="set-scroll color-mobile-body">
          <Sample side={side} mobile />
          {tabs}
          {fields}
          {warningBox}
          {otherNote}
          {nameField}
          {details}
          {!isNew && (
            <button className="nm-link danger" onClick={remove}>
              この色を消す
            </button>
          )}
        </div>
        <div className="review-bottom">
          <button className="btn primary review-confirm set-wide-btn" onClick={save}>
            {saveLabel}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="shell-page set-page color-page">
      <header className="reader-head">
        <nav className="reader-crumb" aria-label="現在地">
          <button className="reader-crumb-link" onClick={() => useStore.getState().setView('home')}>
            デルシア
          </button>
          <span className="reader-crumb-sep">/</span>
          <button className="reader-crumb-link" onClick={() => openSettings()}>
            表示と設定
          </button>
          <span className="reader-crumb-sep">/</span>
          <span className="reader-crumb-chapter">{isNew ? '色を作る' : '色を直す'}</span>
        </nav>
        <div className="reader-head-end">
          <CommandButton />
        </div>
      </header>
      <div className="color-layout">
        <main className="color-main">
          <h1 className="set-title big">{isNew ? '色を作る' : '色を直す'}</h1>
          {nameField}
          <div>
            {tabs}
            {fields}
          </div>
          {warningBox}
          {otherNote}
          {details}
          <div className="color-foot">
            <button className="btn primary color-save" onClick={save}>
              {saveLabel}
            </button>
            <button className="nm-link" onClick={goBack}>
              やめる
            </button>
            {!isNew && (
              <button className="nm-link danger color-delete" onClick={remove}>
                この色を消す
              </button>
            )}
          </div>
        </main>
        <section className="color-aside" aria-label="見本">
          <div className="set-desc">見本（{SCHEME_LABELS[tab]}）</div>
          <Sample side={side} mobile={false} />
        </section>
      </div>
    </div>
  )
}
