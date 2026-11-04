import { storeActions, useStore } from '../store'
import { PRESET_PALETTES } from '../lib/palette'
import type { Appearance, ProseFont } from '../types'

/**
 * 明るさ・色・本文の書体の**仮の**切り替え（P9 段1）。旧画面のまま新しい色と書体を確かめるためだけに置く。
 * P9 段8で設定のページを作り直すときに、このファイルごと消す
 */
const APPEARANCE_OPTIONS: { value: Appearance; label: string }[] = [
  { value: 'light', label: '明るい' },
  { value: 'dark', label: '暗い' },
  { value: 'system', label: '端末に合わせる' },
]

const PROSE_FONT_OPTIONS: { value: ProseFont; label: string }[] = [
  { value: 'gothic', label: 'ゴシック' },
  { value: 'mincho', label: '明朝' },
  { value: 'maru', label: '丸ゴシック' },
  { value: 'ud', label: 'UD ゴシック' },
  { value: 'system', label: '端末の書体' },
]

export function TempAppearanceSettings() {
  const ui = useStore((st) => st.ui)
  const { setUiPrefs } = storeActions()
  return (
    <div className="field">
      <label>表示（仮）</label>
      <div className="desc">明るさ・色・本文の書体。作り直し中の仮の切り替えです。</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', alignItems: 'flex-start' }}>
        <div className="seg" role="group" aria-label="明るさ">
          {APPEARANCE_OPTIONS.map((o) => (
            <button
              key={o.value}
              className={ui.appearance === o.value ? 'on' : ''}
              onClick={() => setUiPrefs({ appearance: o.value })}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="色">
          {PRESET_PALETTES.map((p) => (
            <button
              key={p.id}
              className={ui.palette === p.id ? 'on' : ''}
              onClick={() => setUiPrefs({ palette: p.id })}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="本文の書体" style={{ flexWrap: 'wrap' }}>
          {PROSE_FONT_OPTIONS.map((o) => (
            <button
              key={o.value}
              className={ui.proseFont === o.value ? 'on' : ''}
              onClick={() => setUiPrefs({ proseFont: o.value })}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="prose-block" style={{ margin: 0 }}>
          雨上がりの石畳に、街灯の光が細く伸びていた。「待って」と彼女は言った。
        </p>
      </div>
    </div>
  )
}
