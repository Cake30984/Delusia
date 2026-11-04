import { describe, expect, it } from 'vitest'
import { DEFAULT_UI, normalizeUiPrefs, type CustomPalette } from '../../types'

const custom: CustomPalette = {
  id: 'cp1',
  name: '夜の海',
  light: { bg: '#ffffff', ink: '#222222', accent: '#1a4fa0' },
  dark: { bg: '#0F1A2B', ink: '#E6ECF5', accent: '#F2C94C', overrides: { sub: '#AABBCC' } },
}

describe('normalizeUiPrefs', () => {
  it('空なら既定値になる', () => {
    expect(normalizeUiPrefs({})).toEqual({ ...DEFAULT_UI, dockTab: null })
    expect(normalizeUiPrefs(undefined).appearance).toBe('system')
  })

  it('旧・段階式の文字列値を数値へ引き継ぐ', () => {
    const ui = normalizeUiPrefs({ fontScale: 'l', lineHeight: 'wide', contentWidth: 'narrow' })
    expect(ui.fontSize).toBe(17)
    expect(ui.lineHeight).toBe(2.1)
    expect(ui.contentWidth).toBe(660)
  })

  it('範囲外をクランプする', () => {
    const ui = normalizeUiPrefs({ fontSize: 99, dockWidth: 10, speakerIconSize: 'x' })
    expect(ui.fontSize).toBe(22)
    expect(ui.dockWidth).toBe(300)
    expect(ui.speakerIconSize).toBe(22)
  })

  describe('表示（P9）', () => {
    it('P9 より前の保存値（キーが無い）は既定の 端末に合わせる・藍・ゴシック', () => {
      const ui = normalizeUiPrefs({ dockTab: 'status', fontSize: 16 })
      expect(ui.appearance).toBe('system')
      expect(ui.palette).toBe('ai')
      expect(ui.customPalettes).toEqual([])
      expect(ui.proseFont).toBe('gothic')
      expect(ui.fontSize).toBe(16)
    })

    it('正しい値はそのまま通す', () => {
      const ui = normalizeUiPrefs({ appearance: 'dark', palette: 'sumi', proseFont: 'mincho' })
      expect(ui.appearance).toBe('dark')
      expect(ui.palette).toBe('sumi')
      expect(ui.proseFont).toBe('mincho')
    })

    it('知らない値は既定へ戻す', () => {
      const ui = normalizeUiPrefs({ appearance: 'sepia', palette: 'nope', proseFont: 'comic' })
      expect(ui.appearance).toBe('system')
      expect(ui.palette).toBe('ai')
      expect(ui.proseFont).toBe('gothic')
    })

    it('自分の色を通し、16進は大文字へそろえる', () => {
      const ui = normalizeUiPrefs({ palette: 'cp1', customPalettes: [custom] })
      expect(ui.palette).toBe('cp1')
      expect(ui.customPalettes).toHaveLength(1)
      expect(ui.customPalettes[0].light).toEqual({ bg: '#FFFFFF', ink: '#222222', accent: '#1A4FA0' })
      expect(ui.customPalettes[0].dark.overrides).toEqual({ sub: '#AABBCC' })
      expect(ui.customPalettes[0].name).toBe('夜の海')
    })

    it('消えた自分の色を指していたら藍へ戻す', () => {
      expect(normalizeUiPrefs({ palette: 'cp1', customPalettes: [] }).palette).toBe('ai')
    })

    it('壊れた自分の色・id の重複・用意した色と同じ id は落とす', () => {
      const ui = normalizeUiPrefs({
        customPalettes: [
          custom,
          { ...custom, name: '重複' },
          { ...custom, id: 'ai' },
          { ...custom, id: 'bad1', light: { bg: 'red', ink: '#000000', accent: '#000000' } },
          { ...custom, id: 'bad2', dark: undefined },
          { id: '', name: 'x', light: custom.light, dark: custom.dark },
          null,
          'str',
        ],
      })
      expect(ui.customPalettes.map((c) => c.id)).toEqual(['cp1'])
      expect(ui.customPalettes[0].name).toBe('夜の海')
    })

    it('上書きの不正な値だけを落とす', () => {
      const ui = normalizeUiPrefs({
        customPalettes: [
          { ...custom, light: { ...custom.light, overrides: { sub: '#123', edge: '#ABCDEF', foo: '#000000' } } },
        ],
      })
      expect(ui.customPalettes[0].light.overrides).toEqual({ edge: '#ABCDEF' })
    })

    it('自分の色が配列でなければ空にする', () => {
      expect(normalizeUiPrefs({ customPalettes: { a: 1 } }).customPalettes).toEqual([])
    })
  })
})
