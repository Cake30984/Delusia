import { useEffect, useRef, useState } from 'react'
import { isLibraryView, storeActions, useStore } from './store'
import ChatPanel from './components/ChatPanel'
import SettingsPage from './components/settings/SettingsPage'
import ColorEditor from './components/settings/ColorEditor'
import HomePage from './components/HomePage'
import NewStoryPage from './components/NewStoryPage'
import LibraryPage from './components/LibraryPage'
import ImageJobsDialog from './components/ImageJobsDialog'
import { StoryPanelPage } from './components/reader/StoryPanel'
import ReviewPage from './components/ReviewPage'
import SessionEditor from './components/SessionEditor'
import FirstRunWizard from './components/FirstRunWizard'
import WebStorageNotice from './components/WebStorageNotice'
import DialogHost from './components/DialogHost'
import CommandPalette, { MenuPage } from './components/CommandPalette'
import { startHistorySync, useIsMobile, useOverlays } from './lib/nav'
import { useGlobalShortcuts } from './lib/shortcuts'
import { isBrowserStorage, sessionsLocationLabel, stateLocationLabel } from './lib/platform'
import { completeOpenRouterOAuthRedirect, pendingOAuthRedirect } from './lib/oauthPkce'
import { defaultOpenRouterProvider, isProviderUsable } from './lib/providers'
import { schemaErrorMessage } from './lib/schema'
import { Icon, type IconName } from './components/icons'
import { customPaletteCssVars, PALETTE_CSS_VARS } from './lib/palette'
import { loadProseFont } from './lib/proseFonts'

// 積層トーストの1件。autoCloseMs があれば一定時間後に自動で onClose を呼ぶ（UI-0）
function ToastItem({
  className,
  text,
  icon,
  onClose,
  autoCloseMs,
  action,
}: {
  className: string
  text: string
  icon?: IconName
  onClose: () => void
  autoCloseMs?: number
  /** 通知から直接できること（例: 画像の候補を選ぶ） */
  action?: { label: string; run: () => void }
}) {
  useEffect(() => {
    if (!autoCloseMs) return
    const t = setTimeout(onClose, autoCloseMs)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCloseMs])

  return (
    <div className={className}>
      <span>
        {icon && <Icon name={icon} size={14} className="toast-icon" />}
        {text}
      </span>
      {action && (
        <button
          onClick={() => {
            action.run()
            onClose()
          }}
        >
          {action.label}
        </button>
      )}
      <button onClick={onClose}>閉じる</button>
    </div>
  )
}

