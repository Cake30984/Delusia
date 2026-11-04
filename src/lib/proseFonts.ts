import type { ProseFont } from '../types'

/**
 * 本文の書体の CSS を、選ばれたときに初めて読み込む（P9）。
 * 書体の CSS は `unicode-range` の一覧が長く、4書体を最初から読むと画面の表示を止める CSS が
 * 約 490KB になる。画面の文字にも使う M PLUS 2（ゴシック）だけは `main.tsx` で先に読み、
 * 残りの3書体はここで後から読む。読んだ CSS はハッシュ付きの素材なので、Web 版は sw.js が保存する
 */
const LOADERS: Partial<Record<ProseFont, () => Promise<unknown>>> = {
  mincho: () => import('@fontsource/shippori-mincho/400.css'),
  maru: () => import('@fontsource/zen-maru-gothic/400.css'),
  ud: () => import('@fontsource/biz-udpgothic/400.css'),
}

const loaded = new Set<ProseFont>()

/** 書体の CSS を読み込む（2回目以降は何もしない）。失敗しても本文は代わりの書体で出るので握りつぶす */
export function loadProseFont(font: ProseFont): void {
  const load = LOADERS[font]
  if (!load || loaded.has(font)) return
  loaded.add(font)
  load().catch(() => loaded.delete(font))
}
