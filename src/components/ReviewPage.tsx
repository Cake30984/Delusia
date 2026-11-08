import { useEffect, useState } from 'react'
import { storeActions, useStore, type ReviewCallProgress, type ReviewCallStatus } from '../store'
import { appConfirm } from '../lib/dialogs'
import { goBack, goBackThen, useIsMobile, useOverlays } from '../lib/nav'
import type { DiscoveredCharacter, NextSceneSuggestion, RelationUpdate, SceneReview, WorldGrowth } from '../types'
import CsvInput from './CsvInput'
import { CommandButton } from './PageHeader'
import { Icon } from './icons'

/** 編集用 draft はストアの review から分離した深コピー（編集途中で元を汚さない。FB5-C） */
const cloneReview = (r: SceneReview): SceneReview => JSON.parse(JSON.stringify(r))

/** 配列の i 番目だけを部分更新した新配列を返す */
const mapAt = <T,>(arr: T[], i: number, patch: Partial<T>): T[] => arr.map((x, j) => (j === i ? { ...x, ...patch } : x))

const CALL_STATUS_LABEL: Record<ReviewCallStatus, string> = {
  waiting: '応答を待っています',
  streaming: '書いています',
  done: '終わりました',
  failed: '失敗しました',
}

/**
 * 章を閉じる（P9 段4・統合案4）。モーダルをやめて1枚のページにした。PC は2列（左に振り返り・右に次の章）、
 * モバイルは1列（次の章の案は横に並べ、「この内容で次の章へ」を下に固定）。
 * AI の案は全部選ばれた状態で開き、直したい所だけ触って「この内容で次の章へ」で確定する
 * （新しい人物のキャラクター化だけは既定で外す＝確定のたびに起案の画面が次々に開かないように）。
 *
 * 「本文に戻る」（戻る操作）はまとめを捨てない。本文の末尾の「次の一手」から開き直せる。
 * まとめが無くなったら（確定・止める・失敗）ひとつ前の画面へ自動で戻る。
 */
export default function ReviewPage() {
  const activeId = useStore((st) => st.activeId)
  const hasReview = useStore((st) => st.sceneReview?.sessionId === st.activeId)
  const hasProgress = useStore((st) => st.reviewProgress?.sessionId === st.activeId)

  // 出すものが無い（確定した・止めた・失敗した・別の物語）ならひとつ前へ
  useEffect(() => {
    if (!hasReview && !hasProgress) goBack()
  }, [hasReview, hasProgress, activeId])

  if (hasReview) return <ReviewBody />
  if (hasProgress) return <ReviewProgressView />
  return null
}

/** 上端。PC は現在地（デルシア / 物語 / 第N章を閉じる）、モバイルは戻ると題 */
function ReviewHeader({ chapterLabel }: { chapterLabel: string }) {
  const mobile = useIsMobile()
  const title = useStore((st) => st.sessions.find((s) => s.id === st.activeId)?.title || '無題の物語')
  const { setView } = storeActions()
  if (mobile) {
    return (
      <header className="reader-head review-head">
        <button className="icon-btn" onClick={goBack} title="本文に戻る" aria-label="本文に戻る">
          <Icon name="chevron-left" size={20} />
        </button>
        <h1 className="review-head-title">{chapterLabel}を閉じる</h1>
      </header>
    )
  }
  return (
    <header className="reader-head">
      <nav className="reader-crumb" aria-label="現在地">
        <button className="reader-crumb-link" onClick={() => setView('home')}>
          デルシア
        </button>
        <span className="reader-crumb-sep">/</span>
        <button className="reader-crumb-link" onClick={goBack} title="本文に戻る">
          {title}
        </button>
        <span className="reader-crumb-sep">/</span>
        <span className="reader-crumb-chapter">{chapterLabel}を閉じる</span>
      </nav>
      <div className="reader-head-end">
        <CommandButton />
      </div>
    </header>
  )
}

