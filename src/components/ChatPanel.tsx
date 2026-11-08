import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { reviewModelOf, storeActions, useListStore, useStore } from '../store'
import { illustrationContextUser, isDirective } from '../lib/prompts'
import { isImageSetupDismissed } from '../lib/imageSetup'
import { useIsMobile, useOverlays } from '../lib/nav'
import ImageGenModal from './ImageGenModal'
import type { Message, Session } from '../types'
import EndingModal from './EndingModal'
import SessionEditor from './SessionEditor'
import SceneEditor from './SceneEditor'
import StoryLogModal from './StoryLogModal'
import StoryExportModal from './StoryExportModal'
import StatusPanel from './StatusPanel'
import DiscoveryPanel, { type DiscoveryScope } from './DiscoveryPanel'
import CharacterDraftModal from './CharacterDraftModal'
import CassetteEditor from './CassetteEditor'
import ContextDock from './ContextDock'
import { EMPTY_MESSAGES, isMarker, SceneBlock, type MessageActions, type SessionMeta } from './reader/StoryBody'
import NextMove from './reader/NextMove'
import ChapterList from './reader/ChapterList'
import MarginNotes from './reader/MarginNotes'
import ReaderHeader from './reader/ReaderHeader'

interface Props {
  sessionId: string
}

/**
 * 物語を読む画面（P9 段3 で作り直した）。PC は左に章の一覧・中央に本文と「次の一手」・右に余白の注記、
 * モバイルは本文と「次の一手」だけ。状況・分岐・挿絵の右のパネル（旧ドック）は本文の上に重ねる（作り直しは段5）。
 *
 * 本編セッションの購読はここで閉じる（P2b）。**`App` へ `session` を持ち上げない**——
 * 持ち上げるとストリーミングの1チャンクごとに `App` が描き直る。
 */
export default function ChatPanel({ sessionId }: Props) {
  const session = useStore((st) => st.sessions.find((s) => s.id === sessionId))
  if (!session) return null
  return <ChatPanelBody session={session} />
}

