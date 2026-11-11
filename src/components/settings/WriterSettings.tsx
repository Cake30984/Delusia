import { useState } from 'react'
import { storeActions, useStore } from '../../store'
import {
  PROVIDER_PRESETS,
  defaultOpenRouterProvider,
  modelRefLabel,
  newProvider,
  parseModelRef,
} from '../../lib/providers'
import { oauthPkceMode } from '../../lib/platform'
import { openRouterOAuthAvailable, redirectToOpenRouterOAuth, startOpenRouterOAuth } from '../../lib/oauthPkce'
import { testProviderConnection } from '../../lib/openrouter'
import { RECOMMENDED_MODELS } from '../../lib/recommendedModels'
import type { Provider } from '../../types'
import ModelPicker from '../ModelPicker'
import { Icon } from '../icons'

/** 接続の確認に使うモデル。既定のモデルがこの接続先のものならそれ、OpenRouter なら推奨の先頭、ほかは読み込んだ一覧の先頭 */
function testModelFor(
  p: Provider,
  providers: Provider[],
  defaultModelRef: string | undefined,
  loaded: { id: string }[] | undefined,
): string {
  if (defaultModelRef) {
    const { provider, model } = parseModelRef(defaultModelRef, providers)
    if (provider?.id === p.id && model) return model
  }
  if (p.kind === 'openrouter') return RECOMMENDED_MODELS[0].id
  return loaded?.[0]?.id ?? ''
}

/**
 * 書き手（AI）の接続先（P9 段8）。接続先の一覧（名前・Base URL・API キー・つながるか試す・モデル一覧の読み込み）と、
 * 追加、新しい物語の既定のモデル。中身は旧 `SettingsBody` の接続先の欄のまま
 */
