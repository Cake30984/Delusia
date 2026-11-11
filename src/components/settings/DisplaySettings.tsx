import { useEffect, useState, type CSSProperties } from 'react'
import { storeActions, useStore } from '../../store'
import { openColorEditor, openSettings } from '../../lib/nav'
import { PRESET_PALETTES, resolveCustomSide, type ColorScheme, type PaletteColors } from '../../lib/palette'
import { loadProseFont } from '../../lib/proseFonts'
import { DEFAULT_UI, UI_LIMITS, type Appearance, type ProseFont } from '../../types'
import { Icon } from '../icons'

const APPEARANCE_OPTIONS: { value: Appearance; label: string }[] = [
  { value: 'light', label: '明るい' },
  { value: 'dark', label: '暗い' },
  { value: 'system', label: '端末に合わせる' },
]

export const PROSE_FONT_OPTIONS: { value: ProseFont; label: string; note: string; family: string }[] = [
  { value: 'gothic', label: 'ゴシック', note: '標準', family: 'var(--font-ui)' },
  { value: 'mincho', label: '明朝', note: '本らしく読む', family: "'Shippori Mincho', serif" },
  { value: 'maru', label: '丸ゴシック', note: 'やわらかい', family: "'Zen Maru Gothic', var(--font-system)" },
  { value: 'ud', label: 'UD ゴシック', note: '形が見分けやすい', family: "'BIZ UDPGothic', var(--font-system)" },
  { value: 'system', label: '端末の書体', note: '読み込みなし', family: 'var(--font-system)' },
]

const FONT_SAMPLE = '去年もここで'

/** いま画面が明るい側か暗い側か（端末に合わせるなら端末の設定を見る）。端末の切り替えに追従する */
export function useColorScheme(): ColorScheme {
  const appearance = useStore((st) => st.ui.appearance)
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = () => setSystemDark(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  if (appearance === 'system') return systemDark ? 'dark' : 'light'
  return appearance
}

/** 色一式を、その範囲だけの CSS 変数にする（見本を今の画面の色と別の色で描く） */
export function paletteStyle(c: PaletteColors): CSSProperties {
  return {
    '--bg': c.bg,
    '--ink': c.ink,
    '--sub': c.sub,
    '--line': c.line,
    '--edge': c.edge,
    '--accent': c.accent,
    '--tint': c.tint,
    '--on-accent': c.onAccent,
    '--danger': c.danger,
  } as CSSProperties
}

/** 色の一覧（用意した色・自分の色・＋色を作る）。PC は小さな見本のカード、モバイルは丸 */
function PaletteChooser({ mobile }: { mobile: boolean }) {
  const palette = useStore((st) => st.ui.palette)
  const customs = useStore((st) => st.ui.customPalettes)
  const { setUiPrefs } = storeActions()
  const scheme = useColorScheme()
  const items = [
    ...PRESET_PALETTES.map((p) => ({ id: p.id, label: p.label, colors: p[scheme] })),
    ...customs.map((c) => ({ id: c.id, label: c.name || '自分の色', colors: resolveCustomSide(c[scheme]) })),
  ]
  const current = items.find((i) => i.id === palette)
  const isCustom = customs.some((c) => c.id === palette)
  return (
    <section className="set-section" aria-label="色">
      <h2 className="set-h2">
        色<span>　いまは {current?.label ?? '藍'}</span>
        {isCustom && (
          <button className="nm-link set-h2-link" onClick={() => openColorEditor(palette)}>
            この色を直す
          </button>
        )}
      </h2>
      <div className={mobile ? 'set-dots' : 'set-swatches'} role="radiogroup" aria-label="色">
        {items.map((i) => (
          <button
            key={i.id}
            role="radio"
            aria-checked={i.id === palette}
            className={(mobile ? 'set-dot' : 'set-swatch') + (i.id === palette ? ' on' : '')}
            onClick={() => setUiPrefs({ palette: i.id })}
          >
            <span className="set-swatch-pv" style={paletteStyle(i.colors)}>
              {!mobile && <b />}
              <u />
            </span>
            <span className="set-swatch-name">{i.label}</span>
          </button>
        ))}
        <button className={mobile ? 'set-dot add' : 'set-swatch add'} onClick={() => openColorEditor(null)}>
          {mobile ? (
            <>
              <span className="set-swatch-pv">
                <Icon name="plus" size={20} />
              </span>
              <span className="set-swatch-name">色を作る</span>
            </>
          ) : (
            '＋色を作る'
          )}
        </button>
      </div>
    </section>
  )
}

/** 本文の書体（5つ）。それぞれの書体で見本を出す */
export function FontChooser({ column = false }: { column?: boolean }) {
  const proseFont = useStore((st) => st.ui.proseFont)
  const { setUiPrefs } = storeActions()
  // 見本を描くために、選んでいない書体も読み込む（どれも表示に使った文字の範囲だけを読む）
  useEffect(() => {
    for (const f of PROSE_FONT_OPTIONS) loadProseFont(f.value)
  }, [])
  return (
    <div className={'set-fonts' + (column ? ' column' : '')} role="radiogroup" aria-label="本文の書体">
      {PROSE_FONT_OPTIONS.map((f) => (
        <button
          key={f.value}
          role="radio"
          aria-checked={proseFont === f.value}
          className={'set-font' + (proseFont === f.value ? ' on' : '')}
          onClick={() => setUiPrefs({ proseFont: f.value })}
        >
          <span className="set-font-sample" style={{ fontFamily: f.family }}>
            {FONT_SAMPLE}
          </span>
          {f.label}
          <small>{f.note}</small>
        </button>
      ))}
    </div>
  )
}

function RangeRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format?: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <label className="set-range">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value))))}
      />
      <small>{format ? format(value) : value}</small>
    </label>
  )
}

