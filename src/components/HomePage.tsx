import { useState } from 'react'
import { storeActions, useStore } from '../store'
import { isProviderUsable } from '../lib/providers'
import { isMarkerContent } from '../lib/prompts'
import { startKickoff, useIsMobile, useOverlays, type NewStoryWay, openSettings } from '../lib/nav'
import PageHeader from './PageHeader'
import StoryList from './StoryList'
import { Icon } from './icons'

/** 「続きから」の最後に触った時刻（今日なら時刻だけ） */
function whenLabel(t: number): string {
  const d = new Date(t)
  const now = new Date()
  const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  if (d.toDateString() === now.toDateString()) return `今日 ${hm} まで`
  const y = new Date(now)
  y.setDate(now.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return `きのう ${hm} まで`
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hm} まで`
}

/**
 * ホーム（P9 段6）。続きから・新しい物語を始める（一行で書いてそのまま起案）・ほかの物語。
 * 物語を切り替えるのは「ほかの物語」から（「何をしますか」にも同じ一覧がある）
 */
export default function HomePage() {
  const mobile = useIsMobile()
  // プリミティブだけを購読する（オブジェクトを返すと毎回別物になり描き直しが止まらない）
  const lastId = useStore((st) => (st.sessions.some((x) => x.id === st.activeId) ? st.activeId : null))
  const lastTitle = useStore((st) => st.sessions.find((x) => x.id === st.activeId)?.title ?? '')
  const lastUpdated = useStore((st) => st.sessions.find((x) => x.id === st.activeId)?.updatedAt ?? 0)
  const lastChapter = useStore((st) => {
    const s = st.sessions.find((x) => x.id === st.activeId)
    if (!s) return ''
    if (s.ending) return '完結'
    const i = s.scenes.findIndex((sc) => sc.id === s.currentSceneId)
    return i >= 0 ? `第${i + 1}章　${s.scenes[i].title || ''}`.trim() : ''
  })
  // 最後の本文の終わりの一節（どこまで読んだかを思い出すため）
  const lastExcerpt = useStore((st) => {
    const s = st.sessions.find((x) => x.id === st.activeId)
    if (!s) return ''
    for (let i = s.messages.length - 1; i >= 0; i--) {
      const m = s.messages[i]
      if (m.role === 'assistant' && m.content.trim() && !isMarkerContent(m.content)) {
        const t = m.content.replace(/\s+/g, ' ').trim()
        return t.length > 90 ? '…' + t.slice(-90) : t
      }
    }
    return ''
  })
  const storyCount = useStore((st) => st.sessions.length)
  const hasUsableProvider = useStore((st) => st.providers.some(isProviderUsable))
  const kickoffRunning = useOverlays((o) => o.kickoffPremise !== null)
  const { setActive, setView, openStarterStory } = storeActions()
  const [premise, setPremise] = useState('')

  const goNew = (way: NewStoryWay) => {
    useOverlays.getState().setNewStoryWay(way)
    setView('new')
  }
  const begin = () => {
    if (!premise.trim()) {
      goNew('line')
      return
    }
    // 起案は新しい物語のページで進み具合を見せる（終われば物語の設定が開く）
    useOverlays.getState().setNewStoryWay('line')
    void startKickoff(premise)
    setPremise('')
    setView('new')
  }

  const otherCount = storyCount - (lastId ? 1 : 0)

  return (
    <div className="shell-page">
      <PageHeader title="デルシア" />
      <div className="shell-body">
        <div className="home">
          {!hasUsableProvider && (
            <div className="home-notice">
              <p>AI の接続先がまだありません。OpenRouter 等の API キーか、Ollama / LM Studio のようなローカルのサーバを登録してください。</p>
              <button className="btn" onClick={() => openSettings('writer')}>
                <Icon name="settings" size={14} /> 接続先を設定する
              </button>
            </div>
          )}

          {lastId && (
            <section aria-label="続きから">
              {!mobile && <div className="home-label">続きから</div>}
              <div className="home-continue">
                {mobile && <div className="home-label inline">続きから　{lastChapter}</div>}
                <div className="home-continue-head">
                  <h1 className="home-continue-title">{lastTitle || '無題の物語'}</h1>
                  {!mobile && lastChapter && <span className="home-continue-chapter">{lastChapter}</span>}
                </div>
                {lastExcerpt && <p className="home-excerpt">{lastExcerpt}</p>}
                <div className="home-continue-foot">
                  <button className="nm-primary" onClick={() => setActive(lastId)}>
                    続きを読む
                  </button>
                  {!mobile && lastUpdated > 0 && <span className="home-when">{whenLabel(lastUpdated)}</span>}
                </div>
              </div>
            </section>
          )}

          <section aria-label="新しい物語を始める">
            <label className="home-label" htmlFor="home-oneline">
              新しい物語を始める
            </label>
            <div className={'home-oneline' + (mobile ? ' mobile' : '')}>
              <input
                id="home-oneline"
                type="text"
                value={premise}
                disabled={kickoffRunning}
                placeholder={
                  kickoffRunning
                    ? '人物と舞台を考えています…'
                    : mobile
                      ? '一行で書く'
                      : '一行で書く（例: 雨の港町で、記憶をなくした測量士が目を覚ます）'
                }
                onChange={(e) => setPremise(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) begin()
                }}
              />
              {!mobile && (
                <button className="home-begin" onClick={begin} disabled={kickoffRunning}>
                  始める
                </button>
              )}
            </div>
            <div className="home-ways">
              {mobile ? (
                <>
                  <button className="nm-link" onClick={() => goNew('line')}>
                    ほかの始め方
                  </button>
                  <button className="home-begin" onClick={begin} disabled={kickoffRunning}>
                    始める
                  </button>
                </>
              ) : (
                <>
                  <button className="nm-link" onClick={() => goNew('cassette')}>
                    カセットから選ぶ
                  </button>
                  <button className="nm-link" onClick={() => goNew('blank')}>
                    白紙から設定する
                  </button>
                  {storyCount === 0 && (
                    <button className="nm-link" onClick={() => void openStarterStory()}>
                      サンプルの物語を開く
                    </button>
                  )}
                </>
              )}
            </div>
          </section>

          {otherCount > 0 && (
            <section aria-label="ほかの物語">
              <div className="home-label">ほかの物語</div>
              <StoryList excludeId={lastId} />
            </section>
          )}

          {!mobile && (
            <footer className="home-foot">
              <button className="nm-link" onClick={() => setView('characters')}>
                キャラクターと世界観
              </button>
              <button className="nm-link" onClick={() => setView('system')}>
                表示と設定
              </button>
            </footer>
          )}
        </div>
      </div>
    </div>
  )
}