export default function WriterSettings() {
  const providers = useStore((st) => st.providers)
  const modelsLoadingFor = useStore((st) => st.modelsLoadingFor)
  const modelsByProvider = useStore((st) => st.modelsByProvider)
  const defaultModelRef = useStore((st) => st.defaultModelRef)
  const { upsertProvider, deleteProvider, loadModels, setDefaultModelRef } = storeActions()

  // API キーは手元に持ち「保存」で確定する
  const [localKeys, setLocalKeys] = useState<Record<string, string>>(() =>
    Object.fromEntries(providers.map((p) => [p.id, p.apiKey])),
  )
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [results, setResults] = useState<Record<string, { ok: boolean; message: string }>>({})
  const [testingId, setTestingId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  const [showAddForm, setShowAddForm] = useState(false)
  const [addPresetIdx, setAddPresetIdx] = useState(0)
  const [addLabel, setAddLabel] = useState(PROVIDER_PRESETS[0].label)
  const [addBaseUrl, setAddBaseUrl] = useState(PROVIDER_PRESETS[0].baseUrl)
  const [addKind, setAddKind] = useState<'openrouter' | 'openai'>(PROVIDER_PRESETS[0].kind)
  const [addKey, setAddKey] = useState('')
  const [showAddKey, setShowAddKey] = useState(false)
  const [showDefaultPicker, setShowDefaultPicker] = useState(false)
  const [oauthBusy, setOauthBusy] = useState(false)
  const [oauthError, setOauthError] = useState('')

  // Web は承認のためにページごと離れる（戻りは App が拾って接続先へ入れる。P5）
  const oauthLeavesPage = oauthPkceMode() === 'redirect'

  const connectOpenRouterOAuth = async () => {
    setOauthBusy(true)
    setOauthError('')
    try {
      if (oauthLeavesPage) {
        await redirectToOpenRouterOAuth('settings')
        return
      }
      const apiKey = await startOpenRouterOAuth()
      const existing = providers.find((p) => p.id === 'openrouter')
      const next = existing ? { ...existing, apiKey } : defaultOpenRouterProvider(apiKey)
      upsertProvider(next)
      setLocalKeys((k) => ({ ...k, [next.id]: apiKey }))
      setNotice('OpenRouter にブラウザ承認で接続しました。')
      setOauthBusy(false)
    } catch (e) {
      setOauthError((e as Error).message)
      setOauthBusy(false)
    }
  }

  const saveKey = (p: Provider) => {
    upsertProvider({ ...p, apiKey: localKeys[p.id] ?? '' })
    setNotice(`「${p.label}」の API キーを保存しました。`)
  }

  const runTest = async (p: Provider) => {
    const model = testModelFor(p, providers, defaultModelRef, modelsByProvider[p.id])
    if (!model) {
      setResults((r) => ({
        ...r,
        [p.id]: { ok: false, message: '試すモデルが決まっていません。先に「モデル一覧を読み込む」を押してください。' },
      }))
      return
    }
    setTestingId(p.id)
    try {
      const res = await testProviderConnection({ ...p, apiKey: localKeys[p.id] ?? p.apiKey }, model)
      setResults((r) => ({ ...r, [p.id]: { ok: res.ok, message: res.ok ? `${res.message}（${model}）` : res.message } }))
    } finally {
      setTestingId(null)
    }
  }

  const onPresetChange = (idx: number) => {
    setAddPresetIdx(idx)
    const preset = PROVIDER_PRESETS[idx]
    setAddLabel(preset.label)
    setAddBaseUrl(preset.baseUrl)
    setAddKind(preset.kind)
  }

  const addProviderSubmit = () => {
    const p = newProvider()
    p.label = addLabel.trim()
    p.kind = addKind
    p.baseUrl = addBaseUrl.trim()
    p.apiKey = addKey
    upsertProvider(p)
    setLocalKeys((k) => ({ ...k, [p.id]: addKey }))
    setAddKey('')
    setShowAddForm(false)
    setNotice('接続先を追加しました。')
  }

  return (
    <>
      <section className="set-section" aria-label="接続先">
        <p className="set-desc">
          物語を書く AI をどこから呼ぶか。API キーはこの端末の中にだけ保存し、AI を呼ぶとき以外には送りません。
        </p>

        {openRouterOAuthAvailable() && (
          <div className="set-block">
            <button className="btn primary set-wide-btn" onClick={connectOpenRouterOAuth} disabled={oauthBusy}>
              {oauthBusy
                ? oauthLeavesPage
                  ? '承認の画面へ移っています'
                  : 'ブラウザで承認してください'
                : 'OpenRouter にブラウザで接続する（キーの貼りつけは要らない）'}
            </button>
            {oauthError && <p className="set-result bad">{oauthError}</p>}
          </div>
        )}

        {providers.map((p) => {
          const res = results[p.id]
          return (
            <div key={p.id} className="set-card">
              <div className="set-card-top">
                <input
                  className="set-input"
                  aria-label="接続先の名前"
                  placeholder="接続先の名前"
                  value={p.label}
                  onChange={(e) => upsertProvider({ ...p, label: e.target.value })}
                />
                <span className="set-kind">{p.kind === 'openrouter' ? 'OpenRouter' : 'OpenAI 互換'}</span>
                <button
                  className="icon-btn small"
                  onClick={() => deleteProvider(p.id)}
                  disabled={providers.length <= 1}
                  title={providers.length <= 1 ? '最後の接続先は消せません' : 'この接続先を消す'}
                  aria-label="この接続先を消す"
                >
                  <Icon name="trash-2" size={14} />
                </button>
              </div>
              <label className="set-label">
                Base URL
                <input
                  className="set-input"
                  placeholder="https://openrouter.ai/api/v1"
                  value={p.baseUrl}
                  onChange={(e) => upsertProvider({ ...p, baseUrl: e.target.value })}
                />
              </label>
              <label className="set-label">API キー</label>
              <div className="set-input-row">
                <input
                  className="set-input"
                  aria-label={`${p.label}の API キー`}
                  type={showKeys[p.id] ? 'text' : 'password'}
                  placeholder="キーを貼りつける"
                  value={localKeys[p.id] ?? ''}
                  onChange={(e) => setLocalKeys((k) => ({ ...k, [p.id]: e.target.value }))}
                />
                <button className="btn" onClick={() => setShowKeys((s) => ({ ...s, [p.id]: !s[p.id] }))}>
                  {showKeys[p.id] ? '隠す' : '見る'}
                </button>
                <button className="btn primary" onClick={() => saveKey(p)}>
                  保存
                </button>
              </div>
              <div className="set-actions">
                <button className="btn" onClick={() => void runTest(p)} disabled={testingId === p.id}>
                  {testingId === p.id ? '試しています' : 'つながるか試す'}
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    loadModels(p.id)
                    setNotice(`「${p.label}」のモデル一覧を読み込んでいます。`)
                  }}
                  disabled={modelsLoadingFor === p.id}
                >
                  {modelsLoadingFor === p.id ? '読み込んでいます' : 'モデル一覧を読み込む'}
                </button>
              </div>
              {res && <p className={'set-result' + (res.ok ? ' ok' : ' bad')}>{res.message}</p>}
            </div>
          )
        })}

        {showAddForm ? (
          <div className="set-card">
            <label className="set-label">
              ひな形
              <select className="set-input" value={addPresetIdx} onChange={(e) => onPresetChange(Number(e.target.value))}>
                {PROVIDER_PRESETS.map((preset, i) => (
                  <option key={i} value={i}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="set-label">
              名前
              <input className="set-input" value={addLabel} onChange={(e) => setAddLabel(e.target.value)} />
            </label>
            <label className="set-label">
              Base URL
              <input className="set-input" value={addBaseUrl} onChange={(e) => setAddBaseUrl(e.target.value)} />
            </label>
            <label className="set-label">API キー</label>
            <div className="set-input-row">
              <input
                className="set-input"
                aria-label="追加する接続先の API キー"
                type={showAddKey ? 'text' : 'password'}
                placeholder="キーを貼りつける"
                value={addKey}
                onChange={(e) => setAddKey(e.target.value)}
              />
              <button className="btn" onClick={() => setShowAddKey((s) => !s)}>
                {showAddKey ? '隠す' : '見る'}
              </button>
            </div>
            <div className="set-actions">
              <button className="btn primary" onClick={addProviderSubmit} disabled={!addLabel.trim() || !addBaseUrl.trim()}>
                追加する
              </button>
              <button className="nm-link" onClick={() => setShowAddForm(false)}>
                やめる
              </button>
            </div>
          </div>
        ) : (
          <button className="lib-create" onClick={() => setShowAddForm(true)}>
            <Icon name="plus" size={14} /> 接続先を足す
          </button>
        )}
        {notice && <p className="set-desc">{notice}</p>}
      </section>

      <section className="set-section" aria-label="新しい物語の既定のモデル">
        <h2 className="set-h2">新しい物語の既定のモデル</h2>
        <p className="set-desc">新しい物語を作るとき・カセットから始めるときに、最初から選ばれているモデル。物語ごとに変えられる。</p>
        <div className="model-chip-row">
          <button className="model-chip grow" onClick={() => setShowDefaultPicker(true)}>
            {defaultModelRef ? modelRefLabel(defaultModelRef, providers) || defaultModelRef : '決めていない（OpenRouter におまかせ）'}
          </button>
          {defaultModelRef && (
            <button className="btn" onClick={() => setDefaultModelRef('')}>
              外す
            </button>
          )}
        </div>
      </section>

      {showDefaultPicker && (
        <ModelPicker
          current={defaultModelRef ?? ''}
          onPick={(ref) => setDefaultModelRef(ref)}
          onClose={() => setShowDefaultPicker(false)}
        />
      )}
    </>
  )
}
