/**
 * LLM 呼び出しの種類ごとの調整（推論の量・出力の上限）。**純関数**（store を import しない）。
 *
 * 推論するモデル（DeepSeek V4 / Claude など）は推論トークンも `max_tokens` に数えられる。
 * 実測（2026-11-03・起案）: DeepSeek V4 Flash は既定で推論に約 5,000〜10,000 トークン使い、
 * 上限 6,000 では 4 回中 4 回とも JSON が途中で切れた。推論オフなら約 2,600 トークンで完了し、
 * 上限を送らなければ推論込みで完了した。effort（低・中・高）は DeepSeek では効かなかった。
 * ——なので**既定は「上限なし」**（`max_tokens` を送らない）にし、推論は種類ごとに選べるようにする。
 */
import type { LlmRequestKind } from '../types'

/** 推論の量。未設定＝モデルにおまかせ（何も送らない） */
export type ReasoningLevel = 'off' | 'low' | 'medium' | 'high'

/**
 * 出力の上限。
 * - `unlimited`: `max_tokens` を送らない（モデル側の最大まで）
 * - `app`: アプリが種類ごとに決めた値を送る（本編は物語ごとの「最大トークン」）
 */
export type MaxTokensMode = 'unlimited' | 'app'

export interface CallTuning {
  reasoning?: ReasoningLevel
  maxTokens?: MaxTokensMode
}

/** 種類ごとの調整（未設定の種類は既定値） */
export type CallTuningMap = Partial<Record<LlmRequestKind, CallTuning>>

/**
 * 出力の上限の既定。**本編だけ `app`**＝物語ごとの「最大トークン」スライダーを今までどおり効かせる。
 * 裏方は上限で切れると JSON が読めず失敗になるので、既定で外す。
 */
export function defaultMaxTokensMode(kind: LlmRequestKind): MaxTokensMode {
  return kind === 'main' ? 'app' : 'unlimited'
}

/** 呼び出しへ渡す値に解決する。`maxTokens: undefined` ＝ `max_tokens` を送らない */
export function resolveCallTuning(
  map: CallTuningMap | undefined,
  kind: LlmRequestKind,
  appMaxTokens: number,
): { maxTokens: number | undefined; reasoning: ReasoningLevel | undefined } {
  const t = map?.[kind]
  const mode = t?.maxTokens ?? defaultMaxTokensMode(kind)
  return { maxTokens: mode === 'app' ? appMaxTokens : undefined, reasoning: t?.reasoning }
}

/**
 * OpenRouter の `reasoning` パラメータ。**対応を申告していないモデルには送らない**——
 * スキーマ強制時は `require_parameters` が付くため、未対応の値を送ると上流が見つからず 404 になる。
 * `supportedParameters` が無い（一覧未取得）ときは送る（OpenRouter は未対応のパラメータを無視する）。
 */
export function reasoningParam(
  level: ReasoningLevel | undefined,
  supportedParameters: readonly string[] | undefined,
): { enabled: false } | { effort: 'low' | 'medium' | 'high' } | undefined {
  if (!level) return undefined
  if (supportedParameters?.length && !supportedParameters.includes('reasoning')) return undefined
  return level === 'off' ? { enabled: false } : { effort: level }
}
