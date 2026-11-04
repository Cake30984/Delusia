/**
 * 画面の色（P9）。用意した色10組（5種×明暗）と、利用者が選んだ3色（背景・文字・アクセント）から
 * 残りの色を決める式、明暗比の計算と読みにくさの警告、アクセントを基準まで直す処理。
 * **純関数だけ**を置く（DOM へ当てるのは `App.tsx`、CSS の値は `styles/tokens.css`）。
 *
 * 基準（計画書 P9「決まったこと」）:
 * - 補助文字・リンク・ボタンの文字は 4.5:1 以上、入力欄の枠（edge）は 3:1 以上
 * - 自分の色の警告: 文字と背景が 7:1 未満／アクセントと背景が 4.5:1 未満／on-accent とアクセントが 4.5:1 未満
 */
import type {
  CustomPalette,
  CustomPaletteSide,
  PaletteOverrides,
  PresetPaletteId,
} from '../types'

/** 明暗のどちら側か（`Appearance` の system を解いた後の値） */
export type ColorScheme = 'light' | 'dark'

/** 1つの明暗での画面の色一式（すべて `#RRGGBB`） */
export interface PaletteColors {
  bg: string
  ink: string
  sub: string
  line: string
  edge: string
  accent: string
  tint: string
  onAccent: string
  danger: string
}

export interface PresetPalette {
  id: PresetPaletteId
  label: string
  light: PaletteColors
  dark: PaletteColors
}

/** 危険色。明るい背景／暗い背景で全色共通 */
export const DANGER = { light: '#B3261E', dark: '#FF8A80' } as const

/** 用意した色（計画書 P9 の表と同じ値。`tokens.css` と一致することをテストで確かめる） */
export const PRESET_PALETTES: PresetPalette[] = [
  {
    id: 'ai',
    label: '藍',
    light: {
      bg: '#FFFFFF', ink: '#1F2328', sub: '#5F6670', line: '#E6E8EC', edge: '#878D97',
      accent: '#3843C8', tint: '#F4F5FB', onAccent: '#FFFFFF', danger: DANGER.light,
    },
    dark: {
      bg: '#121316', ink: '#E8EAEE', sub: '#9AA1AB', line: '#2A2D33', edge: '#6A717C',
      accent: '#9CA5FF', tint: '#1B1D26', onAccent: '#121316', danger: DANGER.dark,
    },
  },
  {
    id: 'kinari',
    label: '生成り',
    light: {
      bg: '#FBF7EF', ink: '#2B2620', sub: '#675D51', line: '#E6DCCB', edge: '#8E8373',
      accent: '#94441B', tint: '#F2EADC', onAccent: '#FFFFFF', danger: DANGER.light,
    },
    dark: {
      bg: '#1C1915', ink: '#EAE2D6', sub: '#A89C8C', line: '#363027', edge: '#7A6F61',
      accent: '#E3A577', tint: '#26221C', onAccent: '#1C1915', danger: DANGER.dark,
    },
  },
  {
    id: 'wakakusa',
    label: '若草',
    light: {
      bg: '#F8FAF7', ink: '#1E2620', sub: '#56625A', line: '#DCE4DC', edge: '#7E8A81',
      accent: '#2B6A3C', tint: '#EDF2EC', onAccent: '#FFFFFF', danger: DANGER.light,
    },
    dark: {
      bg: '#121714', ink: '#E2EAE4', sub: '#97A69B', line: '#27312B', edge: '#68776C',
      accent: '#8FD0A0', tint: '#1A221D', onAccent: '#121714', danger: DANGER.dark,
    },
  },
  {
    id: 'sakura',
    label: '桜',
    light: {
      bg: '#FFFAFA', ink: '#2A2124', sub: '#6B5C61', line: '#EEE0E4', edge: '#958389',
      accent: '#A8365A', tint: '#F9EEF1', onAccent: '#FFFFFF', danger: DANGER.light,
    },
    dark: {
      bg: '#181214', ink: '#EEE3E6', sub: '#AD9CA2', line: '#34292D', edge: '#7E6D73',
      accent: '#F29BB2', tint: '#22191C', onAccent: '#181214', danger: DANGER.dark,
    },
  },
  {
    id: 'sumi',
    label: '墨',
    light: {
      bg: '#FFFFFF', ink: '#000000', sub: '#3D3D3D', line: '#9E9E9E', edge: '#767676',
      accent: '#000000', tint: '#F0F0F0', onAccent: '#FFFFFF', danger: DANGER.light,
    },
    dark: {
      bg: '#000000', ink: '#FFFFFF', sub: '#C7C7C7', line: '#5C5C5C', edge: '#8A8A8A',
      accent: '#FFFFFF', tint: '#141414', onAccent: '#000000', danger: DANGER.dark,
    },
  },
]