/**
 * 表示（P9 段8）: 明るさ・色・本文の書体・文字の大きさ・行の間隔・本文の幅・セリフの色。
 * 段1の仮の切り替えと、読書画面の「Aa」のポップオーバー（`ReaderSettings`）をここへまとめた
 */
export default function DisplaySettings({ mobile }: { mobile: boolean }) {
  const ui = useStore((st) => st.ui)
  const { setUiPrefs } = storeActions()
  const fontLabel = PROSE_FONT_OPTIONS.find((f) => f.value === ui.proseFont)?.label ?? 'ゴシック'

  const resetReader = () =>
    setUiPrefs({
      fontSize: DEFAULT_UI.fontSize,
      lineHeight: DEFAULT_UI.lineHeight,
      contentWidth: DEFAULT_UI.contentWidth,
      speakerIconSize: DEFAULT_UI.speakerIconSize,
      dialogueTint: DEFAULT_UI.dialogueTint,
    })

  return (
    <>
      <section className="set-section" aria-label="明るさ">
        <h2 className="set-h2">明るさ</h2>
        <div className={'set-seg' + (mobile ? ' wide' : '')} role="group" aria-label="明るさ">
          {APPEARANCE_OPTIONS.map((o) => (
            <button
              key={o.value}
              aria-pressed={ui.appearance === o.value}
              className={'set-seg-btn' + (ui.appearance === o.value ? ' on' : '')}
              onClick={() => setUiPrefs({ appearance: o.value })}
            >
              {o.label}
            </button>
          ))}
        </div>
      </section>

      <PaletteChooser mobile={mobile} />

      {!mobile && (
        <section className="set-section" aria-label="本文の書体">
          <h2 className="set-h2">
            本文の書体<span>　画面の文字はゴシックのまま。物語の本文だけが変わる</span>
          </h2>
          <FontChooser />
        </section>
      )}

      <section className="set-section" aria-label="本文">
        <h2 className="set-h2">{mobile ? '本文' : '本文の大きさ'}</h2>
        <RangeRow
          label={mobile ? '文字' : '文字の大きさ'}
          value={ui.fontSize}
          {...UI_LIMITS.fontSize}
          onChange={(fontSize) => setUiPrefs({ fontSize })}
        />
        <RangeRow
          label="行の間隔"
          value={ui.lineHeight}
          {...UI_LIMITS.lineHeight}
          format={(v) => v.toFixed(2).replace(/0$/, '')}
          onChange={(lineHeight) => setUiPrefs({ lineHeight })}
        />
        {!mobile && (
          <>
            <RangeRow
              label="本文の幅"
              value={ui.contentWidth}
              {...UI_LIMITS.contentWidth}
              onChange={(contentWidth) => setUiPrefs({ contentWidth })}
            />
            <RangeRow
              label="話し手の絵（会話劇）"
              value={ui.speakerIconSize}
              {...UI_LIMITS.speakerIconSize}
              onChange={(speakerIconSize) => setUiPrefs({ speakerIconSize })}
            />
          </>
        )}
        {mobile && (
          <>
            <button className="set-link" onClick={() => openSettings('font')}>
              本文の書体
              <small style={{ fontFamily: 'var(--font-prose)' }}>{fontLabel}</small>
            </button>
            <div className="set-sample">「合ってる。去年もここで見た」</div>
          </>
        )}
        <label className="set-check">
          <input
            type="checkbox"
            checked={ui.dialogueTint}
            onChange={(e) => setUiPrefs({ dialogueTint: e.target.checked })}
          />
          セリフに色をつける
        </label>
        {!mobile && (
          <label className="set-check">
            <input
              type="checkbox"
              checked={ui.immersive}
              onChange={(e) => setUiPrefs({ immersive: e.target.checked })}
            />
            没入モード（読んでいる間は上端を隠す。Esc で戻る）
          </label>
        )}
        <button className="nm-link set-reset" onClick={resetReader}>
          本文の表示を既定に戻す
        </button>
      </section>
    </>
  )
}
