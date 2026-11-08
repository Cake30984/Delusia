import { memo, useEffect, useRef, useState } from 'react'
import { storeActions, useSessionExceptBody, useStore } from '../../store'
import { closeStoryPanel, goBackThen, useOverlays, type IllustrateRequest } from '../../lib/nav'
import type { DockTab } from '../../types'
import StatusView from '../StatusView'
import DiscoveryView from '../DiscoveryView'
import StatusPanel from '../StatusPanel'
import DiscoveryPanel, { type DiscoveryScope } from '../DiscoveryPanel'
import { GalleryBody } from '../GalleryModal'
import { BranchTreeBody } from '../BranchTreeModal'
import { Icon } from '../icons'

const TABS: { key: DockTab; label: string; short: string }[] = [
  { key: 'status', label: '状況', short: '状況' },
  { key: 'branch', label: '分岐としおり', short: '分岐' },
  { key: 'gallery', label: '挿絵', short: '挿絵' },
]

const PANEL_MIN = 300
const PANEL_MAX = 560

/**
 * パネルの中身（3タブ）。状況＝いまの状況＋分かったこと（統合案3）、分岐としおり、挿絵。
 * 中身の部品は今のまま使い回す。**本文（messages）を読まない**＝書いている最中に描き直さない（P2b）
 */
function PanelBody({ sessionId, tab, mobile }: { sessionId: string; tab: DockTab; mobile: boolean }) {
  // 本文以外に変化が無い間は同じ参照（`useSessionExceptBody`）。分岐・挿絵の「本文へ」は messages を使うので
  // そのタブだけは本体を読む（タブを開いている間だけ・書いている最中の描き直しは許す）
  const lite = useSessionExceptBody(sessionId)
  const full = useStore((st) => (tab === 'status' ? undefined : st.sessions.find((s) => s.id === sessionId)))
  const session = tab === 'status' ? lite : full
  const [editStatus, setEditStatus] = useState(false)
  const [discoveryScope, setDiscoveryScope] = useState<DiscoveryScope | null>(null)
  if (!session) return null

  // 挿絵の画面は物語の画面が開く（本文の文脈はそこで組み立てる）。モバイルはページを閉じてから
  const illustrate = (req: IllustrateRequest) => {
    if (mobile) goBackThen(() => useOverlays.getState().setIllustrateRequest(req))
    else useOverlays.getState().setIllustrateRequest(req)
  }

  return (
    <>
      {tab === 'status' && (
        <div className="panel-sections">
          <section>
            <div className="panel-h2-row">
              <h2 className="panel-h2">いまの状況</h2>
              <button className="nm-link" onClick={() => setEditStatus(true)}>
                直す
              </button>
            </div>
            <StatusView session={session} />
          </section>
          <section>
            <div className="panel-h2-row">
              <h2 className="panel-h2">分かったこと</h2>
            </div>
            <DiscoveryView session={session} onEdit={(scope) => setDiscoveryScope(scope)} />
          </section>
        </div>
      )}
      {tab === 'branch' && <BranchTreeBody session={session} />}
      {tab === 'gallery' && (
        <>
          {session.currentSceneId && (
            <div className="panel-actions">
              <button className="btn" onClick={() => illustrate({ sceneId: session.currentSceneId! })}>
                <Icon name="palette" size={14} /> この場面の挿絵を描く
              </button>
            </div>
          )}
          <GalleryBody
            session={session}
            onRegenerateIllustration={(sceneId, messageId, prompt, negative) =>
              illustrate({ sceneId, messageId, regenPrompt: prompt, regenNegative: negative })
            }
          />
        </>
      )}
      {editStatus && <StatusPanelFor sessionId={sessionId} onClose={() => setEditStatus(false)} />}
      {discoveryScope && (
        <DiscoveryPanelFor sessionId={sessionId} scope={discoveryScope} onClose={() => setDiscoveryScope(null)} />
      )}
    </>
  )
}

