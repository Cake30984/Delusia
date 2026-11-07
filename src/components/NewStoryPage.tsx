import { storeActions } from '../store'
import { useOverlays } from '../lib/nav'
import PageHeader from './PageHeader'
import { Icon, type IconName } from './icons'

/**
 * 新しい物語を始める（統合案2 の1つの入口。P9 段2 の仮の形）。
 * 一行から＝起案、カセットから＝カセットの棚、白紙から＝物語の設定（ロールプレイはこの中の選択肢）。
 * それぞれの中身をこのページへ取り込むのは段6
 */
export default function NewStoryPage() {
  const { createSession, setView, openStarterStory } = storeActions()
  const { setKickoffOpen, setNewEditorId } = useOverlays()

  const options: { icon: IconName; title: string; sub: string; run: () => void }[] = [
    {
      icon: 'sparkles',
      title: '一行から',
      sub: '一行の前提から、世界観・登場人物・導入を AI が考えます',
      run: () => setKickoffOpen(true),
    },
    {
      icon: 'library-big',
      title: 'カセットから',
      sub: '用意された物語の始まり（カセット）を選んで遊びます',
      run: () => setView('cassettes'),
    },
    {
      icon: 'book-open',
      title: '白紙から物語を作る',
      sub: '世界観と登場人物を自分で選んで始めます',
      run: () => setNewEditorId(createSession('story')),
    },
    {
      icon: 'message-circle',
      title: '白紙からロールプレイを始める',
      sub: 'キャラクターと会話します',
      run: () => setNewEditorId(createSession('roleplay')),
    },
    {
      icon: 'play',
      title: 'サンプルの物語を開く',
      sub: '用意した世界観と登場人物で、すぐに読み始められます',
      run: () => void openStarterStory(),
    },
  ]

  return (
    <div className="shell-page">
      <PageHeader title="新しい物語を始める" />
      <div className="shell-body">
        <div className="page-narrow">
          <div className="new-story-options">
            {options.map((o) => (
              <button key={o.title} className="home-card" onClick={o.run}>
                <span className="home-card-label">
                  <Icon name={o.icon} size={16} /> {o.title}
                </span>
                <span className="home-card-sub">{o.sub}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