// ---------- 色の計算 ----------

type Rgb = [number, number, number]

const HEX6 = /^#[0-9a-fA-F]{6}$/

export function isHexColor(v: string): boolean {
  return HEX6.test(v)
}

export function parseHex(hex: string): Rgb {
  if (!HEX6.test(hex)) throw new Error(`色の形式が #RRGGBB ではありません: ${hex}`)
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb
}

export function toHex([r, g, b]: Rgb): string {
  const h = (n: number) =>
    Math.round(Math.min(255, Math.max(0, n)))
      .toString(16)
      .padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase()
}

/** 色 a を色 b へ t（0〜1）だけ寄せた色（sRGB の値の上で線形に混ぜる） */
export function mix(a: string, b: string, t: number): string {
  const x = parseHex(a)
  const y = parseHex(b)
  return toHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as Rgb)
}

/** WCAG 2.x の相対輝度 */
export function relativeLuminance(hex: string): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = parseHex(hex).map(lin)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2.x の明暗比（1〜21） */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * 明るい背景か。白との比と黒との比が等しくなる輝度（約 0.179）を境にする。
 * これより明るい背景では黒い文字の方が、暗い背景では白い文字の方が読みやすい
 */
export function isLightColor(hex: string): boolean {
  return relativeLuminance(hex) > Math.sqrt(1.05 * 0.05) - 0.05
}

// ---------- 自分の色から残りを決める ----------

/** 文字を背景へ寄せていき、`refs` すべてに対して `min` 以上の比を保てる最も淡い色。start から 1% ずつ戻る */
function faintestInk(ink: string, bg: string, refs: string[], min: number, start: number): string {
  for (let i = Math.round(start * 100); i >= 0; i--) {
    const c = mix(ink, bg, i / 100)
    if (refs.every((r) => contrastRatio(c, r) >= min)) return c
  }
  return ink
}

/** 3色（背景・文字・アクセント）から自動で決まる色。式は計画書 P9 のとおり */
export function deriveColors(bg: string, ink: string, accent: string): PaletteColors {
  const tint = mix(accent, bg, 0.94)
  const sub = faintestInk(ink, bg, [bg, tint], 4.6, 0.45)
  const edge = faintestInk(ink, bg, [bg, tint], 3.1, 0.7)
  const line = mix(ink, bg, 0.88)
  // 白・黒・背景のうちアクセントとの比が最大のもの（同じなら先に挙げた方）
  let onAccent = '#FFFFFF'
  for (const c of ['#000000', bg]) {
    if (contrastRatio(c, accent) > contrastRatio(onAccent, accent)) onAccent = c
  }
  const danger = isLightColor(bg) ? DANGER.light : DANGER.dark
  return { bg, ink, sub, line, edge, accent, tint, onAccent, danger }
}

/** 自分の色の片側を、上書き（細かく決める）を反映した色一式にする */
export function resolveCustomSide(side: CustomPaletteSide): PaletteColors {
  const auto = deriveColors(side.bg, side.ink, side.accent)
  const o: PaletteOverrides = side.overrides ?? {}
  return {
    ...auto,
    sub: o.sub ?? auto.sub,
    line: o.line ?? auto.line,
    edge: o.edge ?? auto.edge,
    tint: o.tint ?? auto.tint,
    onAccent: o.onAccent ?? auto.onAccent,
    danger: o.danger ?? auto.danger,
  }
}

