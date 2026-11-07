import { storeActions, type View } from '../store'
import PageHeader from './PageHeader'
import CharacterLibrary from './library/CharacterLibrary'
import WorldLibrary from './library/WorldLibrary'
import CassetteLibrary from './library/CassetteLibrary'
import { Icon, type IconName } from './icons'

type LibraryView = 'characters' | 'worlds' | 'cassettes'

const TABS: { key: LibraryView; label: string; icon: IconName }[] = [
  { key: 'characters', label: 'キャラクター', icon: 'users' },
  { key: 'worlds', label: '世界観', icon: 'globe' },
  { key: 'cassettes', label: 'カセット', icon: 'library-big' },
]

/**
 * 素材（キャラクター・世界観・カセット）の3タブ（P9 段2）。タブも行き先の1つなので、戻るでタブも戻る。
 * 中身（一覧と編集）は今の画面のまま。2列の一覧＋編集への作り直しは段7
 */
export default function LibraryPage({ view }: { view: LibraryView }) {
  const { setView, seedStarterContent, setInfoNotice } = storeActions()
  return (
    <div className="shell-page">
      <PageHeader title="キャラクターと世界観">
        {/* 消してしまった人向けの入れ直し（P3）。素材は固定 id へ上書きするので増えない */}
        <button
          className="btn"
          onClick={() => {
            seedStarterContent()
            setInfoNotice('サンプルの世界観・登場人物と、サンプルの物語を1本追加しました。')
          }}
          title="サンプルの世界観・登場人物を入れ直し、サンプルの物語を1本作ります"
        >
          <Icon name="sparkles" size={13} /> サンプルを追加し直す
        </button>
      </PageHeader>
      <nav className="shell-tabs" aria-label="素材の種類">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={'shell-tab' + (view === t.key ? ' on' : '')}
            aria-current={view === t.key ? 'page' : undefined}
            onClick={() => setView(t.key as View)}
          >
            <Icon name={t.icon} size={15} /> {t.label}
          </button>
        ))}
      </nav>
      {view === 'characters' ? <CharacterLibrary /> : view === 'worlds' ? <WorldLibrary /> : <CassetteLibrary />}
    </div>
  )
}
