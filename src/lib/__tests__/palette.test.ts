import { describe, expect, it } from 'vitest'
import {
  contrastRatio,
  customPaletteCssVars,
  deriveColors,
  fixAccent,
  mix,
  paletteWarnings,
  PRESET_PALETTES,
  resolveCustomSide,
  resolvePalette,
  type PaletteColors,
} from '../palette'
import { PRESET_PALETTE_IDS, type CustomPalette } from '../../types'
// tsconfig に node の型を入れていないので、ファイルは Vite の ?raw で読む
import tokensCss from '../../styles/tokens.css?raw'

const SCHEMES = ['light', 'dark'] as const

/** 計画書 P9 の基準: 補助文字・リンク・ボタン文字は 4.5:1 以上、入力欄の枠は 3:1 以上 */
function expectReadable(c: PaletteColors, label: string) {
  const r = (a: string, b: string) => contrastRatio(a, b)
  expect(r(c.ink, c.bg), `${label} 文字/背景`).toBeGreaterThanOrEqual(7)
  expect(r(c.sub, c.bg), `${label} 補助文字/背景`).toBeGreaterThanOrEqual(4.5)
  expect(r(c.sub, c.tint), `${label} 補助文字/tint`).toBeGreaterThanOrEqual(4.5)
  expect(r(c.accent, c.bg), `${label} リンク/背景`).toBeGreaterThanOrEqual(4.5)
  expect(r(c.onAccent, c.accent), `${label} ボタン文字/アクセント`).toBeGreaterThanOrEqual(4.5)
  expect(r(c.edge, c.bg), `${label} 入力欄の枠/背景`).toBeGreaterThanOrEqual(3)
}

describe('contrastRatio', () => {
  it('白と黒は 21:1、同じ色は 1:1', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5)
    expect(contrastRatio('#777777', '#777777')).toBe(1)
  })
  it('引数の順に依らない', () => {
    expect(contrastRatio('#3843C8', '#FFFFFF')).toBeCloseTo(contrastRatio('#FFFFFF', '#3843C8'), 10)
  })
})

describe('mix', () => {
  it('0 なら元の色、1 なら寄せる先の色', () => {
    expect(mix('#102030', '#FFFFFF', 0)).toBe('#102030')
    expect(mix('#102030', '#FFFFFF', 1)).toBe('#FFFFFF')
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080')
  })
})

describe('用意した色', () => {
  it('5種がそろい、id は types の PRESET_PALETTE_IDS と同じ', () => {
    expect(PRESET_PALETTES.map((p) => p.id)).toEqual([...PRESET_PALETTE_IDS])
  })

  for (const p of PRESET_PALETTES) {
    for (const s of SCHEMES) {
      it(`${p.label}（${s === 'light' ? '明' : '暗'}）が全組み合わせで基準を満たし、警告が出ない`, () => {
        expectReadable(p[s], `${p.label}/${s}`)
        expect(contrastRatio(p[s].danger, p[s].bg), '危険色/背景').toBeGreaterThanOrEqual(4.5)
        expect(paletteWarnings(p[s])).toEqual([])
      })
    }
  }

  it('tokens.css の値と一致する', () => {
    const css = tokensCss
    for (const p of PRESET_PALETTES) {
      // 藍は「:root, :root[data-palette='ai']」のまとめた書き方なので、属性の位置から次の } までを見る
      const at = css.indexOf(`:root[data-palette='${p.id}']`)
      expect(at, p.id).toBeGreaterThanOrEqual(0)
      const block = css.slice(at, css.indexOf('}', at))
      const vars = customPaletteCssVars({ id: 'x', name: '', light: p.light, dark: p.dark })
      // 用意した色は自動で決める式を通さず表の値そのもの。上書き扱いで全項目を渡す
      for (const [prefix, side] of [
        ['l', p.light],
        ['d', p.dark],
      ] as const) {
        const expectVar = (name: string, value: string) =>
          expect(block, `${p.id} --${prefix}-${name}`).toContain(`--${prefix}-${name}: ${value};`)
        expectVar('bg', side.bg)
        expectVar('ink', side.ink)
        expectVar('sub', side.sub)
        expectVar('line', side.line)
        expectVar('edge', side.edge)
        expectVar('accent', side.accent)
        expectVar('tint', side.tint)
        expectVar('on-accent', side.onAccent)
        expectVar('danger', side.danger)
      }
      expect(Object.keys(vars)).toHaveLength(18)
    }
  })
})

