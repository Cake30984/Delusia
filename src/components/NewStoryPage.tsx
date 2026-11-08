import { useState } from 'react'
import { storeActions, useStore } from '../store'
import { goBack, startKickoff, stopKickoff, useIsMobile, useOverlays, type NewStoryWay } from '../lib/nav'
import { useImageUrl } from '../lib/imageStore'
import type { Cassette } from '../types'
import { CommandButton } from './PageHeader'
import { Icon } from './icons'

/** 前提の書き方を見せるための例文（押すと入力欄へ入る） */
const EXAMPLES = ['廃校寸前の高校の写真部', '魔法が禁じられた王都の薬屋', '深夜にだけ開く喫茶店', '辺境の駅の小さな食堂']

const WAYS: { key: NewStoryWay; label: string; short: string; desc: string }[] = [
  { key: 'line', label: '一行から', short: '一行から', desc: '思いつきを書けば、人物と舞台は AI が用意する' },
  { key: 'cassette', label: 'カセットから', short: 'カセット', desc: '用意された設定を選んで始める' },
  { key: 'blank', label: '白紙から', short: '白紙から', desc: '人物・舞台・目標を自分で決める。会話だけ楽しむこともできる' },
]

/**
 * 新しい物語を始める（P9 段6・統合案2 の1つの入口）。一行から＝起案（今までの「一行から始める」の中身）、
 * カセットから＝カセットの棚から選ぶ、白紙から＝物語の設定（ロールプレイはこの中の選択肢）。
 * PC は左に始め方・右に中身、モバイルは上の切り替えと下に固定した主ボタン
 */
