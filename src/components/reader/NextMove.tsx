import { useEffect, useRef, useState } from 'react'
import { storeActions, useStore } from '../../store'
import { sceneCharsOf } from '../../lib/prompts'
import { lengthLevel } from '../../lib/tokens'
import { useIsMobile, useOverlays, openSettings } from '../../lib/nav'
import { appConfirm } from '../../lib/dialogs'
import type { Character, Session } from '../../types'
import EntityAvatar from '../EntityAvatar'
import { Icon } from '../icons'

interface Props {
  session: Session
  /** これから話す人の候補（ロールプレイの会話劇） */
  participants: Character[]
  /** ロールプレイで複数人と話している（「次に話す」を出す） */
  groupMode: boolean
  speaker: string | undefined
  setSpeaker: (id: string | undefined) => void
  /** 実際に渡す話者（会話劇はおまかせなら undefined） */
  effectiveSpeaker: string | undefined
}

/**
 * 本文の末尾の「次の一手」（P9 段3・統合案5）。物語では「続ける」が常に一番目立つ主ボタンで、
 * ペース（詳しく・先へ）と展開を選ぶはその従属、指示は任意の欄（空でも続けられる）。
 * 書いている最中は「止める」だけ、書けなかったときは「もう一度」を出す。
 * ロールプレイは入力欄が主（話しかけて返事をもらう）
 */
