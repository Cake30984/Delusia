import { describe, expect, it } from 'vitest'

/**
 * P9 段9 で旧画面の変数名（`--bg-elev` 等）と、それを新しい色へ当てる対応表を消した。
 * 旧い名前は定義が無いので、書くと色が抜ける。戻ってこないことを確かめる
 */
const LEGACY =
  /var\(--(bg-rail|bg-elev2?|border|text|text-dim|text-faint|text-muted|accent-hover|accent-soft|user|graph-lane-0|radius|radius-sm|bad)\)/

const sources = import.meta.glob(['../../**/*.{css,ts,tsx}', '!../../**/__tests__/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

describe('旧画面の変数名', () => {
  it('読み込めるファイルがある（glob の書き方の確かめ）', () => {
    expect(Object.keys(sources).some((p) => p.endsWith('styles/panels.css'))).toBe(true)
  })

  it('CSS とコンポーネントのどこにも残っていない', () => {
    const hits = Object.entries(sources).flatMap(([file, text]) =>
      text
        .split('\n')
        .map((line, i) => (LEGACY.test(line) ? `${file}:${i + 1}: ${line.trim()}` : null))
        .filter((x): x is string => !!x),
    )
    expect(hits).toEqual([])
  })
})
