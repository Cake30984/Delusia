import { useEffect, useRef, useState } from 'react'
import { storeActions, useStore } from '../store'
import { GEMINI_OPENAI_BASE_URL, isLocalEndpoint, makeModelRef, newProvider, requiresApiKey } from '../lib/providers'
import { oauthPkceMode } from '../lib/platform'
import { openRouterOAuthAvailable, redirectToOpenRouterOAuth, startOpenRouterOAuth } from '../lib/oauthPkce'
import { testProviderConnection, type ConnectionTestResult } from '../lib/openrouter'
import { RECOMMENDED_MODELS } from '../lib/recommendedModels'
import { startKickoff, useIsMobile, useOverlays } from '../lib/nav'
import type { Provider, ProviderKind } from '../types'
import ModelPicker from './ModelPicker'
import RecommendedModelList from './RecommendedModelList'
import HelpDetails from './HelpDetails'

type PathId = 'openrouter' | 'free' | 'local'

interface PathDef {
  id: PathId
  label: string
  /** カードの下の一行（課金・キーの要否・向いている人） */
  desc: string
  presetLabel: string
  presetKind: ProviderKind
  presetBaseUrl: string
  /**
   * 接続テストに使う既定モデル。空文字ならユーザーに選ばせる（ローカルは既知のモデル名が無い）。
   * OpenRouter は推奨リストの先頭（`RECOMMENDED_MODELS`）。Gemini は無料枠で新規ユーザーに開放されている
   * Flash 系のうち **1 日のリクエスト上限が多いもの**を選ぶ（2026-09 時点: `gemini-2.5-flash` は新規停止、
   * `gemini-3.6-flash` は通るが 20 回/日で体験版として足りない、`gemini-3.5-flash-lite` は 300 回/日程度で品質も十分）。
   */
  presetModel: string
  /** キーの取り方（提供元のキーの画面） */
  keyHelpUrl?: string
  /** 気をつけること（入力の扱い・PC の要件） */
  note?: string
}

const PATHS: PathDef[] = [
  {
    id: 'free',
    label: '無料枠で始める',
    desc: 'Gemini の無料枠を使う。Google のキーが要る',
    presetLabel: 'Gemini（無料枠）',
    presetKind: 'openai',
    presetBaseUrl: GEMINI_OPENAI_BASE_URL,
    presetModel: 'gemini-3.5-flash-lite',
    keyHelpUrl: 'https://aistudio.google.com/apikey',
    note: '無料枠では、入力が提供元の品質改善に使われることがあります。',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter で接続',
    desc: '従量課金。おすすめのモデルを選べる',
    presetLabel: 'OpenRouter',
    presetKind: 'openrouter',
    presetBaseUrl: 'https://openrouter.ai/api/v1',
    presetModel: RECOMMENDED_MODELS[0].id,
    keyHelpUrl: 'https://openrouter.ai/keys',
  },
  {
    id: 'local',
    label: 'PC で動かす',
    desc: 'Ollama などをこの PC で動かしている人向け',
    presetLabel: 'ローカル接続先',
    presetKind: 'openai',
    presetBaseUrl: 'http://localhost:11434/v1',
    presetModel: '',
    note: '外へは何も送りません。数 GB のダウンロードと、それなりの PC の性能が要ります。',
  },
]

/**
 * はじめての起動（P9 段8。R5 の初回ウィザードを1枚のページにした）。
 * 1. 書き手を選ぶ（無料枠・OpenRouter・PC で動かす。モバイルは PC で動かすを出さない＝スマートフォンからは届かない）
 *    → キーを入れて「つながるか試す」。OpenRouter はブラウザ承認が使えればキーの貼りつけが要らない
 * 2. 最初の物語を一行で（一行から始める＝起案）。サンプルの物語を読む・あとで、も選べる
 */