export default function NextMove({ session, participants, groupMode, speaker, setSpeaker, effectiveSpeaker }: Props) {
  const isStreaming = useStore((st) => st.isStreaming)
  const isReviewing = useStore((st) => st.isReviewing)
  const isGeneratingChoices = useStore((st) => st.isGeneratingChoices)
  // この物語の章のまとめ（書いている最中か、確定を待っている）。章を閉じるページから「本文に戻る」で戻ったとき
  const reviewWaiting = useStore((st) => st.sceneReview?.sessionId === session.id)
  const reviewRunning = useStore((st) => st.reviewProgress?.sessionId === session.id)
  const {
    send,
    continueStory,
    regenerate,
    stop,
    stopChoices,
    stopReview,
    prepareSceneReview,
    startStory,
    continueLast,
    pickDirection,
    clearError,
    setView,
    cancelReview,
  } = storeActions()
  const { setReaderModal } = useOverlays()
  const mobile = useIsMobile()

  const [text, setText] = useState('')
  /**
   * ロールプレイだけが持つ入力の二分化（IN1）。物語では廃止した（F4・読者モデル）＝
   * すべての入力は書き手への指示で、読者はその世界の住人として演じない
   */
  const [rpInputMode, setRpInputMode] = useState<'speech' | 'directive'>('speech')
  const [wrapHintHiddenFor, setWrapHintHiddenFor] = useState<string | null>(null)
  /** 直前の書き出しが失敗したときの理由（トーストではなくここで出す） */
  const [failure, setFailure] = useState<string | null>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  const story = session.mode === 'story'
  const scene = session.scenes.find((s) => s.id === session.currentSceneId)
  const lastMsg = session.messages[session.messages.length - 1]
  const storyStarted = session.messages.some((m) => m.sceneId === scene?.id)
  const hasAssistantMsg = session.messages.some((m) => m.role === 'assistant')
  const asDirective = story || rpInputMode === 'directive'
  const ended = !!session.ending

  // 書き出しが終わった瞬間に、エラーが出ていて末尾が読者の側（＝返事が付かなかった）なら失敗として持つ。
  // store は error を立ててから isStreaming を下ろすので、下りた時点で見れば足りる
  const wasStreaming = useRef(isStreaming)
  useEffect(() => {
    if (wasStreaming.current && !isStreaming) {
      const st = useStore.getState()
      const s = st.sessions.find((x) => x.id === session.id)
      const last = s?.messages[s.messages.length - 1]
      if (st.error && last && last.role === 'user') {
        setFailure(st.error)
        clearError()
      }
    }
    if (isStreaming) setFailure(null)
    wasStreaming.current = isStreaming
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming])

  // 締め時の目安（prompts.ts のペース制御ナッジと共通判定）。分量は文字数で見せる（F5）
  const lenLvl = lengthLevel(sceneCharsOf(session))
  const showWrapHint =
    story && lenLvl === 'high' && !isStreaming && !isReviewing && !!scene && !ended && wrapHintHiddenFor !== scene.id

  const showChoices =
    !isStreaming && !isGeneratingChoices && lastMsg?.role === 'assistant' && !!lastMsg.choices?.length
  const canPickDirection = !isStreaming && !ended && lastMsg?.role === 'assistant' && !!lastMsg.content.trim()

  const autoGrow = () => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }

  const submit = async () => {
    if (isStreaming || !text.trim()) return
    const t = text
    setText('')
    requestAnimationFrame(autoGrow)
    // 指示も送信でそのまま書き出しが走る（＝方向づけ付きの「続ける」。IN1）
    await send(t, effectiveSpeaker, asDirective ? 'directive' : undefined)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void submit()
    }
  }

  // 章のまとめが待っている／書いている: 次の一手の先頭で知らせ、章を閉じるページへ戻れるようにする
  const reviewBanner = (reviewWaiting || reviewRunning) && (
    <div className="nm-banner review-waiting">
      <Icon name="check" size={14} />
      <div>{reviewWaiting ? 'この章のまとめができています' : 'この章をまとめています'}</div>
      <button className="nm-link" onClick={() => setView('review')}>
        {reviewWaiting ? 'まとめを開く' : '進み具合を見る'}
      </button>
      {reviewWaiting ? (
        <button
          className="nm-link"
          onClick={async () => {
            if (await appConfirm({ message: 'この章のまとめを捨てますか？\n（本文はそのまま残ります）', danger: true }))
              cancelReview()
          }}
        >
          捨てる
        </button>
      ) : (
        <button className="nm-link" onClick={stopReview}>
          止める
        </button>
      )}
    </div>
  )

  const closeChapter = (
    <button
      className={mobile ? 'nm-link' : 'nm-sub nm-close'}
      onClick={() => (reviewWaiting || isReviewing ? setView('review') : void prepareSceneReview())}
      disabled={isStreaming}
      title="この章を振り返って、次の章へ"
    >
      {mobile ? 'この章を閉じる' : '章を閉じる'}
    </button>
  )

  // ---- 書いている最中: 止めるだけ ----
  if (isStreaming) {
    const writing = lastMsg?.role === 'assistant' && lastMsg.pending ? lastMsg.content.length : 0
    return (
      <section className="next-move" aria-label="次の一手">
        <div className="nm-status" role="status">
          <span className="nm-spinner" aria-hidden="true" />
          書いています{writing > 0 ? `　${writing.toLocaleString()}字` : ''}
        </div>
        <button className="nm-stop" onClick={stop}>
          <Icon name="square" size={14} /> 止める
        </button>
        <div className="nm-note">止めても、ここまでの文は残ります</div>
      </section>
    )
  }

  // ---- 書けなかった: もう一度 ----
  if (failure) {
    return (
      <section className="next-move" aria-label="次の一手">
        <div className="nm-alert" role="alert">
          <Icon name="alert-triangle" size={20} className="nm-alert-icon" />
          <div>
            <div className="nm-alert-title">続きを書けませんでした</div>
            <div className="nm-alert-body">
              書き手（AI）の接続先から返事を受け取れませんでした。通信や接続先を確かめて、もう一度試してください。本文は失われていません。
            </div>
          </div>
        </div>
        <button className="nm-primary" onClick={() => void regenerate(effectiveSpeaker)}>
          もう一度
        </button>
        <div className="nm-row-between">
          <button className="nm-link" onClick={() => openSettings('writer')}>
            接続先を確かめる
          </button>
          <details className="nm-details">
            <summary>詳しい内容</summary>
            <p>{failure}</p>
          </details>
        </div>
      </section>
    )
  }

  const directiveInput = (
    <div className="nm-input">
      <textarea
        ref={taRef}
        rows={1}
        value={text}
        aria-label={asDirective ? '書き手への指示' : 'あなたの発言'}
        className={asDirective ? 'directive' : undefined}
        placeholder={
          !story
            ? asDirective
              ? '書き手への指示（例: そろそろ雨を降らせて）'
              : '話しかける・行動する（Enter で送る）'
            : !storyStarted
              ? '最初の状況を書いて始める（空のままでも始められます）'
              : mobile
                ? 'こうしてほしい、を書いて続ける'
                : 'こうしてほしい、を書いて続ける（例: 蓮に去年の話をさせて）'
        }
        onChange={(e) => {
          setText(e.target.value)
          autoGrow()
        }}
        onKeyDown={onKey}
      />
      {text.trim() && (
        <button className="nm-send" onClick={() => void submit()} title={asDirective ? '指示を渡して続きを書かせる' : '送る'}>
          <Icon name="arrow-up" size={16} />
        </button>
      )}
    </div>
  )

  const choices = (
    <>
      {isGeneratingChoices && (
        <div className="nm-status">
          展開の候補を考えています…
          <button className="nm-link" onClick={stopChoices}>
            止める
          </button>
        </div>
      )}
      {showChoices && (
        <div className="nm-choices" role="group" aria-label="展開の候補">
          {lastMsg.choices!.map((c, i) => (
            <button key={i} className="nm-choice" onClick={() => void send(c.text, effectiveSpeaker)}>
              <span className="nm-choice-num">{i + 1}</span>
              {c.text}
            </button>
          ))}
        </div>
      )}
    </>
  )

  const banners = (
    <>
      {reviewBanner}
      {/* 締め時の提案（FB5-①c）。ペース制御ナッジと同じ閾値で「章を閉じる」を後押しする */}
      {showWrapHint && scene && (
        <div className="nm-hint">
          <span>章が長くなってきました。区切りのいいところで閉じるのがおすすめです。</span>
          <button className="nm-link" onClick={() => void prepareSceneReview()}>
            この章を閉じる
          </button>
          <button className="icon-btn small" onClick={() => setWrapHintHiddenFor(scene.id)} title="この章では出さない">
            <Icon name="x" size={12} />
          </button>
        </div>
      )}
      {/* 完結（F4）。分岐で戻せるので「終わり」ではなく「この線の終わり」として出す */}
      {ended && (
        <div className="nm-banner">
          <Icon name="flag" size={14} />
          <div>
            完結: <strong>{session.ending!.title}</strong>
            <div className="nm-banner-desc">分岐としおりから前の地点へ戻れば、そこから別の結末を書き直せます。</div>
          </div>
        </div>
      )}
      {/* 目指す結末（F4）。書き手へゆるく渡っていることを読者にも見せる */}
      {!ended && session.endingGoal && (
        <div className="nm-banner">
          <Icon name="flag" size={14} />
          <div>
            目指す結末: <strong>{session.endingGoal.title}</strong>
          </div>
          <button className="nm-link" onClick={() => setReaderModal('ending')}>
            変える・やめる
          </button>
        </div>
      )}
    </>
  )

  // ---- ロールプレイ: 入力欄が主 ----
  if (!story) {
    return (
      <section className="next-move" aria-label="次の一手">
        {banners}
        {groupMode && (
          <div className="nm-chips" role="group" aria-label="次に話す人">
            <span className="nm-chips-label">次に話す</span>
            <button className={'nm-chip' + (speaker === undefined ? ' on' : '')} onClick={() => setSpeaker(undefined)}>
              <Icon name="dice" size={13} /> おまかせ
            </button>
            {participants.map((c) => (
              <button key={c.id} className={'nm-chip' + (speaker === c.id ? ' on' : '')} onClick={() => setSpeaker(c.id)}>
                <EntityAvatar className="dot-avatar" avatar={c.avatar} name={c.name || '無名'} />
                {c.name || '無名'}
              </button>
            ))}
          </div>
        )}
        {choices}
        <div className="nm-chips" role="group" aria-label="書き方">
          <button
            className={'nm-chip' + (rpInputMode === 'speech' ? ' on' : '')}
            onClick={() => setRpInputMode('speech')}
            title="書いた内容をあなたが演じる人物の発言・行動として渡します"
          >
            <Icon name="message-circle" size={13} /> 演じて書く
          </button>
          <button
            className={'nm-chip' + (rpInputMode === 'directive' ? ' on' : '')}
            onClick={() => setRpInputMode('directive')}
            title="書いた内容を書き手 AI への指示として渡します（あなたの人物は何も言いません）"
          >
            <Icon name="clapperboard" size={13} /> 書き手に指示
          </button>
        </div>
        {directiveInput}
        <div className="nm-subs">
          {hasAssistantMsg && (
            <button className="nm-sub" onClick={() => void regenerate(effectiveSpeaker)}>
              <Icon name="rotate-ccw" size={14} /> {groupMode ? '直前をやり直す' : 'やり直す'}
            </button>
          )}
          {lastMsg?.role === 'assistant' && lastMsg.truncated && (
            <button className="nm-sub" onClick={() => void continueLast()} title="上限で途中で切れた続きを書かせる">
              <Icon name="corner-down-right" size={14} /> 切れた続きを書く
            </button>
          )}
          {canPickDirection && (
            <button className="nm-sub" onClick={() => void pickDirection()} disabled={isGeneratingChoices}>
              <Icon name="git-branch" size={14} /> 展開を選ぶ
            </button>
          )}
          {!mobile && <span className="nm-spacer" />}
          {scene && closeChapter}
        </div>
      </section>
    )
  }

  // ---- 完結した物語: 続ける導線を出さない ----
  if (ended) {
    return (
      <section className="next-move" aria-label="次の一手">
        {banners}
      </section>
    )
  }

  // ---- 物語: 始める前 ----
  if (!storyStarted) {
    return (
      <section className="next-move" aria-label="次の一手">
        {banners}
        <button className="nm-primary" onClick={() => void startStory()}>
          <Icon name="play" size={16} /> 物語をはじめる
        </button>
        {directiveInput}
      </section>
    )
  }

  // ---- 物語: 続ける ----
  const paceButtons = (
    <>
      <button
        className="nm-sub"
        onClick={() => void continueStory(effectiveSpeaker, 'detail')}
        title="時間を進めず、この場面をじっくり描かせる"
      >
        {mobile ? '詳しく' : 'もっと詳しく'}
      </button>
      <button
        className="nm-sub"
        onClick={() => void continueStory(effectiveSpeaker, 'skip')}
        title="この場面は手早くまとめ、次の出来事まで進めさせる"
      >
        {mobile ? '先へ' : '先へ飛ばす'}
      </button>
      <button
        className="nm-sub"
        onClick={() => void pickDirection()}
        disabled={!canPickDirection || isGeneratingChoices}
        title="この続きの展開の候補を出す（押したときだけ考えます）"
      >
        展開を選ぶ
      </button>
    </>
  )
  const extraButtons = (
    <>
      {lastMsg?.role === 'assistant' && lastMsg.truncated && (
        <button className="nm-link" onClick={() => void continueLast()} title="上限で途中で切れた続きを書かせる">
          切れた続きを書く
        </button>
      )}
      {hasAssistantMsg && (
        <button className="nm-link" onClick={() => void regenerate(effectiveSpeaker)} title="直前の続きを消して書き直させる">
          やり直す
        </button>
      )}
    </>
  )

  if (mobile) {
    return (
      <section className="next-move" aria-label="次の一手">
        {banners}
        {choices}
        <button className="nm-primary" onClick={() => void continueStory(effectiveSpeaker)}>
          続ける
        </button>
        <div className="nm-pace">{paceButtons}</div>
        {directiveInput}
        <div className="nm-row-between">
          {extraButtons}
          {closeChapter}
        </div>
      </section>
    )
  }

  return (
    <section className="next-move" aria-label="次の一手">
      {banners}
      {choices}
      <div className="nm-row">
        <button className="nm-primary" onClick={() => void continueStory(effectiveSpeaker)} title="続きを書かせる（Ctrl+G）">
          続ける
        </button>
        {paceButtons}
        <span className="nm-spacer" />
        {extraButtons}
        {closeChapter}
      </div>
      {directiveInput}
    </section>
  )
}