/** 編集の画面はセッション全体を受け取るので、開いている間だけ本体を購読する */
function StatusPanelFor({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const session = useStore((st) => st.sessions.find((s) => s.id === sessionId))
  return session ? <StatusPanel session={session} onClose={onClose} /> : null
}
function DiscoveryPanelFor({
  sessionId,
  scope,
  onClose,
}: {
  sessionId: string
  scope: DiscoveryScope
  onClose: () => void
}) {
  const session = useStore((st) => st.sessions.find((s) => s.id === sessionId))
  return session ? <DiscoveryPanel session={session} scope={scope} onClose={onClose} /> : null
}

function Tabs({ tab, mobile }: { tab: DockTab; mobile: boolean }) {
  const { setUiPrefs } = storeActions()
  return (
    <div className={mobile ? 'panel-seg' : 'panel-tabs'} role="tablist" aria-label="パネルの中身">
      {TABS.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={tab === t.key}
          className={(mobile ? 'panel-seg-btn' : 'panel-tab') + (tab === t.key ? ' on' : '')}
          onClick={() => setUiPrefs({ dockTab: t.key })}
        >
          {mobile ? t.short : t.label}
        </button>
      ))}
    </div>
  )
}

/**
 * PC: 物語の画面の右から重ねて開くパネル（P9 段5）。左端をつかんで幅を変えられる
 */
function StoryPanel({ sessionId }: { sessionId: string }) {
  const tab = useStore((st) => st.ui.dockTab)
  const width = useStore((st) => st.ui.dockWidth)
  const { setUiPrefs } = storeActions()
  const ref = useRef<HTMLDivElement>(null)

  // 左端のつまみで幅を変える（右に置くのでポインタが左へ動くほど広がる。F1/A9）
  const onResizeDown = (e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = ref.current?.offsetWidth ?? width
    document.body.style.userSelect = 'none'
    const onMove = (ev: MouseEvent) => {
      const w = Math.min(PANEL_MAX, Math.max(PANEL_MIN, startW + (startX - ev.clientX)))
      if (ref.current) ref.current.style.width = w + 'px'
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.userSelect = ''
      const w = ref.current?.offsetWidth ?? width
      setUiPrefs({ dockWidth: Math.min(PANEL_MAX, Math.max(PANEL_MIN, w)) })
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  if (!tab) return null
  return (
    <aside className="story-panel" ref={ref} style={{ width }} aria-label="状況・分岐・挿絵">
      <div className="story-panel-resizer" onMouseDown={onResizeDown} title="ドラッグで幅を変える" />
      <div className="story-panel-head">
        <Tabs tab={tab} mobile={false} />
        <button className="icon-btn" onClick={closeStoryPanel} title="パネルを閉じる" aria-label="パネルを閉じる">
          <Icon name="x" />
        </button>
      </div>
      <div className="story-panel-body">
        <PanelBody sessionId={sessionId} tab={tab} mobile={false} />
      </div>
    </aside>
  )
}

export default memo(StoryPanel)

/**
 * モバイル: 状況・分岐・挿絵の1枚のページ（行き先 panel）。戻るで本文へ。
 * 分岐から前の地点へ戻ったり、挿絵から本文へ飛んだりしたら（scrollTarget が立ったら）本文へ戻る
 */
export function StoryPanelPage() {
  const sessionId = useStore((st) => st.activeId)
  const tab = useStore((st) => st.ui.dockTab) ?? 'status'
  const title = useStore((st) => st.sessions.find((s) => s.id === st.activeId)?.title || '無題の物語')
  const chapter = useStore((st) => {
    const s = st.sessions.find((x) => x.id === st.activeId)
    const i = s ? s.scenes.findIndex((sc) => sc.id === s.currentSceneId) : -1
    return i >= 0 ? `第${i + 1}章` : ''
  })
  const jumping = useStore((st) => !!st.scrollTarget && st.scrollTarget.sessionId === st.activeId)

  useEffect(() => {
    if (jumping) closeStoryPanel()
  }, [jumping])

  if (!sessionId) return null
  return (
    <div className="story-panel-page">
      <header className="reader-head review-head">
        <button className="icon-btn" onClick={closeStoryPanel} title="本文に戻る" aria-label="本文に戻る">
          <Icon name="chevron-left" size={20} />
        </button>
        <div className="reader-crumb mobile">
          <span className="reader-crumb-title">{title}</span>
          {chapter && <span className="reader-crumb-sep">·</span>}
          {chapter && <span>{chapter}</span>}
        </div>
      </header>
      <Tabs tab={tab} mobile />
      <div className="story-panel-body page">
        <PanelBody sessionId={sessionId} tab={tab} mobile />
      </div>
    </div>
  )
}