export default function App() {
  // **セッション本体をここで購読しない**（P2b）。購読すると本編生成の1チャンクごとに
  // App ＝レール・サイドバー・本文の全部が描き直される。本文の購読は ChatPanel が持つ
  const activeId = useStore((st) => st.activeId)
  const hasActiveSession = useStore((st) => st.sessions.some((s) => s.id === st.activeId))
  const view = useStore((st) => st.view)
  const providers = useStore((st) => st.providers)
  const error = useStore((st) => st.error)
  // 章のまとめを書き始めた物語（章を閉じるページへ移るきっかけ。P9 段4）
  const reviewStartedFor = useStore((st) => st.reviewProgress?.sessionId ?? null)
  const imageJobToasts = useStore((st) => st.imageJobToasts)
  const infoNotice = useStore((st) => st.infoNotice)
  const schemaError = useStore((st) => st.schemaError)
  const ui = useStore((st) => st.ui)
  const { clearError, dismissImageJobToasts, setInfoNotice, upsertProvider } = storeActions()
  const mobile = useIsMobile()
  // storage は async 化済み（Web は同期 localStorage・Tauri は T3 のファイル backend）。
  // ハイドレーション完了までスプラッシュを表示する。
  const [hydrated, setHydrated] = useState(() => useStore.persist.hasHydrated())
  // R3: providers/imageProviders の apiKey を資格情報ストアから埋め直すまでの間、
  // hasUsableProvider を空キーのまま評価して System へ誤って飛ばさないためのゲート
  // （Web では hydrateProviderSecrets が即resolveするため体感の遅延はない）
  const [secretsReady, setSecretsReady] = useState(false)
  // 画面をまたいで重ねて開くもの（何をしますか・ジョブ・一行から／白紙から作った直後の物語の設定）
  const { paletteOpen, setPaletteOpen, jobsOpen, setJobsOpen, newEditorId, newEditorNotice, setNewEditorId } =
    useOverlays()
  const newEditorSession = useStore((st) =>
    newEditorId ? st.sessions.find((s) => s.id === newEditorId) : undefined,
  )

  // 使える接続先が1つでもあるか。**キーの有無ではなく「使えるか」で見る**
  // ——ローカル接続先（Ollama / LM Studio）はキーを持たないので、キーで数えると
  // 正しく設定できている人に「キーを登録してください」と出てしまう（R5）
  const hasUsableProvider = providers.some(isProviderUsable)

  useEffect(() => {
    if (useStore.persist.hasHydrated()) {
      setHydrated(true)
      return
    }
    return useStore.persist.onFinishHydration(() => setHydrated(true))
  }, [])

  useEffect(() => {
    if (!hydrated) return
    if (schemaError) {
      setSecretsReady(true) // 読めない状態では資格情報同期をしない（本編を描かない画面になる）
      return
    }
    let cancelled = false
    void useStore
      .getState()
      .hydrateProviderSecrets()
      .finally(() => {
        if (!cancelled) setSecretsReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [hydrated, schemaError])

  // 使える接続先が無ければ初回ウィザードを開く（R5）。System 画面への強制遷移はやめた
  // ——ウィザードがその場で接続先を作るところまで面倒を見るため、行き先を奪う必要がない
  const [showFirstRunWizard, setShowFirstRunWizard] = useState(false)

  // P5: Web のブラウザ承認はページごと離れて `?code=` 付きで戻ってくる。**接続先の判定より先に**
  // 鍵を受け取ってしまう（先にウィザードが開くと、承認したのに手入力の画面へ着地する）。
  // 判定が要るのはこの1回だけなので、初期値で「戻りかどうか」を確定させておく
  const [oauthResolved, setOauthResolved] = useState(() => !pendingOAuthRedirect())
  const [oauthReturnKey, setOauthReturnKey] = useState<string | undefined>(undefined)
  const [oauthReturnModel, setOauthReturnModel] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (oauthResolved || !hydrated || !secretsReady) return
    // スキーマを読めなかった時は書き込みが封印されている。受け取っても保存できないので捨てる（R1）
    if (schemaError) {
      setOauthResolved(true)
      return
    }
    void (async () => {
      try {
        const { apiKey, origin, model } = await completeOpenRouterOAuthRedirect()
        const st = useStore.getState()
        const existing = st.providers.find((p) => p.id === 'openrouter')
        upsertProvider(existing ? { ...existing, apiKey } : defaultOpenRouterProvider(apiKey))
        if (origin === 'wizard') {
          setOauthReturnKey(apiKey)
          setOauthReturnModel(model)
          setShowFirstRunWizard(true)
        } else {
          setInfoNotice('OpenRouter にブラウザ承認で接続しました。')
        }
      } catch (e) {
        setInfoNotice(`ブラウザ承認を完了できませんでした：${(e as Error).message}`)
      } finally {
        setOauthResolved(true)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, secretsReady, schemaError, oauthResolved])

  useEffect(() => {
    if (!hydrated || !secretsReady || !oauthResolved) return
    if (!hasUsableProvider) setShowFirstRunWizard(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, secretsReady, oauthResolved])

  // ブラウザ版だけ、保存先の案内を初回に1回だけ出す（P5）。ウィザードと重ねない
  // ——順番は「接続先を決める」が先で、保存先の話はそのあと（下の描画側で待たせる）
  const [showStorageNotice, setShowStorageNotice] = useState(false)
  useEffect(() => {
    if (!hydrated || schemaError || !oauthResolved) return
    if (!isBrowserStorage()) return
    if (useStore.getState().storageNoticeSeen) return
    setShowStorageNotice(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, schemaError, oauthResolved])

  // 初回起動（素材が空）なら既定コンテンツを入れて、サンプルの物語を開いた状態にする（P3）。
  // **一度でも入れたら二度と自動投入しない**（`starterSeeded`）＝消した人へ勝手に戻さない。
  // スキーマを読めなかった時は走らせない（書き込みは封印されている。R1）
  useEffect(() => {
    if (!hydrated || schemaError) return
    const st = useStore.getState()
    if (st.starterSeeded) return
    if (st.characters.length > 0 || st.worlds.length > 0) {
      // 既に自分の素材がある人（この機能より前からの利用者）には入れないが、印だけ立てる
      useStore.setState({ starterSeeded: true })
      return
    }
    st.setActive(st.seedStarterContent())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated])

  // 起動時に木へ対応しない孤児チェックポイント（書込み中断等の残骸）を掃除する（C3）。
  // 画像記録のバックフィル（FB6-A・初回1回）も同じタイミングで裏実行する。
  // スキーマを読めなかった時は走らせない（既定値の state を基準に実データを消しかねないため。R1）
  useEffect(() => {
    if (!hydrated || schemaError) return
    void useStore.getState().cleanupOrphanCheckpoints()
    void useStore.getState().backfillImageLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated])

  // リーダー設定を CSS 変数へ反映（UI-4・F2で数値化）
  useEffect(() => {
    const root = document.documentElement.style
    root.setProperty('--font-size-prose', `${ui.fontSize}px`)
    root.setProperty('--line-height-prose', String(ui.lineHeight))
    root.setProperty('--content-width', `${ui.contentWidth}px`)
    root.setProperty('--speaker-icon-size', `${ui.speakerIconSize}px`)
    // 色分けONは tokens.css の既定（--dialogue）に戻す。OFF のときだけ本文色で上書き（A7）
    if (ui.dialogueTint) root.removeProperty('--dialogue')
    else root.setProperty('--dialogue', 'var(--ink)')
  }, [ui.fontSize, ui.lineHeight, ui.contentWidth, ui.speakerIconSize, ui.dialogueTint])

  // 色・明るさ・本文の書体を <html> の属性へ（P9）。値は tokens.css が属性で当てる。
  // 自分の色だけは --l-*／--d-* を style へ直接入れる（style の方が data-palette の値より強い）
  useEffect(() => {
    const el = document.documentElement
    const custom = ui.customPalettes.find((c) => c.id === ui.palette)
    el.dataset.palette = custom ? 'custom' : ui.palette
    el.dataset.appearance = ui.appearance
    el.dataset.proseFont = ui.proseFont
    loadProseFont(ui.proseFont)
    const vars = custom ? customPaletteCssVars(custom) : {}
    for (const prefix of ['l', 'd']) {
      for (const name of Object.values(PALETTE_CSS_VARS)) {
        const key = `--${prefix}-${name}`
        if (vars[key]) el.style.setProperty(key, vars[key])
        else el.style.removeProperty(key)
      }
    }
  }, [ui.palette, ui.appearance, ui.proseFont, ui.customPalettes])

  // ブラウザの上端の色（theme-color）を背景色に合わせる。「端末に合わせる」は端末の切り替えにも追従する
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => meta.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim())
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [ui.palette, ui.appearance, ui.customPalettes])

  // 画面の行き先とブラウザの履歴をつなぐ（P9 段2）。読み込みと OAuth の戻りの処理が済んでから
  // （OAuth の戻りは URL を書き換えるときに history.state を空にする）
  useEffect(() => {
    if (!hydrated || schemaError || !oauthResolved) return
    return startHistorySync()
  }, [hydrated, schemaError, oauthResolved])

  // 章のまとめを書き始めた瞬間に、章を閉じるページへ移る（読んでいる物語のときだけ）。
  // 移るのは始まった瞬間の1回だけ＝「本文に戻る」で戻ったあとに引き戻さない
  const prevReviewStarted = useRef<string | null>(null)
  useEffect(() => {
    const st = useStore.getState()
    if (reviewStartedFor && !prevReviewStarted.current && reviewStartedFor === st.activeId && st.view === 'sessions') {
      st.setView('review')
    }
    prevReviewStarted.current = reviewStartedFor
  }, [reviewStartedFor])

  // 物語の画面を離れたら、そこで開いていたもの（あらすじ等）を閉じる。メニューのページは物語の続きなので閉じない
  useEffect(() => {
    if (view !== 'sessions' && view !== 'menu' && view !== 'review' && view !== 'panel')
      useOverlays.getState().setReaderModal(null)
  }, [view])

  // モバイルの骨組みにいる間は「何をしますか」を重ねない（メニューのページを使う）
  useEffect(() => {
    if (mobile) setPaletteOpen(false)
    else if (useStore.getState().view === 'menu') useStore.getState().setView('home')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobile])

  // グローバルショートカット（UI-7）: Ctrl+K/1/2/3/G/.。没入モードの Ctrl+. トグルもここに集約（旧 UI-4 実装を移管）
  useGlobalShortcuts()

  if (!hydrated || !secretsReady) {
    return (
      <div className="app solo">
        <div className="main">
          <div className="empty">
            <p>読み込み中…</p>
          </div>
        </div>
      </div>
    )
  }

  // 保存データを読めなかった場合（R1）。本編を描かず、上書きしていないことと退避手順だけを伝える。
  // 「無視して続ける」は置かない（続けた先の保存が全部封印されているため、できることが無い）
  if (schemaError) {
    return (
      <div className="app solo">
        <div className="main">
          <div className="empty">
            <div className="schema-block">
              <h2>このデータはこのバージョンでは読めません</h2>
              <p>{schemaErrorMessage(schemaError)}</p>
              <p>
                保存されているデータは<strong>書き換えていません</strong>。このまま本体を新しいバージョンへ
                更新すると、そのまま読み込めます。
              </p>
              <p>
                更新の前に、次の2か所をコピーしてバックアップを取ってください（設定と、物語の本体）。
                <br />
                <code>{stateLocationLabel()}</code>
                <br />
                <code>{sessionsLocationLabel()}</code>
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const reading = view === 'sessions' && !!activeId && hasActiveSession

  return (
    <div
      className={
        'app' +
        (mobile ? ' mobile' : ' desktop') +
        // 没入は物語の画面でのみ有効（他の画面で効くと戻れなくなる。F0/A6）
        (ui.immersive && reading ? ' immersive' : '')
      }
    >
      {reading && activeId ? (
        <ChatPanel key={activeId} sessionId={activeId} />
      ) : view === 'panel' && mobile && activeId && hasActiveSession ? (
        <StoryPanelPage />
      ) : view === 'panel' && activeId && hasActiveSession ? (
        // PC へ幅が広がったらパネルは物語の画面の右に出す（行き先はそのまま）
        <ChatPanel key={activeId} sessionId={activeId} />
      ) : view === 'review' && activeId && hasActiveSession ? (
        <ReviewPage />
      ) : view === 'new' ? (
        <NewStoryPage />
      ) : isLibraryView(view) ? (
        <LibraryPage view={view} />
      ) : view === 'system' ? (
        <SettingsPage />
      ) : view === 'color' ? (
        <ColorEditor />
      ) : view === 'menu' && mobile ? (
        <MenuPage />
      ) : (
        // ホーム（行き先が home のときと、開く物語が無いとき）
        <HomePage />
      )}



      {showFirstRunWizard && (
        <FirstRunWizard
          oauthReturnKey={oauthReturnKey}
          oauthReturnModel={oauthReturnModel}
          onClose={() => {
            setShowFirstRunWizard(false)
            setOauthReturnKey(undefined)
          }}
        />
      )}

      {/* ウィザードが出ている間は待たせる（モーダルを2枚重ねない） */}
      {showStorageNotice && !showFirstRunWizard && (
        <WebStorageNotice onClose={() => setShowStorageNotice(false)} />
      )}

      {newEditorSession && (
        <SessionEditor session={newEditorSession} notice={newEditorNotice || undefined} onClose={() => setNewEditorId(null)} />
      )}

      {paletteOpen && !mobile && <CommandPalette onClose={() => setPaletteOpen(false)} />}

      {jobsOpen && <ImageJobsDialog onClose={() => setJobsOpen(false)} />}

      <DialogHost />

      <div className="toast-stack">
        {error && <ToastItem className="toast" text={error} onClose={clearError} />}

        {infoNotice && (
          <ToastItem
            className="toast info"
            text={infoNotice}
            onClose={() => setInfoNotice(null)}
            autoCloseMs={4000}
          />
        )}

        {imageJobToasts.length > 0 && (
          <ToastItem
            className="toast image"
            icon="image"
            text={`できました: ${imageJobToasts.map((t) => t.label).join(' / ')}`}
            onClose={dismissImageJobToasts}
            autoCloseMs={8000}
            action={{ label: '選ぶ', run: () => setJobsOpen(true) }}
          />
        )}
      </div>
    </div>
  )
}