/** 対象の章の「第N章」と題 */
function useChapter(sceneId: string | undefined) {
  // プリミティブだけを購読する（オブジェクトを返すと毎回別物になり描き直しが止まらない）
  const index = useStore((st) => {
    const s = st.sessions.find((x) => x.id === st.activeId)
    return s && sceneId ? s.scenes.findIndex((sc) => sc.id === sceneId) : -1
  })
  const title = useStore((st) => {
    const s = st.sessions.find((x) => x.id === st.activeId)
    return (s && sceneId && s.scenes.find((sc) => sc.id === sceneId)?.title) || ''
  })
  return index >= 0 ? { label: `第${index + 1}章`, title: title || '無題の章' } : { label: 'この章', title: '' }
}

/**
 * まとめを書いている間（PC-A A-1）。あらすじが流れ込み、呼び出し1本＝1行で進み具合を出す
 * （2本に分けている時は2行が同時に伸びる＝並列に走っていることが見える）。止めることだけできる
 */
function ReviewProgressView() {
  const progress = useStore((st) => st.reviewProgress)!
  const stopReview = useStore((st) => st.stopReview)
  const chapter = useChapter(progress.sceneId)
  const mobile = useIsMobile()
  const running = progress.calls.filter((c) => c.status === 'waiting' || c.status === 'streaming').length

  const calls = (
    <div className="review-calls">
      {progress.calls.map((c: ReviewCallProgress) => (
        <div key={c.key} className={'review-call ' + c.status}>
          <span className="review-call-dot" />
          <span className="review-call-label">{c.label}</span>
          <span className="review-call-status">
            {CALL_STATUS_LABEL[c.status]}
            {c.status === 'streaming' && `　${c.chars.toLocaleString()}字`}
            {/* 再試行は理由も一緒に出す（原因が分からないまま回数だけ見えるのを避ける） */}
            {c.attempt > 1 && c.status !== 'done' && (
              <span className="review-call-note">
                再試行{c.attempt}回目{c.note ? `：${c.note}` : ''}
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  )

  return (
    <div className={'review-page' + (mobile ? ' mobile' : ' desktop')}>
      <ReviewHeader chapterLabel={chapter.label} />
      <div className="review-scroll">
        <div className="review-grid">
          <main className="review-main">
            <ChapterTitle label={chapter.label} title={chapter.title} />
            <section aria-label="この章のあらすじ">
              <h2 className="review-h2">この章のあらすじ</h2>
              <p className="review-summary streaming">
                {progress.summary || '…'}
                <span className="review-caret" />
              </p>
            </section>
          </main>
          <aside className="review-aside">
            <div className="nm-status" role="status">
              <span className="nm-spinner" aria-hidden="true" />
              この章をまとめています
            </div>
            {calls}
            {progress.calls.length > 1 && running > 0 && (
              <div className="review-desc">
                {running === progress.calls.length
                  ? `${running}本を同時に受け取っています。`
                  : `1本が終わり、残り${running}本を待っています。`}
              </div>
            )}
            <div className="review-desc">書き終わると、ここで内容を確かめて次の章へ進めます。</div>
            <div className="review-spacer" />
            <button className="nm-stop review-stop" onClick={stopReview}>
              <Icon name="square" size={14} /> 止める
            </button>
            <div className="review-links">
              <span />
              <button className="nm-link" onClick={goBack}>
                本文に戻る
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

function ChapterTitle({ label, title }: { label: string; title: string }) {
  return (
    <div className="review-chapter">
      <div className="chapter-num">{label}</div>
      {title && <h1 className="review-chapter-title">{title}</h1>}
    </div>
  )
}

/** 「この章で変わったこと」の1行の種類（並び順もこの順） */
type ChangeKind = 'relation' | 'mood' | 'growth' | 'world' | 'newChar'

function ReviewBody() {
  const sceneReview = useStore((st) => st.sceneReview)
  const isRegenSuggestions = useStore((st) => st.isRegenSuggestions)
  const currentSceneId = useStore((st) => st.sessions.find((s) => s.id === st.activeId)?.currentSceneId)
  const { confirmSceneReview, updateSceneReview, cancelReview, stopReview } = storeActions()
  const mobile = useIsMobile()
  const review = sceneReview!
  const isPastScene = review.sceneId !== currentSceneId
  const chapter = useChapter(review.sceneId)

  // 次の章の時点（時間と予定の呼び出しが読み取った now。取れていなければ出さない）
  const nextTimeLabel = !isPastScene ? review.tracker?.now?.trim() || null : null

  // 表示・編集はすべて draft を読む（FB5-C）。ストアの review は候補の作り直しまで変わらない
  const [draft, setDraft] = useState<SceneReview>(() => cloneReview(review))
  const [editSummary, setEditSummary] = useState(false)
  const [editChanges, setEditChanges] = useState(false)
  const [editNext, setEditNext] = useState(false)
  const [showAllChanges, setShowAllChanges] = useState(false)
  // 「自分で決める」の記入（記入があれば AI の案と同じ扱いで確定に渡す）
  const [customTitle, setCustomTitle] = useState('')
  const [customNote, setCustomNote] = useState('')

  const [pick, setPick] = useState<number>(review.suggestions.length > 0 ? 0 : -1)
  const all = (n: number) => new Set(Array.from({ length: n }, (_, i) => i))
  const [charSel, setCharSel] = useState<Set<number>>(() => all(review.characterGrowth.length))
  const [worldSel, setWorldSel] = useState<Set<number>>(() => all(review.worldGrowth.length))
  const [relUpdSel, setRelUpdSel] = useState<Set<number>>(() => all(review.relationUpdates.length))
  const [moodSel, setMoodSel] = useState<Set<number>>(() => all(review.moodChanges.length))
  // 新しい人物（FB7-E）は既定で外す＝キャラクター化は毎回起案の画面が1枚開く操作なので、
  // 「確定を押したら知らない人物が次々に起案され始める」状態にはしない
  const [newCharSel, setNewCharSel] = useState<Set<number>>(new Set())

  // 別の章のまとめに切り替わったときだけ全体を戻す。候補だけ作り直した場合は編集中の内容を残す
  useEffect(() => {
    setDraft(cloneReview(review))
    setEditSummary(false)
    setEditChanges(false)
    setEditNext(false)
    setCustomTitle('')
    setCustomNote('')
    setCharSel(all(review.characterGrowth.length))
    setWorldSel(all(review.worldGrowth.length))
    setRelUpdSel(all(review.relationUpdates.length))
    setMoodSel(all(review.moodChanges.length))
    setNewCharSel(new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review.sceneId])

  // 候補が変わったら案だけ差し替えて選び直す（ほかの編集・自分で決めるの記入は残す。FB5-C）
  useEffect(() => {
    setDraft((d) => ({ ...d, suggestions: cloneReview(review).suggestions }))
    setPick(review.suggestions.length > 0 ? 0 : -1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review.suggestions])

  const toggle = (set: Set<number>, setFn: (s: Set<number>) => void, i: number) => {
    const next = new Set(set)
    next.has(i) ? next.delete(i) : next.add(i)
    setFn(next)
  }

  const updSuggestion = (i: number, patch: Partial<NextSceneSuggestion>) =>
    setDraft((d) => ({ ...d, suggestions: mapAt(d.suggestions, i, patch) }))
  const updGrowth = (i: number, addition: string) =>
    setDraft((d) => ({ ...d, characterGrowth: mapAt(d.characterGrowth, i, { addition }) }))
  const updWorldG = (i: number, patch: Partial<WorldGrowth>) =>
    setDraft((d) => ({ ...d, worldGrowth: mapAt(d.worldGrowth, i, patch) }))
  const updRel = (i: number, patch: Partial<RelationUpdate>) =>
    setDraft((d) => ({ ...d, relationUpdates: mapAt(d.relationUpdates, i, patch) }))
  const updRelAspect = (i: number, ai: number, note: string) =>
    setDraft((d) => ({
      ...d,
      relationUpdates: d.relationUpdates.map((u, j) =>
        j === i ? { ...u, aspects: u.aspects.map((a, k) => (k === ai ? { ...a, note } : a)) } : u,
      ),
    }))
  const updMood = (i: number, mood: string) => setDraft((d) => ({ ...d, moodChanges: mapAt(d.moodChanges, i, { mood }) }))
  const updNewChar = (i: number, patch: Partial<DiscoveredCharacter>) =>
    setDraft((d) => ({ ...d, newCharacters: mapAt(d.newCharacters, i, patch) }))

  const hasCustom = !!(customTitle.trim() || customNote.trim())

  const confirm = () => {
    const customSug: NextSceneSuggestion | undefined = hasCustom
      ? { title: customTitle.trim(), note: customNote.trim() }
      : undefined
    // 編集内容をストアへ書き戻してから確定する（確定側は store の review を index で読むため。FB5-C）
    updateSceneReview(draft)
    confirmSceneReview({
      summary: draft.summary,
      suggestion: pick >= 0 ? draft.suggestions[pick] : customSug,
      characterGrowthIdx: [...charSel],
      worldGrowthIdx: [...worldSel],
      relationUpdateIdx: [...relUpdSel],
      moodChangeIdx: [...moodSel],
      newCharacterIdx: [...newCharSel],
    })
  }

  const discard = async () => {
    if (await appConfirm({ message: 'この章のまとめを捨てて本文に戻りますか？\n（本文はそのまま残ります）', danger: true })) {
      cancelReview()
    }
  }

  const illustrate = () =>
    goBackThen(() => useOverlays.getState().setIllustrateSceneId(review.sceneId))

  // ---- 「この章で変わったこと」を1つの一覧にまとめる（関係・気分は今の章を閉じるときだけ） ----
  const changes: { kind: ChangeKind; i: number; checked: boolean; toggle: () => void; view: JSX.Element; edit: JSX.Element }[] = []
  if (!isPastScene) {
    draft.relationUpdates.forEach((u, i) =>
      changes.push({
        kind: 'relation',
        i,
        checked: relUpdSel.has(i),
        toggle: () => toggle(relUpdSel, setRelUpdSel, i),
        view: (
          <>
            {u.fromName} → {u.toName}：{u.stance}
            {u.aspects.map((a) => (
              <span key={a.aspectId} className="rel-aspect">
                <em>{a.name}</em> {a.note}
              </span>
            ))}
            <small>関係を書き直す</small>
          </>
        ),
        edit: (
          <>
            <strong>
              {u.fromName} → {u.toName}
            </strong>
            <textarea rows={2} value={u.stance} placeholder="関係の現在地（全文書き直し）" onChange={(e) => updRel(i, { stance: e.target.value })} />
            {u.aspects.map((a, ai) => (
              <div key={a.aspectId} className="rel-aspect-edit">
                <span className="sub-label">{a.name}</span>
                <textarea rows={2} value={a.note} onChange={(e) => updRelAspect(i, ai, e.target.value)} />
              </div>
            ))}
          </>
        ),
      }),
    )
    draft.moodChanges.forEach((m, i) =>
      changes.push({
        kind: 'mood',
        i,
        checked: moodSel.has(i),
        toggle: () => toggle(moodSel, setMoodSel, i),
        view: (
          <>
            {m.name}：{m.mood}
            <small>気分</small>
          </>
        ),
        edit: (
          <>
            <strong>{m.name}の気分</strong>
            <input value={m.mood} onChange={(e) => updMood(i, e.target.value)} />
          </>
        ),
      }),
    )
  }
  draft.characterGrowth.forEach((g, i) =>
    changes.push({
      kind: 'growth',
      i,
      checked: charSel.has(i),
      toggle: () => toggle(charSel, setCharSel, i),
      view: (
        <>
          {g.addition}
          <small>{g.name}に書き足す</small>
        </>
      ),
      edit: (
        <>
          <strong>{g.name}に書き足す</strong>
          <textarea rows={2} value={g.addition} onChange={(e) => updGrowth(i, e.target.value)} />
        </>
      ),
    }),
  )
  draft.worldGrowth.forEach((g, i) =>
    changes.push({
      kind: 'world',
      i,
      checked: worldSel.has(i),
      toggle: () => toggle(worldSel, setWorldSel, i),
      view: (
        <>
          {g.content}
          <small>世界観に書き足す{g.keys.length > 0 ? `（${g.keys.join('、')}）` : ''}</small>
        </>
      ),
      edit: (
        <>
          <strong>世界観に書き足す</strong>
          <CsvInput value={g.keys} onChange={(keys) => updWorldG(i, { keys })} placeholder="きっかけの語（カンマ区切り・任意）" />
          <textarea rows={2} value={g.content} onChange={(e) => updWorldG(i, { content: e.target.value })} />
        </>
      ),
    }),
  )
  draft.newCharacters.forEach((c, i) =>
    changes.push({
      kind: 'newChar',
      i,
      checked: newCharSel.has(i),
      toggle: () => toggle(newCharSel, setNewCharSel, i),
      view: (
        <>
          {c.name}
          {c.note && `　${c.note}`}
          <small>新しい人物　選ぶと、確定のあとにキャラクターにする画面が開きます</small>
        </>
      ),
      edit: (
        <>
          <strong>新しい人物</strong>
          <input value={c.name} placeholder="名前" onChange={(e) => updNewChar(i, { name: e.target.value })} />
          <textarea rows={2} value={c.note} placeholder="この人物について本文から分かること" onChange={(e) => updNewChar(i, { note: e.target.value })} />
        </>
      ),
    }),
  )
  // モバイルは3件まで出して残りを畳む（選んだ数は数える）
  const visibleChanges = mobile && !showAllChanges && !editChanges ? changes.slice(0, 3) : changes
  const checkedCount = changes.filter((c) => c.checked).length

  const summarySection = (
    <section aria-label="この章のあらすじ">
      <div className="review-h2-row">
        <h2 className="review-h2">この章のあらすじ</h2>
        <button className="nm-link" onClick={() => setEditSummary((v) => !v)}>
          {editSummary ? '直し終える' : '直す'}
        </button>
      </div>
      {editSummary ? (
        <textarea
          className="review-summary-edit"
          rows={mobile ? 6 : 8}
          value={draft.summary}
          onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))}
        />
      ) : (
        <p className="review-summary">{draft.summary || '（あらすじがありません。「直す」から書けます）'}</p>
      )}
    </section>
  )

  const changesSection = changes.length > 0 && (
    <section aria-label="この章で変わったこと">
      <div className="review-h2-row">
        <h2 className="review-h2">
          この章で変わったこと{mobile ? `　${checkedCount}件` : ''}
        </h2>
        <button className="nm-link" onClick={() => setEditChanges((v) => !v)}>
          {editChanges ? '直し終える' : '直す'}
        </button>
      </div>
      {visibleChanges.map((c) =>
        editChanges ? (
          <div key={c.kind + c.i} className="review-item editing">
            {c.edit}
          </div>
        ) : (
          <label key={c.kind + c.i} className="review-item">
            <input type="checkbox" checked={c.checked} onChange={c.toggle} />
            <span>{c.view}</span>
          </label>
        ),
      )}
      {visibleChanges.length < changes.length && (
        <button className="nm-link review-more" onClick={() => setShowAllChanges(true)}>
          ほかに{changes.length - visibleChanges.length}件
        </button>
      )}
    </section>
  )

  const nextCards = (
    <div className={'review-next-list' + (mobile ? ' scroller' : '')} style={isRegenSuggestions ? { opacity: 0.5 } : undefined}>
      {draft.suggestions.map((s, i) =>
        editNext && pick === i ? (
          <div key={i} className="review-next on editing">
            <input value={s.title} placeholder={`案 ${i + 1} の見出し`} onChange={(e) => updSuggestion(i, { title: e.target.value })} />
            <textarea rows={3} value={s.note} placeholder="次の章の状況・方向" onChange={(e) => updSuggestion(i, { note: e.target.value })} />
          </div>
        ) : (
          <button key={i} className={'review-next' + (pick === i ? ' on' : '')} aria-pressed={pick === i} onClick={() => setPick(i)}>
            <b>{s.title || `案 ${i + 1}`}</b>
            {s.note}
          </button>
        ),
      )}
      {pick === -1 ? (
        <div className="review-next on editing">
          <b>自分で決める</b>
          <input value={customTitle} placeholder="次の章の題（任意）" onChange={(e) => setCustomTitle(e.target.value)} />
          <textarea
            rows={3}
            value={customNote}
            placeholder="次の章でやりたいこと（空のままなら、何も決めずに次の章を始めます）"
            onChange={(e) => setCustomNote(e.target.value)}
          />
        </div>
      ) : (
        <button className="review-next" aria-pressed={false} onClick={() => setPick(-1)}>
          <b>自分で決める</b>
          次の章でやりたいことを書く
        </button>
      )}
    </div>
  )

  const nextSection = !isPastScene && (
    <section aria-label="次の章" className="review-next-section">
      <div className="review-h2-row">
        <h2 className="review-h2">{mobile ? '次の章' : '次の章はどうしますか'}</h2>
        {pick >= 0 && (
          <button className="nm-link" onClick={() => setEditNext((v) => !v)}>
            {editNext ? '直し終える' : '選んだ案を直す'}
          </button>
        )}
      </div>
      {nextTimeLabel && <div className="review-desc">時間が進みます → {nextTimeLabel}</div>}
      {isRegenSuggestions && (
        <div className="nm-status">
          <span className="nm-spinner" aria-hidden="true" />
          次の章の案を考えています
          <button className="nm-link" onClick={stopReview}>
            止める
          </button>
        </div>
      )}
      {nextCards}
    </section>
  )

  const primary = (
    <button className="nm-primary review-confirm" onClick={confirm} disabled={isRegenSuggestions}>
      {isPastScene ? 'あらすじを更新する' : 'この内容で次の章へ'}
    </button>
  )
  const links = (
    <div className="review-links">
      {!isPastScene ? (
        <button className="nm-link" onClick={illustrate}>
          この章の挿絵を描く
        </button>
      ) : (
        <span />
      )}
      <span className="review-links-end">
        <button className="nm-link" onClick={goBack}>
          本文に戻る
        </button>
        <button className="nm-link danger" onClick={() => void discard()}>
          まとめを捨てる
        </button>
      </span>
    </div>
  )

  return (
    <div className={'review-page' + (mobile ? ' mobile' : ' desktop')}>
      <ReviewHeader chapterLabel={chapter.label} />
      <div className="review-scroll">
        {mobile ? (
          <main className="review-main">
            {summarySection}
            {changesSection}
            {nextSection}
            {links}
          </main>
        ) : (
          <div className="review-grid">
            <main className="review-main">
              <ChapterTitle label={chapter.label} title={chapter.title} />
              {summarySection}
              {changesSection}
            </main>
            <aside className="review-aside">
              {nextSection}
              <div className="review-spacer" />
              {primary}
              {links}
            </aside>
          </div>
        )}
      </div>
      {mobile && <div className="review-bottom">{primary}</div>}
    </div>
  )
}