/**
 * 設定の `palette`（id）と明暗から色一式を引く。見つからない id は藍に落とす
 * （`normalizeUiPrefs` が先に既定へ戻すので、ふつうは起きない）
 */
export function resolvePalette(
  id: string,
  scheme: ColorScheme,
  customPalettes: CustomPalette[],
): PaletteColors {
  const preset = PRESET_PALETTES.find((p) => p.id === id)
  if (preset) return preset[scheme]
  const custom = customPalettes.find((c) => c.id === id)
  if (custom) return resolveCustomSide(custom[scheme])
  return PRESET_PALETTES[0][scheme]
}

// ---------- 読みにくさの確認 ----------

export type PaletteWarningKind = 'ink' | 'accent' | 'onAccent'

export interface PaletteWarning {
  kind: PaletteWarningKind
  /** 実際の明暗比 */
  ratio: number
  /** 基準の明暗比 */
  need: number
  /** 画面に出す説明 */
  message: string
}

/** 自分の色の警告の基準 */
export const CUSTOM_THRESHOLDS = { ink: 7, accent: 4.5, onAccent: 4.5 } as const

/** 読みにくい組み合わせの警告。保存は止めない（画面で警告と「近い色で直す」を出すため） */
export function paletteWarnings(c: PaletteColors): PaletteWarning[] {
  const out: PaletteWarning[] = []
  const check = (kind: PaletteWarningKind, ratio: number, message: string) => {
    const need = CUSTOM_THRESHOLDS[kind]
    if (ratio < need) out.push({ kind, ratio, need, message })
  }
  check('ink', contrastRatio(c.ink, c.bg), '文字と背景の差が小さく、本文が読みにくくなります')
  check('accent', contrastRatio(c.accent, c.bg), 'アクセントと背景の差が小さく、リンクやボタンが見分けにくくなります')
  check(
    'onAccent',
    contrastRatio(c.onAccent, c.accent),
    'ボタンの文字とアクセントの差が小さく、ボタンの文字が読みにくくなります',
  )
  return out
}

/**
 * 「近い色で直す」。アクセントを、明るい背景なら黒へ・暗い背景なら白へ 1% ずつ寄せ、
 * 背景との比が基準（4.5:1）に届いた最初の色を返す。既に届いていればそのまま返す
 */
export function fixAccent(accent: string, bg: string, need: number = CUSTOM_THRESHOLDS.accent): string {
  if (contrastRatio(accent, bg) >= need) return accent.toUpperCase()
  const toward = isLightColor(bg) ? '#000000' : '#FFFFFF'
  for (let i = 1; i <= 100; i++) {
    const c = mix(accent, toward, i / 100)
    if (contrastRatio(c, bg) >= need) return c
  }
  return toward
}

/** CSS 変数名（`tokens.css` の `--l-*`／`--d-*` の後ろ半分）と色一式のキーの対応 */
export const PALETTE_CSS_VARS: Record<keyof PaletteColors, string> = {
  bg: 'bg',
  ink: 'ink',
  sub: 'sub',
  line: 'line',
  edge: 'edge',
  accent: 'accent',
  tint: 'tint',
  onAccent: 'on-accent',
  danger: 'danger',
}

/**
 * 自分の色を `<html>` の style に入れるための変数の一覧（`--l-bg` 等）。
 * 用意した色は `tokens.css` が `data-palette` 属性で当てるので、これは自分の色にだけ使う
 */
export function customPaletteCssVars(p: CustomPalette): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [scheme, prefix] of [
    ['light', 'l'],
    ['dark', 'd'],
  ] as const) {
    const c = resolveCustomSide(p[scheme])
    for (const key of Object.keys(PALETTE_CSS_VARS) as (keyof PaletteColors)[]) {
      out[`--${prefix}-${PALETTE_CSS_VARS[key]}`] = c[key]
    }
  }
  return out
}