describe('自分の色（3色から残りを決める）', () => {
  /** 利用者が作りそうな色（明るい背景・暗い背景・色の付いた背景） */
  const LIKELY: [string, string, string, string][] = [
    ['白地に紺', '#FFFFFF', '#222222', '#1A4FA0'],
    ['白地に赤', '#FFFFFF', '#1A1A1A', '#C62828'],
    ['クリームに茶', '#FFF8E7', '#3B2F2F', '#8B4513'],
    ['水色の地', '#EEF6FB', '#14232E', '#0B6E99'],
    ['薄紫の地', '#F6F2FB', '#241B30', '#6A3FA0'],
    ['黒地に橙', '#1E1E1E', '#E0E0E0', '#FFA94D'],
    ['紺地に黄', '#0F1A2B', '#E6ECF5', '#F2C94C'],
    ['深緑の地', '#10201A', '#E3F0E8', '#7FD1A8'],
    ['えんじの地', '#24121A', '#F3E4EA', '#FF9EBB'],
    ['暗い灰色', '#2B2B2B', '#EEEEEE', '#82B1FF'],
  ]

  for (const [label, bg, ink, accent] of LIKELY) {
    it(`${label}: 自動で決めた色が基準を満たし、警告が出ない`, () => {
      const c = deriveColors(bg, ink, accent)
      expectReadable(c, label)
      // 式の基準（補助文字は 4.6、枠は 3.1）を背景と tint の両方で保つ
      expect(contrastRatio(c.sub, c.bg)).toBeGreaterThanOrEqual(4.6)
      expect(contrastRatio(c.sub, c.tint)).toBeGreaterThanOrEqual(4.6)
      expect(contrastRatio(c.edge, c.bg)).toBeGreaterThanOrEqual(3.1)
      expect(contrastRatio(c.edge, c.tint)).toBeGreaterThanOrEqual(3.1)
      expect(paletteWarnings(c)).toEqual([])
    })
  }

  it('用意した色の3色から決めても基準を満たす', () => {
    for (const p of PRESET_PALETTES) {
      for (const s of SCHEMES) {
        const c = deriveColors(p[s].bg, p[s].ink, p[s].accent)
        expectReadable(c, `${p.id}/${s}`)
        expect(paletteWarnings(c)).toEqual([])
      }
    }
  })

  it('tint はアクセントを背景へ 94% 寄せた色、line は文字を背景へ 88% 寄せた色', () => {
    const c = deriveColors('#FFFFFF', '#000000', '#0000FF')
    expect(c.tint).toBe(mix('#0000FF', '#FFFFFF', 0.94))
    expect(c.line).toBe(mix('#000000', '#FFFFFF', 0.88))
  })

  it('sub と edge は基準を保てる範囲で最も淡い（1% 淡くすると基準を割る）', () => {
    const bg = '#FFFFFF'
    const ink = '#1F2328'
    const c = deriveColors(bg, ink, '#3843C8')
    const t = (x: string) => {
      for (let i = 100; i >= 0; i--) if (mix(ink, bg, i / 100) === x) return i / 100
      return -1
    }
    const subT = t(c.sub)
    expect(subT).toBeGreaterThan(0)
    expect(subT).toBeLessThanOrEqual(0.45)
    const lighter = mix(ink, bg, subT + 0.01)
    if (subT < 0.45) {
      expect(Math.min(contrastRatio(lighter, bg), contrastRatio(lighter, c.tint))).toBeLessThan(4.6)
    }
  })

  it('on-accent は白・黒・背景のうちアクセントとの差が最大のもの', () => {
    expect(deriveColors('#FFFFFF', '#111111', '#1A4FA0').onAccent).toBe('#FFFFFF')
    expect(deriveColors('#111111', '#EEEEEE', '#FFD54F').onAccent).toBe('#000000')
  })

  it('danger は明るい背景で #B3261E、暗い背景で #FF8A80', () => {
    expect(deriveColors('#FBF7EF', '#222222', '#94441B').danger).toBe('#B3261E')
    expect(deriveColors('#1C1915', '#EEEEEE', '#E3A577').danger).toBe('#FF8A80')
  })

  it('上書き（細かく決める）があればそちらを使う', () => {
    const c = resolveCustomSide({
      bg: '#FFFFFF',
      ink: '#222222',
      accent: '#1A4FA0',
      overrides: { sub: '#555555', onAccent: '#FFFF00' },
    })
    expect(c.sub).toBe('#555555')
    expect(c.onAccent).toBe('#FFFF00')
    expect(c.tint).toBe(deriveColors('#FFFFFF', '#222222', '#1A4FA0').tint)
  })
})

