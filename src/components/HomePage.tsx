import { storeActions, useStore } from '../store'
import { isProviderUsable } from '../lib/providers'
import PageHeader from './PageHeader'
import StoryList from './StoryList'
import { Icon } from './icons'

/**
 * ホーム（P9 段2 の仮の形）。続きから・新しい物語を始める・ほかの物語。
 * 見た目と中身の作り直し（一行で始める欄など）は段6
 */
export default function HomePage() {
  // プリミティブだけを購読する（オブジェクトを返すと毎回別物になり描き直しが止まらない）
  const lastId = useStore((st) => (st.sessions.some((x) => x.id === st.activeId) ? st.activeId : null))
  const lastTitle = useStore((st) => st.sessions.find((x) => x.id === st.activeId)?.title ?? '')
  const last = lastId ? { id: lastId, title: lastTitle } : null
  const hasSessions = useStore((st) => st.sessions.length > 0)
  const hasUsableProvider = useStore((st) => st.providers.some(isProviderUsable))
  const { setActive, setView } = storeActions()

  return (
    <div className="shell-page">
      <PageHeader title="デルシア" />
      <div className="shell-body">
        <div className="page-narrow home">
          {!hasUsableProvider && (
            <div className="home-notice">
              <p>AI の接続先がまだありません。OpenRouter 等の API キーか、Ollama / LM Studio のようなローカルのサーバを登録してください。</p>
              <button className="btn" onClick={() => setView('system')}>
                <Icon name="settings" size={14} /> 接続先を設定する
              </button>
            </div>
          )}

          <div className="home-actions">
            {last && (
              <button className="home-card primary" onClick={() => setActive(last.id)}>
                <span className="home-card-label">続きから</span>
                <span className="home-card-title">{last.title || '無題'}</span>
              </button>
            )}
            <button className="home-card" onClick={() => setView('new')}>
              <span className="home-card-label">
                <Icon name="plus" size={14} /> 新しい物語を始める
              </span>
              <span className="home-card-sub">一行から・カセットから・白紙から</span>
            </button>
          </div>

          {hasSessions && (
            <>
              <h2 className="home-section-title">物語</h2>
              <StoryList />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