export default function NewStoryPage() {
  const mobile = useIsMobile()
  const way = useOverlays((o) => o.newStoryWay)
  const setWay = useOverlays((o) => o.setNewStoryWay)
  const running = useOverlays((o) => o.kickoffPremise)
  const cassetteCount = useStore((st) => st.cassettes.length)
  const storyCount = useStore((st) => st.sessions.length)
  const { setView, openStarterStory } = storeActions()

  const [premise, setPremise] = useState('')
  const [blankMode, setBlankMode] = useState<'story' | 'roleplay'>('story')

  const { createSession } = storeActions()
  const startBlank = () => {
    const id = createSession(blankMode)
    useOverlays.getState().setNewEditorId(id)
  }

  // ---- 中身 ----
  const lineBody = running ? (
    <section className="new-body" aria-label="一行から" aria-busy="true">
      <div className="nm-status" role="status">
        <span className="nm-spinner" aria-hidden="true" />
        人物と舞台を考えています（1〜2分ほど）
      </div>
      <p className="new-premise">{running}</p>
      <p className="review-desc">終わると、世界観・登場人物・書き出しの案が入った物語の設定が開きます。直してから「保存」すると第1章を書きはじめます。ほかの画面へ行っても考え続けます。</p>
      <div>
        <button className="nm-stop" onClick={stopKickoff}>
          <Icon name="square" size={14} /> 止める
        </button>
      </div>
    </section>
  ) : (
    <section className="new-body" aria-label="一行から">
      <div>
        <label className="new-label" htmlFor="new-seed">
          どんな話にしますか
        </label>
        <textarea
          id="new-seed"
          className="new-field"
          rows={mobile ? 4 : 3}
          value={premise}
          placeholder="例: 雨の港町で、記憶をなくした測量士が目を覚ます。手元には誰かの地図が一枚だけ"
          onChange={(e) => setPremise(e.target.value)}
        />
      </div>
      <div>
        <div className="new-label">書き出しの例</div>
        <div className="new-chips">
          {EXAMPLES.slice(0, mobile ? 3 : 4).map((ex) => (
            <button key={ex} className="new-chip" onClick={() => setPremise(ex)}>
              {ex}
            </button>
          ))}
        </div>
      </div>
      {!mobile && (
        <div className="new-go">
          <button className="nm-primary" disabled={!premise.trim()} onClick={() => void startKickoff(premise)}>
            この内容で始める
          </button>
          <span className="review-desc">人物と舞台の案を見てから、第1章を書きはじめます</span>
        </div>
      )}
      {/* 用意した世界観と登場人物ですぐ読める物語（P3）。何度開いても新しい1本を作る */}
      <button className="nm-link new-sample" onClick={() => void openStarterStory()}>
        {storyCount === 0 ? 'まずはサンプルの物語を読んでみる' : 'サンプルの物語を開く'}
      </button>
    </section>
  )

  const cassettes = useStore((st) => st.cassettes)
  const cassetteBody = (
    <section className="new-body" aria-label="カセットから">
      {cassetteCount === 0 ? (
        <p className="review-desc">
          カセットはまだありません。カセットは、世界観・登場人物・書き出しをひとまとめにした物語の始まりです。読んでいる物語の「カセットにする」で作るか、カードの PNG を読み込んでください。
        </p>
      ) : (
        <div className="new-cassettes">
          {cassettes.map((c) => (
            <CassetteRow key={c.id} cas={c} />
          ))}
        </div>
      )}
      <button className="nm-link" onClick={() => setView('cassettes')}>
        カセットの棚を開く（作る・直す・読み込む）
      </button>
    </section>
  )

  const blankBody = (
    <section className="new-body" aria-label="白紙から">
      <div className="new-label">何をしますか</div>
      <div className="new-radios" role="radiogroup" aria-label="白紙からの始め方">
        <button
          role="radio"
          aria-checked={blankMode === 'story'}
          className={'new-way' + (blankMode === 'story' ? ' on' : '')}
          onClick={() => setBlankMode('story')}
        >
          物語を読む
          <small>世界観と登場人物を選び、AI が書く物語を読む</small>
        </button>
        <button
          role="radio"
          aria-checked={blankMode === 'roleplay'}
          className={'new-way' + (blankMode === 'roleplay' ? ' on' : '')}
          onClick={() => setBlankMode('roleplay')}
        >
          キャラクターと会話する
          <small>人物を演じて、キャラクターと言葉を交わす（ロールプレイ）</small>
        </button>
      </div>
      {!mobile && (
        <div className="new-go">
          <button className="nm-primary" onClick={startBlank}>
            設定を開いて始める
          </button>
          <span className="review-desc">登場人物・世界観・前提を決めてから始めます</span>
        </div>
      )}
    </section>
  )

  const body = way === 'line' ? lineBody : way === 'cassette' ? cassetteBody : blankBody

  // モバイルの下に固定する主ボタン（カセットは各行の「始める」で始まるので出さない）
  const mobilePrimary =
    way === 'line' && !running ? (
      <>
        <button className="nm-primary review-confirm" disabled={!premise.trim()} onClick={() => void startKickoff(premise)}>
          この内容で始める
        </button>
        <div className="review-desc center">人物と舞台は AI が用意します</div>
      </>
    ) : way === 'blank' ? (
      <button className="nm-primary review-confirm" onClick={startBlank}>
        設定を開いて始める
      </button>
    ) : null

  if (mobile) {
    return (
      <div className="shell-page new-page mobile">
        <header className="reader-head review-head">
          <button className="icon-btn" onClick={goBack} title="戻る" aria-label="戻る">
            <Icon name="chevron-left" size={20} />
          </button>
          <h1 className="review-head-title">新しい物語を始める</h1>
        </header>
        <div className="panel-seg" role="group" aria-label="始め方">
          {WAYS.map((w) => (
            <button
              key={w.key}
              aria-pressed={way === w.key}
              className={'panel-seg-btn' + (way === w.key ? ' on' : '')}
              onClick={() => setWay(w.key)}
            >
              {w.short}
            </button>
          ))}
        </div>
        <div className="shell-body">{body}</div>
        {mobilePrimary && <div className="review-bottom">{mobilePrimary}</div>}
      </div>
    )
  }

  return (
    <div className="shell-page new-page">
      <header className="reader-head">
        <nav className="reader-crumb" aria-label="現在地">
          <button className="reader-crumb-link" onClick={() => setView('home')}>
            デルシア
          </button>
          <span className="reader-crumb-sep">/</span>
          <span className="reader-crumb-chapter">新しい物語</span>
        </nav>
        <div className="reader-head-end">
          <CommandButton />
        </div>
      </header>
      <div className="shell-body">
        <div className="new-grid">
          <div className="new-ways">
            <h1 className="new-title">新しい物語を始める</h1>
            {WAYS.map((w) => (
              <button
                key={w.key}
                aria-pressed={way === w.key}
                className={'new-way' + (way === w.key ? ' on' : '')}
                onClick={() => setWay(w.key)}
              >
                {w.label}
                <small>{w.desc}</small>
              </button>
            ))}
          </div>
          {body}
        </div>
      </div>
    </div>
  )
}

/** カセット1本（表紙・題・紹介・始める）。作る・直す・書き出す・消すはカセットの棚で */
function CassetteRow({ cas }: { cas: Cassette }) {
  const cover = useImageUrl(cas.coverImageId)
  const { playCassette } = storeActions()
  return (
    <div className="new-cassette">
      <div className="new-cassette-cover">{cover ? <img src={cover} alt="" /> : <Icon name="library-big" size={28} />}</div>
      <div className="new-cassette-body">
        <b>{cas.title || '無題のカセット'}</b>
        <span>{cas.description || '紹介文はありません'}</span>
      </div>
      <button className="home-begin" onClick={() => playCassette(cas.id)}>
        始める
      </button>
    </div>
  )
}
