/**
 * OpenRouter のおすすめのモデル（P7 段階 A-1 で 4 件 → 2026-11-14 に 1 件へ絞った。`docs/決定記録.md` §10）。
 *
 * はじめての起動では**モデルを選ばせず、先頭（＝唯一）のモデルで始める**。詳しい人は「変更」から一覧で選ぶ。
 * `DEFAULT_MODEL`（store）と、設定の「つながるか試す」の既定もこの先頭を使う。
 *
 * - id は日付の付かない `deepseek/deepseek-v4-flash`（OpenRouter が V4 Flash の最新版へ向ける）。
 *   日付付きの版で固定すると古い版に取り残されるので、**V4 Flash の系列の中では最新に追従させる**。
 *   系列をまたぐ「常に最新」別名（`~x-ai/grok-latest` など）は使わない（新しい系列で表現の制限が大きく変わりうる。
 *   最新の DeepSeek も制限が強まった印象があり、2026-11 時点では勧めない）
 * - 画面では「〜時点のおすすめ」とは書かない（id が最新版へ追従するので日付が意味を持たない）。
 *   情勢はすぐ変わるので、その時に良いモデルは各自で選んでもらう
 * - 接続テストに失敗しても自動で別のモデルへは切り替えない（勝手に変わると拒否や文体の変化の理由を追えない）
 */
export interface RecommendedModel {
  id: string
  name: string
}

export const RECOMMENDED_MODELS: readonly RecommendedModel[] = [{ id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash' }]

export function isRecommendedModel(id: string): boolean {
  return RECOMMENDED_MODELS.some((m) => m.id === id)
}