export default function FirstRunWizard({
  onClose,
  oauthReturnKey,
  oauthReturnModel,
}: {
  onClose: () => void
  /** P5: Web のリダイレクト承認から戻ってきたときの API キー。開いた直後に接続テストへ進む */
  oauthReturnKey?: string
  /** 承認へ出る前に選んでいたモデル（ページを離れるので `sessionStorage` 経由で戻ってくる）。無ければ推奨の先頭 */
  oauthReturnModel?: string
}) {
  const mobile = useIsMobile()
  const providers = useStore((st) => st.providers)
  const { upsertProvider, setDefaultModelRef, openStarterStory, setView } = storeActions()

  const [step, setStep] = useState<1 | 2>(1)
  const [pathId, setPathId] = useState<PathId | null>(null)
  const [providerId, setProviderId] = useState<string | null>(null)
  const [model, setModel] = useState('')
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [oauthBusy, setOauthBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null)
  const [premise, setPremise] = useState('')

  const path = PATHS.find((p) => p.id === pathId) ?? null
  const provider = providers.find((p) => p.id === providerId) ?? null
  const isOpenRouterPath = path?.id === 'openrouter'
  const isOAuthPath = isOpenRouterPath && openRouterOAuthAvailable()
  // Web は承認のためにページごと離れる。押した後この画面は消えるので文言を変える（P5）
  const oauthLeavesPage = oauthPkceMode() === 'redirect'
  const paths = mobile ? PATHS.filter((p) => p.id !== 'local') : PATHS
  const connected = testResult?.ok === true

  const choosePath = (def: PathDef) => {
    if (def.id === pathId) return
    let draft: Provider
    if (def.presetKind === 'openrouter') {
      // OpenRouter は初期状態の既定 id='openrouter' を再利用する（空の重複エントリを作らない。
      // 設定画面の OAuth も同じ id に鍵を入れる）
      const existing = providers.find((p) => p.kind === 'openrouter')
      draft = existing ?? { ...newProvider(), id: 'openrouter', kind: 'openrouter', label: def.presetLabel, baseUrl: def.presetBaseUrl }
    } else {
      // 同じ道を選び直したときに接続先を増やさない（同じ Base URL の接続先を使い回す）
      const existing = providers.find((p) => p.kind === def.presetKind && p.baseUrl === def.presetBaseUrl)
      draft = existing ?? { ...newProvider(), label: def.presetLabel, kind: def.presetKind, baseUrl: def.presetBaseUrl }
    }
    upsertProvider(draft)
    setPathId(def.id)
    setProviderId(draft.id)
    setModel(def.presetModel)
    setTestResult(null)
  }

  const updateProvider = (patch: Partial<Provider>) => {
    if (!provider) return
    upsertProvider({ ...provider, ...patch })
    setTestResult(null)
  }

  /** 接続テスト本体。**state ではなく引数の接続先・モデルを見る**（承認直後は state がまだ古い） */
  const runTestOn = async (target: Provider, modelId: string): Promise<boolean> => {
    setTesting(true)
    setTestResult(null)
    const result = await testProviderConnection(target, modelId)
    setTestResult(result)
    setTesting(false)
    if (result.ok) setDefaultModelRef(makeModelRef(target.id, modelId))
    return result.ok
  }

  const runTest = async (apiKeyOverride?: string) => {
    if (!provider) return false
    return runTestOn(apiKeyOverride !== undefined ? { ...provider, apiKey: apiKeyOverride } : provider, model)
  }

  const runOAuth = async () => {
    setOauthBusy(true)
    setTestResult(null)
    try {
      if (oauthLeavesPage) {
        // ここで戻らない（ページごと OpenRouter へ移動する）。続きは App が戻りを拾って再開する。
        // 選んでいたモデルも一緒に預ける（戻った時に選び直しにならないように）
        await redirectToOpenRouterOAuth('wizard', model)
        return
      }
      const apiKey = await startOpenRouterOAuth()
      if (provider) upsertProvider({ ...provider, apiKey })
      setOauthBusy(false)
      await runTest(apiKey)
    } catch (e) {
      setTestResult({ ok: false, kind: 'unknown', message: (e as Error).message })
      setOauthBusy(false)
    }
  }

  // P5: Web のリダイレクト承認から戻ってきた場合。App が鍵を接続先へ入れた状態で開くので、
  // OpenRouter を選んだ状態にして接続テストまで一気に進める（デスクトップ版と同じ画面に着地させる）
  const oauthReturnHandled = useRef(false)
  useEffect(() => {
    if (!oauthReturnKey || oauthReturnHandled.current) return
    oauthReturnHandled.current = true
    const def = PATHS.find((p) => p.id === 'openrouter')!
    const target = providers.find((p) => p.kind === 'openrouter')
    if (!target) return
    const returnModel = oauthReturnModel?.trim() || def.presetModel
    setPathId(def.id)
    setProviderId(target.id)
    setModel(returnModel)
    void runTestOn({ ...target, apiKey: oauthReturnKey }, returnModel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oauthReturnKey])

  const needsKey = !!provider && requiresApiKey(provider)
  const hasKey = !!provider?.apiKey.trim()
  const canTest = !!provider && !testing && !oauthBusy && !!model.trim() && (!needsKey || hasKey)

  /** 下の主ボタン: つながっていれば次へ、まだなら試してから次へ（OpenRouter の承認前は承認へ） */
  const primary = async () => {
    if (connected) return setStep(2)
    if (isOAuthPath && !hasKey) return void runOAuth()
    if (await runTest()) setStep(2)
  }
  const primaryLabel = connected
    ? '次へ'
    : isOAuthPath && !hasKey
      ? oauthBusy
        ? oauthLeavesPage
          ? '承認の画面へ移っています'
          : 'ブラウザで承認してください'
        : 'ブラウザで承認する'
      : testing
        ? '試しています'
        : 'つながるか試して次へ'
  const primaryDisabled = !path || (connected ? false : isOAuthPath && !hasKey ? oauthBusy || !model.trim() : !canTest)

  const startStory = () => {
    const line = premise.trim()
    if (!line) return
    void startKickoff(line)
    // 起案の進み具合は「新しい物語を始める」の一行からに出る（終わると物語の設定が開く）
    useOverlays.getState().setNewStoryWay('line')
    setView('new')
    onClose()
  }
  const openSample = () => {
    openStarterStory()
    onClose()
  }

  const steps = (
    <div className="onb-steps" aria-label="手順">
      <div className={'onb-step' + (step === 1 ? ' on' : '')}>
        <b>1</b>書き手を選ぶ
      </div>
      <div className={'onb-step' + (step === 2 ? ' on' : '')}>
        <b>2</b>最初の物語を一行で
      </div>
    </div>
  )

  return (
    <div className={'onb-page' + (mobile ? ' mobile' : '')} role="dialog" aria-modal="true" aria-label="はじめての起動">
      <header className="onb-head">
        <div className="onb-brand">デルシア</div>
        {mobile ? <div className="onb-count">{step} / 2</div> : null}
        <button className="nm-link onb-later" onClick={onClose}>
          あとで
        </button>
      </header>

      <main className="onb-main">
        {!mobile && steps}

        {step === 1 ? (
          <>
            <div>
              <h1 className="onb-title">AI が物語を書き、あなたが読んで導きます</h1>
              <p className="onb-lead">
                {mobile
                  ? '物語を書く AI をどこから呼ぶかを選んでください。'
                  : 'まず、物語を書く AI をどこから呼ぶかを選んでください。あとから「表示と設定」で変えられます。'}
              </p>
            </div>

            <div className="onb-ways" role="radiogroup" aria-label="書き手の接続先">
              {paths.map((p) => (
                <button
                  key={p.id}
                  role="radio"
                  aria-checked={p.id === pathId}
                  className={'onb-way' + (p.id === pathId ? ' on' : '')}
                  onClick={() => choosePath(p)}
                >
                  {p.label}
                  <small>
                    {p.id === 'openrouter' && openRouterOAuthAvailable()
                      ? '従量課金。ブラウザで承認するだけ。おすすめのモデルを選べる'
                      : p.desc}
                  </small>
                </button>
              ))}
            </div>

            {path && provider && (
              <div className="onb-form">
                {path.note && <p className="set-desc">{path.note}</p>}

                {path.id === 'local' && (
                  <label className="set-label">
                    Base URL
                    <input
                      className="set-input"
                      value={provider.baseUrl}
                      onChange={(e) => updateProvider({ baseUrl: e.target.value })}
                    />
                  </label>
                )}
                {/* P5: ブラウザ版はページとローカルサーバの間に CORS があるので、サーバ側の設定が要る */}
                {oauthLeavesPage && isLocalEndpoint(provider.baseUrl) && <LocalCorsHelp />}

                {isOAuthPath ? (
                  <p className="set-desc">
                    {oauthLeavesPage
                      ? 'OpenRouter の承認の画面へ移ります。「Allow」を選ぶとこのページに戻り、選んだモデルでつながるか試します。'
                      : 'ブラウザで OpenRouter の承認の画面が開きます。「Allow」を選ぶとこのアプリに戻り、選んだモデルでつながるか試します。'}
                  </p>
                ) : (
                  needsKey && (
                    <div className="onb-key">
                      <label htmlFor="onb-key" className="set-label">
                        API キー
                      </label>
                      <div className="set-input-row">
                        <input
                          id="onb-key"
                          type="password"
                          className="set-input"
                          placeholder="キーを貼りつける"
                          value={provider.apiKey}
                          onChange={(e) => updateProvider({ apiKey: e.target.value })}
                        />
                        {!mobile && (
                          <button className="btn onb-test" onClick={() => void runTest()} disabled={!canTest}>
                            {testing ? '試しています' : 'つながるか試す'}
                          </button>
                        )}
                      </div>
                      {path.keyHelpUrl && (
                        <a className="onb-help" href={path.keyHelpUrl} target="_blank" rel="noreferrer">
                          キーの取り方
                        </a>
                      )}
                    </div>
                  )
                )}

                <div>
                  <label className="set-label">モデル</label>
                  {isOpenRouterPath ? (
                    <RecommendedModelList
                      provider={provider}
                      value={model}
                      onChange={(m) => {
                        setModel(m)
                        setTestResult(null)
                      }}
                      onOpenPicker={() => setShowModelPicker(true)}
                    />
                  ) : (
                    <div className="set-input-row">
                      <input
                        className="set-input"
                        aria-label="モデル"
                        placeholder={path.id === 'local' ? 'llama3.1 など' : 'gemini-3.5-flash-lite など'}
                        value={model}
                        onChange={(e) => {
                          setModel(e.target.value)
                          setTestResult(null)
                        }}
                      />
                      <button className="btn" onClick={() => setShowModelPicker(true)}>
                        一覧から選ぶ
                      </button>
                    </div>
                  )}
                </div>

                {testResult && <TestResultBox result={testResult} retryHint={isOpenRouterPath} />}
                {isOAuthPath && hasKey && !connected && (
                  <div className="set-actions">
                    <button className="btn" onClick={() => void runTest()} disabled={!canTest}>
                      {testing ? '試しています' : 'つながるか試す'}
                    </button>
                    <button className="nm-link" onClick={() => void runOAuth()} disabled={oauthBusy || testing}>
                      ブラウザで承認し直す
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="onb-foot">
              <button className="btn primary onb-primary" onClick={() => void primary()} disabled={primaryDisabled}>
                {primaryLabel}
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <h1 className="onb-title">最初の物語を一行で</h1>
              <p className="onb-lead">
                読みたい話を一行で書いてください。AI が世界観・登場人物・書き出しを考え、始める前に直せます。
              </p>
            </div>
            <textarea
              className="set-input onb-premise"
              aria-label="最初の物語の一行"
              placeholder="例: 廃線になった駅で、毎晩同じ時刻に汽笛が聞こえる"
              rows={3}
              value={premise}
              onChange={(e) => setPremise(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) startStory()
              }}
            />
            <div className="onb-foot">
              <button className="btn primary onb-primary" onClick={startStory} disabled={!premise.trim()}>
                この一行で始める
              </button>
              <button className="nm-link" onClick={openSample}>
                サンプルの物語を読む
              </button>
              <button className="nm-link" onClick={() => setStep(1)}>
                書き手を選び直す
              </button>
            </div>
          </>
        )}
      </main>

      {showModelPicker && provider && (
        <ModelPicker
          current={makeModelRef(provider.id, model)}
          onPick={(ref) => {
            const idx = ref.indexOf('::')
            setModel(idx < 0 ? ref : ref.slice(idx + 2))
            setTestResult(null)
            setShowModelPicker(false)
          }}
          onClose={() => setShowModelPicker(false)}
        />
      )}
    </div>
  )
}

/**
 * ブラウザ版からローカルサーバへつなぐときの CORS 案内（P5）。
 * 詳しい手順は `docs/ガイド_ローカルLLMで動かす.md` §11 と同じ内容。
 */
function LocalCorsHelp() {
  return (
    <>
      <p className="set-desc">
        ブラウザから自分の PC のサーバにつなぐには、<strong>サーバ側でこのページからの接続を許可する設定</strong>が要ります。
      </p>
      <HelpDetails summary="許可のしかた（Ollama / LM Studio）">
        <p>
          許可する「接続元」は、いまこのページを開いているアドレスのドメイン部分
          （<code>{typeof location === 'undefined' ? '' : location.origin}</code>）です。
        </p>
        <p>
          <strong>Ollama</strong>: 環境変数 <code>OLLAMA_ORIGINS</code> にこの接続元を入れて Ollama を起動し直します。
          Windows は「システム環境変数の編集」から追加し、タスクトレイの Ollama を終了して起動し直してください。
        </p>
        <p>
          <strong>LM Studio</strong>: Developer / Local Server タブの <code>Enable CORS</code> を ON にして
          Start Server を押し直します（接続元の指定は要りません）。
        </p>
        <p>
          設定してもつながらないときは、ブラウザの開発者ツール（F12）のコンソールに
          <code>Access-Control-Allow-Origin</code> が出ていないか見てください。
          この設定が不要なデスクトップ版に切り替えるのも手です。
        </p>
      </HelpDetails>
    </>
  )
}

/**
 * つながるか試した結果（R5）。
 * `retryHint`（OpenRouter）: 失敗時に「別の推奨モデルを選ぶ」ことを促す。**自動で別のモデルには切り替えない**
 * （P7 A-1。勝手に変わると拒否や文体の変化の理由を利用者が追えない）
 */
function TestResultBox({ result, retryHint = false }: { result: ConnectionTestResult; retryHint?: boolean }) {
  if (result.ok) {
    return <p className="set-result ok">{result.message} これが新しい物語の既定になりました。</p>
  }
  return (
    <p className="set-result bad">
      {result.message}
      {retryHint && (result.kind === 'invalid_model' || result.kind === 'content_filter' || result.kind === 'unknown') && (
        <>
          <br />
          ほかのおすすめのモデルを選んで、もう一度試してください。
        </>
      )}
    </p>
  )
}
