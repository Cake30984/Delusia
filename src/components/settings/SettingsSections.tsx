import { useRef, useState } from 'react'
import { storeActions, useStore } from '../../store'
import { downloadBundle, downloadBlob } from '../../lib/io'
import { appConfirm } from '../../lib/dialogs'
import type { LlmRequestKind, UsageRecord } from '../../types'
import { defaultMaxTokensMode, type MaxTokensMode, type ReasoningLevel } from '../../lib/callTuning'
import FontLicenses from '../FontLicenses'
import { Icon } from '../icons'

/** モデル使用状況（計測。PC0）の種別表示順・ラベル */
const USAGE_KIND_ORDER: LlmRequestKind[] = [
  'main',
  'choices',
  'review',
  'nextScene',
  'imageDraft',
  'characterDraft',
  'kickoff',
  'endingProposal',
  'interlude',
]
const USAGE_KIND_LABELS: Record<LlmRequestKind, string> = {
  main: '本文',
  choices: '展開の候補',
  review: '章を閉じる',
  nextScene: '次の章の候補',
  imageDraft: '挿絵の起案',
  characterDraft: 'キャラクターの起案',
  kickoff: '物語の起案',
  endingProposal: '結末の提案',
  interlude: '別視点の幕間',
}

/** 使った金額の合計（この起動の間。記録はブラウザに残さない） */
export function totalUsageCost(usageLog: UsageRecord[]): number {
  return usageLog.reduce((a, r) => a + (r.cost ?? 0), 0)
}