describe('警告', () => {
  it('灰色どうしの悪い例で、文字とアクセントの警告が出る', () => {
    const c = deriveColors('#808080', '#9A9A9A', '#8C8C8C')
    const kinds = paletteWarnings(c).map((w) => w.kind)
    expect(kinds).toContain('ink')
    expect(kinds).toContain('accent')
  })

  it('明るい灰色の地に灰色の文字でも警告が出る', () => {
    const c = deriveColors('#E0E0E0', '#888888', '#A0A0A0')
    expect(paletteWarnings(c).map((w) => w.kind)).toEqual(['ink', 'accent'])
  })

  it('暗い地に暗い文字でも警告が出る', () => {
    const c = deriveColors('#202020', '#4A4A4A', '#3A3A5A')
    expect(paletteWarnings(c).map((w) => w.kind)).toEqual(['ink', 'accent'])
  })

  it('ボタンの文字を上書きして読みにくくすると on-accent の警告が出る', () => {
    const c = resolveCustomSide({
      bg: '#FFFFFF',
      ink: '#222222',
      accent: '#1A4FA0',
      overrides: { onAccent: '#3060B0' },
    })
    expect(paletteWarnings(c).map((w) => w.kind)).toEqual(['onAccent'])
  })

  it('警告には実際の比と基準が入る', () => {
    const [w] = paletteWarnings(deriveColors('#FFFFFF', '#222222', '#FFD54F'))
    expect(w.kind).toBe('accent')
    expect(w.need).toBe(4.5)
    expect(w.ratio).toBeCloseTo(contrastRatio('#FFD54F', '#FFFFFF'), 10)
  })
})

describe('fixAccent（近い色で直す）', () => {
  it('明るい背景では濃くして基準に届かせる', () => {
    const fixed = fixAccent('#FFD54F', '#FFFFFF')
    expect(contrastRatio(fixed, '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
    // 1% 手前は基準に届かない＝基準に届く中で元の色に最も近い
    let step = -1
    for (let i = 1; i <= 100; i++) if (mix('#FFD54F', '#000000', i / 100) === fixed) step = i
    expect(step).toBeGreaterThan(1)
    expect(contrastRatio(mix('#FFD54F', '#000000', (step - 1) / 100), '#FFFFFF')).toBeLessThan(4.5)
    const c = deriveColors('#FFFFFF', '#222222', fixed)
    expect(paletteWarnings(c)).toEqual([])
  })

  it('暗い背景では薄くして基準に届かせる', () => {
    const fixed = fixAccent('#3A3A8A', '#121316')
    expect(contrastRatio(fixed, '#121316')).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(fixed, '#FFFFFF')).toBeLessThan(contrastRatio('#3A3A8A', '#FFFFFF'))
    expect(paletteWarnings(deriveColors('#121316', '#E8EAEE', fixed))).toEqual([])
  })

  it('灰色どうしの悪い例でもアクセントの警告は消える', () => {
    const fixed = fixAccent('#8C8C8C', '#808080')
    expect(paletteWarnings(deriveColors('#808080', '#9A9A9A', fixed)).map((w) => w.kind)).not.toContain(
      'accent',
    )
  })

  it('既に基準を満たしていればそのまま', () => {
    expect(fixAccent('#3843C8', '#FFFFFF')).toBe('#3843C8')
  })
})

describe('resolvePalette', () => {
  const custom: CustomPalette = {
    id: 'mine',
    name: '自分の色',
    light: { bg: '#FFFFFF', ink: '#222222', accent: '#1A4FA0' },
    dark: { bg: '#1E1E1E', ink: '#E0E0E0', accent: '#FFA94D' },
  }

  it('用意した色は表の値をそのまま返す', () => {
    expect(resolvePalette('kinari', 'dark', [])).toEqual(PRESET_PALETTES[1].dark)
  })

  it('自分の色は3色から決めた値を返す', () => {
    expect(resolvePalette('mine', 'dark', [custom])).toEqual(resolveCustomSide(custom.dark))
  })

  it('知らない id は藍に落ちる', () => {
    expect(resolvePalette('nope', 'light', [custom])).toEqual(PRESET_PALETTES[0].light)
  })

  it('customPaletteCssVars は明暗それぞれ 9 色を --l-*／--d-* で返す', () => {
    const vars = customPaletteCssVars(custom)
    expect(vars['--l-bg']).toBe('#FFFFFF')
    expect(vars['--d-accent']).toBe('#FFA94D')
    expect(vars['--d-on-accent']).toBe(resolveCustomSide(custom.dark).onAccent)
    expect(Object.keys(vars)).toHaveLength(18)
  })
})
