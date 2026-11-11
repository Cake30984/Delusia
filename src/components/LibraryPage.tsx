import { useState } from 'react'
import { storeActions, useStore, type View } from '../store'
import { goBack, useIsMobile } from '../lib/nav'
import CharacterLibrary from './library/CharacterLibrary'
import WorldLibrary from './library/WorldLibrary'
import CassetteLibrary from './library/CassetteLibrary'
import { CommandButton } from './PageHeader'
import ActivityIndicator from './ActivityIndicator'
import { Icon } from './icons'

type LibraryView = 'characters' | 'worlds' | 'cassettes'

const TABS: { key: LibraryView; label: string; create: string }[] = [
  { key: 'characters', label: 'キャラクター', create: 'キャラクターを作る' },
  { key: 'worlds', label: '世界観', create: '世界観を作る' },
  { key: 'cassettes', label: 'カセット', create: 'カセットを作る' },
]

/**
 * キャラクターと世界観（P9 段7・統合案6 で第一階層から1段下げた素材のページ）。
 * タブはキャラクター・世界観・カセットの3つで、タブも行き先の1つ（戻るでタブも戻る）。
 * PC は 一覧＋その場で直す編集 の2列、モバイルは一覧と1枚の編集（見る・少し直すまで）
 */
export default function LibraryPage({ view }: { view: LibraryView }) {
  const mobile = useIsMobile()
  const counts = {
    characters: useStore((st) => st.characters.length),
    worlds: useStore((st) => st.worlds.length),
    cassettes: useStore((st) => st.cassettes.length),
  }
  const { setView, seedStarterContent, setInfoNotice } = storeActions()
  // 「＋作る」を押した回数。タブの中身がこれの増加を見て新しいものを開く
  const [createSeq, setCreateSeq] = useState(0)
  const tab = TABS.find((t) => t.key === view)!

  const reseed = () => {
    seedStarterContent()
    setInfoNotice('サンプルの世界観・登場人物と、サンプルの物語を1本追加しました。')
  }

  const createButton = (
    <button className={mobile ? 'lib-create mobile' : 'lib-create'} onClick={() => setCreateSeq((n) => n + 1)}>
      <Icon name="plus" size={14} /> {tab.create}
    </button>
  )

  const tabs = mobile ? (
    <div className="panel-seg" role="tablist" aria-label="素材の種類">
      {TABS.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={view === t.key}
          className={'panel-seg-btn' + (view === t.key ? ' on' : '')}
          onClick={() => setView(t.key as View)}
        >
          {t.label}
        </button>
      ))}
    </div>
  ) : (
    <div className="lib-tabs-row">
      <div role="tablist" aria-label="素材の種類" className="panel-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={view === t.key}
            className={'panel-tab' + (view === t.key ? ' on' : '')}
            onClick={() => setView(t.key as View)}
          >
            {t.label}　{counts[t.key]}
          </button>
        ))}
      </div>
      {createButton}
    </div>
  )

  const body =
    view === 'characters' ? (
      <CharacterLibrary createSeq={createSeq} />
    ) : view === 'worlds' ? (
      <WorldLibrary createSeq={createSeq} />
    ) : (
      <CassetteLibrary createSeq={createSeq} />
    )

  return (
    <div className={'shell-page lib-page' + (mobile ? ' mobile' : '')}>
      {mobile ? (
        <header className="reader-head review-head">
          <button className="icon-btn" onClick={goBack} title="戻る" aria-label="戻る">
            <Icon name="chevron-left" size={20} />
          </button>
          <h1 className="review-head-title">キャラクターと世界観</h1>
        </header>
      ) : (
        <header className="reader-head">
          <nav className="reader-crumb" aria-label="現在地">
            <button className="reader-crumb-link" onClick={() => setView('home')}>
              デルシア
            </button>
            <span className="reader-crumb-sep">/</span>
            <span className="reader-crumb-chapter">キャラクターと世界観</span>
          </nav>
          <div className="reader-head-end">
            <ActivityIndicator />
            {/* 消してしまった人向けの入れ直し（P3）。素材は固定 id へ上書きするので増えない */}
            <button className="nm-link" onClick={reseed} title="サンプルの世界観・登場人物を入れ直し、サンプルの物語を1本作ります">
              サンプルを追加し直す
            </button>
            <CommandButton />
          </div>
        </header>
      )}
      {tabs}
      <div className="lib-body">{body}</div>
      {mobile && <div className="review-bottom">{createButton}</div>}
    </div>
  )
}