function ChatPanelBody({ session }: { session: Session }) {
  const isStreaming = useStore((st) => st.isStreaming)
  const isReviewing = useStore((st) => st.isReviewing)
  const characters = useStore((st) => st.characters)
  const immersive = useStore((st) => st.ui.immersive)
  const dockOpen = useStore((st) => !!st.ui.dockTab)
  const scrollTarget = useStore((st) => st.scrollTarget)
  const characterDraftQueue = useStore((st) => st.characterDraftQueue)
  const { startSession, dismissCharacterDraft } = storeActions()
  const { readerModal: openModal, readerModalFor, setReaderModal } = useOverlays()
  // 開いた物語でだけ出す（別の物語を開いたときに持ち越さない）
  const readerModal = readerModalFor === session.id ? openModal : null
  const mobile = useIsMobile()

  const [showStatus, setShowStatus] = useState(false)
  const [discoveryScope, setDiscoveryScope] = useState<DiscoveryScope | null>(null)
  // 挿絵の生成対象（FB6-B。null=閉。過去の章・任意の段落をアンカーに後付け生成できる）
  const [illustGenFor, setIllustGenFor] = useState<
    { sceneId: string; messageId?: string; regenPrompt?: string; regenNegative?: string } | null
  >(null)
  /*
   * 挿絵の操作は**未設定でも出す**（機能の存在を知らせる価値がある）。押した先の案内を
   * 「今はしない」で断った人にだけ、以後このアプリ起動中は出さない（§7.1）。
   */
  const showIllustButtons = useStore((s) => s.imageProviders.length > 0) || !isImageSetupDismissed()
  const [speaker, setSpeaker] = useState<string | undefined>(undefined)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  // 自動スクロールは「自分の操作直後の1回」だけ（書いている最中は追従しない。FB3-A3）
  const lastScrolledRef = useRef<string | null>(null)

  const scene = session.scenes.find((s) => s.id === session.currentSceneId)
  const chapterNumber = scene ? session.scenes.indexOf(scene) + 1 : 0
  // 顔ぶれは2種類ある。**混ぜてはいけない**（CG1 §1.4）。
  // - `knownCast` … セッションの顔ぶれ全員（CS1）。**既に書かれた本文の話者解決**に使う
  // - `participants` … これから作るもの（話者チップ・「次に話す」・後付けの挿絵の対象）に使う
  const knownCast = useMemo(
    () =>
      session.characterIds
        .map((id) => characters.find((c) => c.id === id))
        .filter((c): c is NonNullable<typeof c> => !!c),
    [session.characterIds, characters],
  )
  const participants = knownCast
  const novel = session.narrativeStyle === 'novel'
  // 発見キャラ（FB7-E）: 未解決話者の ？バッジ → キャラ化待ちへ積む。先頭1件だけ開く
  const pendingDraft = characterDraftQueue.find((q) => q.sessionId === session.id)
  const groupMode = session.mode === 'roleplay' && participants.length > 1 && !novel
  const effectiveSpeaker = groupMode ? speaker : participants[0]?.id

  // 章の一覧に渡す見出しだけ（本文が伸びても参照が変わらない＝一覧を描き直さない）
  const chapters = useListStore((st) =>
    (st.sessions.find((s) => s.id === session.id)?.scenes ?? []).map((s) => ({ id: s.id, title: s.title })),
  )

  // --- 本文描画へ渡すもの（P2b）。ここから下は「参照が変わらないこと」が仕様の一部 ---

  /** 本文の描画が読むセッションの断片。`messages` を含めない＝1チャンクごとに変わらない */
  const meta = useMemo<SessionMeta>(
    () => ({
      id: session.id,
      mode: session.mode,
      cast: knownCast,
      focus: knownCast.find((c) => c.id === session.focusCharacterId),
      focusCharacterId: session.focusCharacterId,
      libraryCharacters: characters,
      currentSceneId: session.currentSceneId,
      novel,
      presentIds: session.state?.presentIds ?? [],
      concluded: !!session.ending,
    }),
    [
      session.id,
      session.mode,
      session.focusCharacterId,
      session.currentSceneId,
      session.state?.presentIds,
      session.ending,
      knownCast,
      characters,
      novel,
    ],
  )

  /**
   * sceneId → 本文メッセージ の対応表（1回の走査で作る）。
   * **内容の変わらない章は前回の配列をそのまま返す**——ここで参照が変わると
   * `SceneBlock` の `React.memo` が全滅する。
   */
  const prevByScene = useRef<Map<string, Message[]>>(new Map())
  const messagesByScene = useMemo(() => {
    const next = new Map<string, Message[]>()
    for (const m of session.messages) {
      // 旧データの sceneId 無しメッセージは現在の章へ入れる
      const key = m.sceneId ?? session.currentSceneId ?? ''
      const list = next.get(key)
      if (list) list.push(m)
      else next.set(key, [m])
    }
    for (const [key, list] of next) {
      const prev = prevByScene.current.get(key)
      if (prev && prev.length === list.length && prev.every((m, i) => m === list[i])) next.set(key, prev)
    }
    prevByScene.current = next
    return next
  }, [session.messages, session.currentSceneId])

  /** 本文1件ぶんの操作。参照を固定して `React.memo` の子へ配る */
  const act = useMemo<MessageActions>(() => {
    const st = storeActions()
    return {
      startEdit: (id) => setEditingId(id),
      cancelEdit: () => setEditingId(null),
      // 上書きガード（FB6-C）を通すため await（キャンセル時は本文が変わらないまま編集ボックスを閉じる）
      saveEdit: async (id, textValue) => {
        await st.editMessage(id, textValue)
        setEditingId(null)
      },
      remove: (id) => void st.deleteMessage(id),
      regenerateFrom: (id) => void st.regenerateFrom(id),
      branchFrom: (id) => void st.branchFromMessage(id),
      illustrate: (sceneId, messageId) => setIllustGenFor({ sceneId, messageId }),
      removeIllustration: (sceneId, illId) => st.removeIllustration(session.id, sceneId, illId),
      regenerateIllustration: (sceneId, messageId, prompt, negative) =>
        setIllustGenFor({ sceneId, messageId, regenPrompt: prompt, regenNegative: negative }),
      toggleScene: (id) =>
        setExpanded((prev) => {
          const nextSet = new Set(prev)
          nextSet.has(id) ? nextSet.delete(id) : nextSet.add(id)
          return nextSet
        }),
      regenerateSummary: (sceneId) => void st.prepareSceneReview(sceneId),
      editScene: () => useOverlays.getState().setReaderModal('scene'),
    }
  }, [session.id])

  // 右のパネルへ渡すコールバック（参照を固定して ContextDock の memo を効かせる）
  const onEditStatus = useCallback(() => setShowStatus(true), [])
  const onEditDiscovery = useCallback((scope: DiscoveryScope) => setDiscoveryScope(scope), [])
  const onRegenerateIllustration = useCallback(
    (sceneId: string, messageId: string | undefined, prompt: string, negative?: string) =>
      setIllustGenFor({ sceneId, messageId, regenPrompt: prompt, regenNegative: negative }),
    [],
  )

  /** 章の一覧から: その章の見出しへ移る（畳まれていれば開いてから） */
  const jumpToChapter = useCallback(
    (sceneId: string) => {
      if (sceneId !== session.currentSceneId) {
        flushSync(() => setExpanded((prev) => (prev.has(sceneId) ? prev : new Set([...prev, sceneId]))))
      }
      document.querySelector(`[data-scene-id="${sceneId}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    },
    [session.currentSceneId],
  )

  // 書いている最中の毎チャンクでは追従しない。末尾が読者の側（送る・続ける・展開の候補）に
  // 変わった直後にだけ1回スクロールする（FB3-A3）
  useEffect(() => {
    const last = session.messages[session.messages.length - 1]
    if (last && last.role === 'user' && lastScrolledRef.current !== last.id) {
      lastScrolledRef.current = last.id
      anchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [session.messages])

  // 分岐の行を押したときの本文スクロール（FB7-B）。上の自動スクロールより後に消化して勝たせる
  useEffect(() => {
    if (!scrollTarget || scrollTarget.sessionId !== session.id) return
    const { messageId } = scrollTarget
    const msg = session.messages.find((m) => m.id === messageId)
    const last = session.messages[session.messages.length - 1]
    if (last) lastScrolledRef.current = last.id

    let cancelled = false
    let raf1 = 0
    let raf2 = 0
    let recenterTimer = 0
    const scrollToTarget = () => {
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          if (cancelled) return
          // マーカー等で DOM に無い id は直前の描画メッセージへ、それも無ければ末尾へ
          const idx = session.messages.findIndex((m) => m.id === messageId)
          let el: Element | null = null
          for (let i = idx; i >= 0 && !el; i--) {
            el = document.querySelector(`[data-msg-id="${session.messages[i].id}"]`)
          }
          if (el) {
            const target = el
            target.scrollIntoView({ block: 'center' })
            target.classList.add('msg-flash')
            window.setTimeout(() => target.classList.remove('msg-flash'), 2000)
            // 挿絵などが後から読み込まれてずれるので、少し置いてもう一度だけ中央合わせ（FB8-A #9）
            recenterTimer = window.setTimeout(() => {
              if (!cancelled) target.scrollIntoView({ block: 'center' })
            }, 240)
          } else {
            anchorRef.current?.scrollIntoView()
          }
          useStore.setState({ scrollTarget: null })
        })
      })
    }

    if (msg?.sceneId && msg.sceneId !== session.currentSceneId) {
      const sceneId = msg.sceneId
      // 畳まれた章なら開いてから。flushSync は描画中に呼べないのでマイクロタスクへ逃がす
      queueMicrotask(() => {
        if (cancelled) return
        flushSync(() => {
          setExpanded((prev) => (prev.has(sceneId) ? prev : new Set([...prev, sceneId])))
        })
        scrollToTarget()
      })
    } else {
      scrollToTarget()
    }

    return () => {
      cancelled = true
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      window.clearTimeout(recenterTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollTarget])

  // 物語を開いた直後は最新の地点を出す（App が物語ごとに key を変えるので、開くたびにここを通る）
  useEffect(() => {
    startSession()
    lastScrolledRef.current = null
    anchorRef.current?.scrollIntoView({ block: 'end' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id])

  const isConfigured = participants.length > 0 || (session.mode === 'story' && !!session.story.premise)

  /**
   * 対象の章の本文（マーカー・空・書き手への指示を除く）をアンカーまで返す（FB6-B）。
   * アンカー未指定・見つからない場合は章全体。旧データの sceneId 無しは現在の章にだけ含める。
   */
  const sceneMessagesUpto = (sceneId: string, uptoMessageId?: string): Message[] => {
    const isCur = sceneId === session.currentSceneId
    const msgs = session.messages.filter(
      (m) =>
        (m.sceneId === sceneId || (isCur && !m.sceneId)) && !isMarker(m) && !isDirective(m) && m.content.trim(),
    )
    if (!uptoMessageId) return msgs
    const idx = msgs.findIndex((m) => m.id === uptoMessageId)
    return idx >= 0 ? msgs.slice(0, idx + 1) : msgs
  }

  const body = (
    <div className="reader-text">
      {session.messages.length === 0 && !isConfigured && (
        <p className="reader-empty">
          「何をしますか」→「物語の設定」から{session.mode === 'roleplay' ? '登場キャラクター' : '物語の前提'}を決めましょう。
        </p>
      )}
      {session.scenes.map((sc, i) => (
        <SceneBlock
          key={sc.id}
          scene={sc}
          number={i + 1}
          msgs={messagesByScene.get(sc.id) ?? EMPTY_MESSAGES}
          meta={meta}
          isCurrent={sc.id === session.currentSceneId}
          open={sc.id === session.currentSceneId || expanded.has(sc.id)}
          isStreaming={isStreaming}
          isReviewing={isReviewing}
          editingId={editingId}
          showIllustButtons={showIllustButtons}
          act={act}
        />
      ))}
      <div ref={anchorRef} className="scroll-anchor" />
      <NextMove
        session={session}
        participants={participants}
        groupMode={groupMode}
        speaker={speaker}
        setSpeaker={setSpeaker}
        effectiveSpeaker={effectiveSpeaker}
      />
    </div>
  )

  return (
    <div className={'reader' + (mobile ? ' mobile' : ' desktop')}>
      {/* 没入モードで上端を隠した際、上端に重ねると呼び戻す当たり判定（UI-4）。~ セレクタのため上端の直前に置く */}
      {immersive && <div className="top-hover" />}
      <ReaderHeader
        sessionId={session.id}
        title={session.title}
        mode={session.mode}
        archived={!!session.archived}
        ended={!!session.ending}
        chapterNumber={chapterNumber}
      />
      <div className="reader-main">
        <div className="reader-scroll">
          {mobile ? (
            body
          ) : (
            <div className="reader-grid">
              <aside className="reader-left">
                <ChapterList chapters={chapters} currentId={session.currentSceneId} onJump={jumpToChapter} />
              </aside>
              {body}
              <aside className="reader-right" aria-label="余白の注記">
                <MarginNotes session={session} />
              </aside>
            </div>
          )}
        </div>
        {dockOpen && (
          <ContextDock
            sessionId={session.id}
            onEditStatus={onEditStatus}
            onEditDiscovery={onEditDiscovery}
            onRegenerateIllustration={onRegenerateIllustration}
          />
        )}
      </div>

      {readerModal === 'ending' && <EndingModal onClose={() => setReaderModal(null)} />}
      {readerModal === 'editor' && <SessionEditor session={session} onClose={() => setReaderModal(null)} />}
      {readerModal === 'scene' && scene && <SceneEditor scene={scene} onClose={() => setReaderModal(null)} />}
      {readerModal === 'log' && (
        <StoryLogModal
          session={session}
          onClose={() => setReaderModal(null)}
          onGenIllustration={(sceneId) => setIllustGenFor({ sceneId })}
        />
      )}
      {readerModal === 'cassette' && <CassetteEditor seedSession={session} onClose={() => setReaderModal(null)} />}
      {readerModal === 'export' && <StoryExportModal sessionId={session.id} onClose={() => setReaderModal(null)} />}
      {showStatus && <StatusPanel session={session} onClose={() => setShowStatus(false)} />}
      {/* 発見キャラのキャラ化（FB7-E）。key で対象が変わるたびに起案をやり直させる */}
      {pendingDraft && (
        <CharacterDraftModal
          key={pendingDraft.name}
          session={session}
          name={pendingDraft.name}
          note={pendingDraft.note}
          onClose={() => dismissCharacterDraft(session.id, pendingDraft.name)}
        />
      )}
      {discoveryScope && (
        <DiscoveryPanel session={session} scope={discoveryScope} onClose={() => setDiscoveryScope(null)} />
      )}
      {illustGenFor &&
        (() => {
          // 対象の章は現在の章に限らない（過去の章・任意の段落への後付け生成。FB6-B）
          const sc = session.scenes.find((s) => s.id === illustGenFor.sceneId)
          if (!sc) return null
          const cast = participants
          const ctxMsgs = sceneMessagesUpto(sc.id, illustGenFor.messageId)
          // アンカーから遡って文字数予算でキャップ（推定 8,000 文字 ≒ 4,000〜5,000 トークン程度）
          const budget = 8000
          const recent: string[] = []
          let used = 0
          for (let i = ctxMsgs.length - 1; i >= 0; i--) {
            const c = ctxMsgs[i].content
            if (used + c.length > budget && recent.length > 0) break
            recent.unshift(c)
            used += c.length
          }
          return (
            <ImageGenModal
              title={
                illustGenFor.regenPrompt
                  ? '同じプロンプトで挿絵を描き直す'
                  : illustGenFor.messageId
                    ? 'この位置に挿絵を描く'
                    : 'この場面の挿絵を描く'
              }
              draftContext={{
                user: illustrationContextUser({
                  sceneTitle: sc.title,
                  sceneNote: sc.note,
                  timeLabel: sc.timeLabel,
                  characters: cast.map((c) => ({
                    name: c.name,
                    appearance: c.appearance,
                    imagePrompt: c.imagePrompt,
                  })),
                  recentMessages: recent,
                }),
                modelRef: reviewModelOf(session),
              }}
              initialPrompt={illustGenFor.regenPrompt ?? cast.map((c) => c.imagePrompt).filter(Boolean).join(', ')}
              initialNegative={illustGenFor.regenNegative}
              target={{
                type: 'scene-illustration',
                sessionId: session.id,
                sceneId: sc.id,
                messageId: illustGenFor.messageId ?? ctxMsgs[ctxMsgs.length - 1]?.id,
              }}
              label={`挿絵: ${sc.title || '章'}`}
              onClose={() => setIllustGenFor(null)}
            />
          )
        })()}
    </div>
  )
}