const REASONING_OPTIONS: { value: ReasoningLevel | ''; label: string }[] = [
  { value: '', label: 'おまかせ' },
  { value: 'off', label: 'オフ' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
]

/** 種類ごとの推論・出力上限の表。未設定の項目は既定値（`callTuning.ts`）を選択済みとして見せる */
function CallTuningTable() {
  const callTuning = useStore((st) => st.callTuning)
  const { setCallTuning } = storeActions()
  return (
    <>
      <table className="usage-table call-tuning-table">
        <thead>
          <tr>
            <th>種別</th>
            <th>推論</th>
            <th>出力の上限</th>
          </tr>
        </thead>
        <tbody>
          {USAGE_KIND_ORDER.map((kind) => {
            const t = callTuning?.[kind]
            const mode = t?.maxTokens ?? defaultMaxTokensMode(kind)
            return (
              <tr key={kind}>
                <td>{USAGE_KIND_LABELS[kind]}</td>
                <td>
                  <select
                    aria-label={`${USAGE_KIND_LABELS[kind]}の推論`}
                    value={t?.reasoning ?? ''}
                    onChange={(e) =>
                      setCallTuning(kind, { reasoning: (e.target.value || undefined) as ReasoningLevel | undefined })
                    }
                  >
                    {REASONING_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    aria-label={`${USAGE_KIND_LABELS[kind]}の出力の上限`}
                    value={mode}
                    onChange={(e) => {
                      const v = e.target.value as MaxTokensMode
                      // 既定と同じ値は保存しない（既定が変わったときに追従させる）
                      setCallTuning(kind, { maxTokens: v === defaultMaxTokensMode(kind) ? undefined : v })
                    }}
                  >
                    <option value="unlimited">上限なし</option>
                    <option value="app">{kind === 'main' ? '物語ごとの設定' : 'アプリの既定'}</option>
                  </select>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="set-desc" style={{ marginTop: 10 }}>
        推論は OpenRouter 経由の呼び出しにだけ効きます。「おまかせ」はモデルの既定のままです。
        DeepSeek V4 のように低・中・高の違いが効かず「オフ」だけが効くモデルもあります。
        推論するモデルは推論の分も出力の上限に数えられるため、上限を付けると本文が途中で切れやすくなります。
        「上限なし」はモデル側の最大まで出力できます（多くの場合は書き終われば止まります）。
        本編の「物語ごとの設定」は、物語の設定画面の「最大トークン」を使います。
      </div>
    </>
  )
}

/** モデル使用状況（計測）の集計表示（PC0）。usageLog は非永続・エクスポート対象外の生ログをそのまま渡す */
function UsageLogSummary({ usageLog, onClear }: { usageLog: UsageRecord[]; onClear: () => void }) {
  if (usageLog.length === 0) {
    return <p className="set-desc">まだ記録がありません。物語を進めると記録が増えます。</p>
  }

  const rows = USAGE_KIND_ORDER.map((kind) => {
    const recs = usageLog.filter((r) => r.kind === kind)
    if (recs.length === 0) return null
    const promptTokens = recs.reduce((a, r) => a + r.promptTokens, 0)
    const cachedTokens = recs.reduce((a, r) => a + r.cachedTokens, 0)
    const completionTokens = recs.reduce((a, r) => a + r.completionTokens, 0)
    const cost = recs.reduce((a, r) => a + (r.cost ?? 0), 0)
    const ms = recs.reduce((a, r) => a + r.ms, 0)
    return {
      kind,
      count: recs.length,
      promptTokens,
      cachedTokens,
      completionTokens,
      cost,
      avgSec: ms / recs.length / 1000,
      hitRate: promptTokens > 0 ? (cachedTokens / promptTokens) * 100 : 0,
    }
  }).filter((r): r is NonNullable<typeof r> => !!r)

  const total = {
    count: usageLog.length,
    promptTokens: rows.reduce((a, r) => a + r.promptTokens, 0),
    cachedTokens: rows.reduce((a, r) => a + r.cachedTokens, 0),
    completionTokens: rows.reduce((a, r) => a + r.completionTokens, 0),
    cost: rows.reduce((a, r) => a + r.cost, 0),
  }
  const totalHitRate = total.promptTokens > 0 ? (total.cachedTokens / total.promptTokens) * 100 : 0

  const upstreamCounts = usageLog.reduce<Record<string, number>>((acc, r) => {
    const key = r.upstream || '(不明)'
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})

  const exportLog = async () => {
    const blob = new Blob([JSON.stringify(usageLog, null, 2)], { type: 'application/json' })
    const stamp = new Date().toISOString().slice(0, 10)
    await downloadBlob(blob, `usage-log-${stamp}.json`)
  }
  const clearLog = async () => {
    if (!(await appConfirm('実測記録をすべて削除しますか？'))) return
    onClear()
  }

  return (
    <>
      <table className="usage-table">
        <thead>
          <tr>
            <th>種別</th>
            <th>回数</th>
            <th>prompt計</th>
            <th>cached計（率）</th>
            <th>completion計</th>
            <th>cost計</th>
            <th>平均秒</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.kind}>
              <td>{USAGE_KIND_LABELS[r.kind]}</td>
              <td>{r.count}</td>
              <td>{r.promptTokens.toLocaleString()}</td>
              <td>
                {r.cachedTokens.toLocaleString()}（{r.hitRate.toFixed(1)}%）
              </td>
              <td>{r.completionTokens.toLocaleString()}</td>
              <td>{r.cost > 0 ? `$${r.cost.toFixed(4)}` : '-'}</td>
              <td>{r.avgSec.toFixed(1)}s</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>合計</td>
            <td>{total.count}</td>
            <td>{total.promptTokens.toLocaleString()}</td>
            <td>
              {total.cachedTokens.toLocaleString()}（{totalHitRate.toFixed(1)}%）
            </td>
            <td>{total.completionTokens.toLocaleString()}</td>
            <td>{total.cost > 0 ? `$${total.cost.toFixed(4)}` : '-'}</td>
            <td>-</td>
          </tr>
        </tfoot>
      </table>

      <div className="set-desc" style={{ marginTop: 10 }}>
        上流プロバイダの内訳:{' '}
        {Object.entries(upstreamCounts)
          .map(([name, n]) => `${name} ×${n}`)
          .join(' / ')}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="btn" onClick={exportLog}>
          <Icon name="download" size={14} /> JSON で書き出す
        </button>
        <button className="btn" onClick={clearLog}>
          <Icon name="broom" size={14} /> クリア
        </button>
      </div>
    </>
  )
}

/** AI 呼び出しの詳細（種類ごとの推論の量と出力の上限） */
export function TuningSettings() {
  return (
    <section className="set-section" aria-label="AI 呼び出しの詳細">
      <p className="set-desc">
        呼び出しの種類ごとに、推論の量と出力の上限を変えられる。途中で切れて失敗するときに直す。
      </p>
      <div className="set-table-wrap">
        <CallTuningTable />
      </div>
    </section>
  )
}

/** 使った金額（この起動の間の AI 呼び出しの記録） */
export function UsageSettings() {
  const usageLog = useStore((st) => st.usageLog)
  const { clearUsageLog } = storeActions()
  const total = totalUsageCost(usageLog)
  return (
    <section className="set-section" aria-label="使った金額">
      <p className="set-desc">
        アプリを開いてからの AI 呼び出しの金額・キャッシュの効き・かかった時間。開き直すと消える（どこにも保存しない）。
      </p>
      <p className="set-total">
        合計 <b>{total > 0 ? `$${total.toFixed(4)}` : '$0'}</b>　{usageLog.length} 回
      </p>
      <div className="set-table-wrap">
        <UsageLogSummary usageLog={usageLog} onClear={clearUsageLog} />
      </div>
    </section>
  )
}

/** データの書き出しと読み込み・使っていない画像の整理 */
export function DataSettings() {
  const { exportBundle, importAnyFile, gcUnusedImages } = storeActions()
  const [includeImages, setIncludeImages] = useState(true)
  const [notice, setNotice] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const onExport = async () => {
    const bundle = await exportBundle(includeImages)
    if (bundle.images && bundle.images.length > 0) {
      const bytes = bundle.images.reduce((sum, img) => sum + img.dataBase64.length * 0.75, 0)
      const mb = (bytes / (1024 * 1024)).toFixed(1)
      if (!(await appConfirm(`画像 ${bundle.images.length} 件を含めます（およそ ${mb} MB）。書き出しますか？`))) return
    }
    downloadBundle(bundle)
    setNotice('すべてのデータを書き出しました。')
  }

  const onImportFile = async (file: File) => {
    try {
      setNotice(await importAnyFile(file))
    } catch (e) {
      setNotice(`読み込めませんでした：${(e as Error).message}`)
    }
  }

  return (
    <>
      <section className="set-section" aria-label="書き出しと読み込み">
        <h2 className="set-h2">書き出しと読み込み</h2>
        <p className="set-desc">
          キャラクター・世界観・物語をまとめて JSON で書き出し、読み込んで戻す。ブラウザの保存領域はブラウザ側の消去で
          失われるので、ときどき書き出しておくと安心。読み込みは物語のカード・カセットの PNG も受けつける。
        </p>
        <label className="set-check">
          <input type="checkbox" checked={includeImages} onChange={(e) => setIncludeImages(e.target.checked)} />
          画像も含める（キャラクターの絵・挿絵。大きくなることがある）
        </label>
        <div className="set-actions">
          <button className="btn" onClick={onExport}>
            <Icon name="download" size={14} /> 書き出す
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={14} /> 読み込む
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json,image/png,.png"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onImportFile(f)
              e.target.value = ''
            }}
          />
        </div>
      </section>
      <section className="set-section" aria-label="使っていない画像の整理">
        <h2 className="set-h2">使っていない画像の整理</h2>
        <p className="set-desc">
          どのキャラクター・物語・分岐からも使われなくなった画像を消して、容量を空ける。使っている画像は消えない。
        </p>
        <div className="set-actions">
          <button
            className="btn"
            onClick={async () => {
              const removed = await gcUnusedImages()
              setNotice(`使っていない画像を ${removed} 件消しました。`)
            }}
          >
            <Icon name="broom" size={14} /> 使っていない画像を消す
          </button>
        </div>
      </section>
      {notice && <p className="set-desc">{notice}</p>}
    </>
  )
}

/** このアプリについて（利用規約・書体のライセンス） */
export function AboutSettings() {
  return (
    <section className="set-section" aria-label="このアプリについて">
      <p className="set-desc">
        デルシア{'　'}
        <a
          href="https://github.com/Cake30984/Delusia/blob/main/docs/利用規約とプライバシー.md"
          target="_blank"
          rel="noreferrer"
        >
          利用規約とプライバシー
        </a>
      </p>
      <FontLicenses />
    </section>
  )
}
