import { Fragment, memo, useState } from 'react'
import { isMarkerContent, SCENE_START_PROMPT, isDirective } from '../../lib/prompts'
import { getImage, useImageUrl } from '../../lib/imageStore'
import { downloadBlob } from '../../lib/io'
import { appConfirm } from '../../lib/dialogs'
import type { Character, Message, Scene, SceneIllustration, SessionMode } from '../../types'
import InterludePanel from '../InterludePanel'
import EntityAvatar from '../EntityAvatar'
import ZoomOverlay from '../ZoomOverlay'
import { PromptCaption } from '../GalleryModal'
import { Icon } from '../icons'

/*
 * 物語の本文の描画（P9 段3 で ChatPanel から切り出した）。章・本文1件・挿絵。
 * 描画は今のまま使い回し、**React.memo を壊さない**（props はストリーミング中に変わらないものだけ）
 */

/**
 * 本文の描画へ渡すセッションの読み取り専用スライス（P2b）。**`messages` を含めない**——
 * ストリーミング中に変わるのは `messages` だけなので、ここを安定させておけば
 * シーン・メッセージの `React.memo` が効き、描き直しが末尾の1件に収まる。
 */
export interface SessionMeta {
  id: string
  mode: SessionMode
  /** セッションの顔ぶれ全員（CS1）。会話劇の話者表示と中心人物の解決に使う */
  cast: Character[]
  /** 中心人物（F3） */
  focus?: Character
  focusCharacterId: string
  /** ライブラリのキャラクター全員（会話劇で参加者から外れた話者のメッセージも名前を出すため） */
  libraryCharacters: Character[]
  currentSceneId: string | null
  novel: boolean
  /** いま居合わせている人物の id（幕間の候補の並べ替え） */
  presentIds: string[]
  /** 完結済み（続きの導線を出さない） */
  concluded: boolean
}

/**
 * 本文1件ぶんの操作。**参照が変わらない**ように `ChatPanelBody` が `useMemo` で1つ作り、
 * メッセージ・シーンへそのまま配る（`React.memo` を壊さないため）。
 */
export interface MessageActions {
  startEdit: (messageId: string) => void
  cancelEdit: () => void
  saveEdit: (messageId: string, text: string) => Promise<void>
  remove: (messageId: string) => void
  regenerateFrom: (messageId: string) => void
  branchFrom: (messageId: string) => void
  illustrate: (sceneId: string, messageId: string) => void
  removeIllustration: (sceneId: string, illId: string) => void
  regenerateIllustration: (
    sceneId: string,
    messageId: string | undefined,
    prompt: string,
    negative?: string,
  ) => void
  toggleScene: (sceneId: string) => void
  /** 今の章の名前と状況を直す */
  editScene: () => void
  regenerateSummary: (sceneId: string) => void
}

/** 小説形式: 地の文と「」セリフを分けて軽く装飾 */
function renderProse(text: string) {
  return text.split(/(「[^」]*」)/g).map((p, i) =>
    p.startsWith('「') ? (
      <span key={i} className="dialogue">
        {p}
      </span>
    ) : (
      <span key={i}>{p}</span>
    ),
  )
}

export const isMarker = (m: Message) => m.role === 'user' && isMarkerContent(m.content)

/** 本文を持たないシーンへ配る空配列（毎回新しい配列を作ると memo が効かない） */
export const EMPTY_MESSAGES: Message[] = []

/** 本文の編集ボックス。入力中の文字は編集中の1件が持つ（P2b で ChatPanel の state から分離） */
function EditBox({
  initial,
  onCancel,
  onSave,
}: {
  initial: string
  onCancel: () => void
  onSave: (text: string) => void
}) {
  const [text, setText] = useState(initial)
  return (
    <div className="edit-box">
      <textarea rows={4} value={text} autoFocus onChange={(e) => setText(e.target.value)} />
      <div className="edit-actions">
        <button className="btn" onClick={onCancel}>
          キャンセル
        </button>
        <button className="btn primary" onClick={() => onSave(text)}>
          保存
        </button>
      </div>
    </div>
  )
}

/** 挿絵1枚の表示（保存・削除・クリック拡大・再生成） */
function IllustrationView({
  ill,
  onRemove,
  onRegenerate,
}: {
  ill: SceneIllustration
  onRemove: () => void
  onRegenerate: () => void
}) {
  const url = useImageUrl(ill.imageId)
  const [zoom, setZoom] = useState(false)
  if (!url) return null
  return (
    <figure className="illustration">
      <img
        src={url}
        alt={ill.prompt}
        title={ill.negative ? `${ill.prompt}\nネガティブ: ${ill.negative}` : ill.prompt}
        onClick={() => setZoom(true)}
      />
      <div className="illustration-actions">
        <button
          className="icon-btn small"
          title="画像を保存"
          onClick={async () => {
            const blob = await getImage(ill.imageId)
            if (blob) downloadBlob(blob, `illustration_${ill.id}.png`)
          }}
        >
          <Icon name="download" size={14} />
        </button>
        <button
          className="icon-btn small"
          title="本文から外す"
          onClick={async () => {
            if (
              await appConfirm({
                message: 'この挿絵を本文から外しますか？\n（ギャラリーの「すべての記録」には残ります）',
                danger: true,
              })
            )
              onRemove()
          }}
        >
          <Icon name="trash-2" size={14} />
        </button>
      </div>
      {zoom && (
        <ZoomOverlay
          url={url}
          onClose={() => setZoom(false)}
          caption={
            <PromptCaption
              prompt={ill.prompt}
              negative={ill.negative}
              createdAt={ill.createdAt}
              onRegenerate={() => {
                setZoom(false)
                onRegenerate()
              }}
            />
          }
        />
      )}
    </figure>
  )
}

/**
 * メッセージ1件の描画（P2b で `ChatPanel` から切り出し）。
 *
 * **`React.memo` を壊さないこと。** props はすべて「ストリーミング中に変わらないもの」か
 * 「このメッセージ自身」にしてある。ここへセッションや配列を丸ごと渡すと、1チャンクごとに
 * 全メッセージが描き直る元の姿へ戻る。
 */
interface MessageRowProps {
  m: Message
  meta: SessionMeta
  isStreaming: boolean
  /** この行を編集中か */
  editing: boolean
  showIllustButtons: boolean
  act: MessageActions
}

const MessageRow = memo(function MessageRow({
  m,
  meta,
  isStreaming,
  editing,
  showIllustButtons,
  act,
}: MessageRowProps) {
  const editBox = () => (
    <EditBox
      initial={m.content}
      onCancel={act.cancelEdit}
      onSave={(text) => void act.saveEdit(m.id, text)}
    />
  )

  /**
   * 段落ごとの操作（P9 段3）。PC は右の余白へ縦に並べ、段落に重ねたとき（キーボードはフォーカス）だけ出す。
   * モバイルは段落を押すと段落の下に出る（CSS で出し分け）。書き手への指示（IN1）には挿絵を出さない
   * ——挿絵は「本文の一点」に紐づく機能で、指示行に置く意味がないため。
   * 〈展開を選ぶ〉は本文の末尾の「次の一手」へ移した
   */
  const msgActions = () => {
    if (isStreaming || m.pending) return null
    const sceneId = m.sceneId ?? meta.currentSceneId
    return (
      <div className="msg-actions">
        <button onClick={() => act.regenerateFrom(m.id)} title="この段落より後を消して、ここから書き直させる">
          <Icon name="rotate-ccw" size={13} /> ここからやり直す
        </button>
        {/* 明示分岐（FB6-C）: 今の続きに名前を付けて残してから、ここから作り直す */}
        <button onClick={() => act.branchFrom(m.id)} title="今の続きを分岐として残してから、ここから書き直させる">
          <Icon name="git-branch" size={13} /> ここから別の道へ
        </button>
        {/* 任意の段落をアンカーに後付け生成（過去の章も可。FB6-B） */}
        {!isDirective(m) && showIllustButtons && sceneId && (
          <button onClick={() => act.illustrate(sceneId, m.id)} title="この段落の直後に挿絵を描く">
            <Icon name="palette" size={13} /> ここに挿絵
          </button>
        )}
        <button onClick={() => act.startEdit(m.id)}>
          <Icon name="pencil" size={13} /> 直す
        </button>
        <button onClick={() => act.remove(m.id)}>
          <Icon name="trash-2" size={13} /> 消す
        </button>
      </div>
    )
  }

  /**
   * 書き手への指示（IN1）。地の文でもセリフでもないことがひと目で分かる形で描く。
   * **文体（novel / chat）では見た目を変えない**——文体は物語の描き方の設定であって、
   * 舞台裏の表示を変える理由がないため。
   */
  if (isDirective(m)) {
    return (
      <div className="prose-directive" data-msg-id={m.id} tabIndex={-1}>
        <div className="directive-label">
          <Icon name="clapperboard" size={12} /> 書き手への指示
        </div>
        {editing ? editBox() : <div className="directive-body">{m.content}</div>}
        {msgActions()}
      </div>
    )
  }

  if (meta.novel) {
    if (editing) return <div className="prose-block" data-msg-id={m.id}>{editBox()}</div>
    if (m.role === 'assistant') {
      return (
        <div className="prose-block" data-msg-id={m.id} tabIndex={-1}>
          {renderProse(m.content)}
          {m.pending && isStreaming && <span className="cursor" />}
          {msgActions()}
        </div>
      )
    }
    return (
      <div className="prose-action" data-msg-id={m.id} tabIndex={-1}>
        {m.content}
        {msgActions()}
      </div>
    )
  }

  const speaker =
    m.role === 'assistant'
      ? (meta.libraryCharacters.find((x) => x.id === m.characterId) ?? meta.cast[0])
      : undefined
  const av =
    m.role === 'assistant'
      ? speaker
        ? { avatar: speaker.avatar, name: speaker.name || 'AI' }
        : { avatar: { color: '#7c5cff' }, name: meta.mode === 'story' ? '物語' : 'AI' }
      : null
  const name = m.role === 'assistant' ? (av?.name ?? 'AI') : meta.focus?.name || 'あなた'
  return (
    <div className="msg" data-msg-id={m.id} tabIndex={-1}>
      {m.role === 'assistant' ? (
        <EntityAvatar className="avatar" avatar={av!.avatar} name={av!.name} />
      ) : (
        <EntityAvatar className="avatar" avatar={meta.focus?.avatar} name={meta.focus?.name || 'あなた'} />
      )}
      <div className="bubble">
        <div className="name">{name}</div>
        {editing ? (
          editBox()
        ) : (
          <>
            <div className="content">
              {m.content}
              {m.pending && isStreaming && <span className="cursor" />}
            </div>
            {msgActions()}
          </>
        )}
      </div>
    </div>
  )
})

/**
 * シーン1つぶんの描画（見出し・あらすじ・本文・幕間）。P2b で `React.memo` 化した。
 * ストリーミング中に描き直るのは、末尾の pending メッセージを含む**現在シーンだけ**になる。
 */
interface SceneBlockProps {
  scene: Scene
  /** 第何章か（1 から） */
  number: number
  /** このシーンに属する本文（`ChatPanelBody` が1回の走査で作った Map から渡す） */
  msgs: Message[]
  meta: SessionMeta
  isCurrent: boolean
  open: boolean
  isStreaming: boolean
  isReviewing: boolean
  editingId: string | null
  showIllustButtons: boolean
  act: MessageActions
}

export const SceneBlock = memo(function SceneBlock({
  scene,
  number,
  msgs,
  meta,
  isCurrent,
  open,
  isStreaming,
  isReviewing,
  editingId,
  showIllustButtons,
  act,
}: SceneBlockProps) {
  if (msgs.length === 0 && !scene.summary && !isCurrent) return null
  // シーンに本文（マーカー以外）か要約があれば見出しを表示（FB3-A1）。
  // 「複数シーンあれば無条件で見出し」は、本文を全削除した空シーンでもタイトルだけ残る
  // 原因だったので外した（FB8-A #4）。健全なシーンは本文か要約を必ず持つのでこれで十分。
  const hasRealContent = msgs.some((m) => m.content.trim() && !isMarkerContent(m.content))
  const showDivider = hasRealContent || !!scene.summary

  return (
    <>
      {/* 章の見出し（P9 段3）。今の章は本文が無くても出し、押すと章の名前と状況を直せる。
          過去の章は本文か要約があるときだけ（本文を全削除した空の章に題だけ残さない。FB8-A #4） */}
      {(showDivider || isCurrent) && (
        <div className={'chapter-head' + (isCurrent ? ' current' : '')} data-scene-id={scene.id}>
          <div className="chapter-num">第{number}章</div>
          {isCurrent ? (
            <button className="chapter-title" onClick={act.editScene} title="章の名前と状況を直す">
              {scene.title || '無題の章'}
              <Icon name="pencil" size={14} className="chapter-title-pencil" />
            </button>
          ) : (
            <div className="chapter-title-row">
              <h2 className="chapter-title">{scene.title || '無題の章'}</h2>
              {msgs.length > 0 && (
                <button className="scene-toggle" onClick={() => act.toggleScene(scene.id)}>
                  {open ? '本文を隠す' : '本文を読む'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {!isCurrent && scene.summary && (
        <div className="scene-summary">
          <div className="scene-summary-label">
            あらすじ
            <button
              className="scene-summary-regen"
              onClick={() => act.regenerateSummary(scene.id)}
              disabled={isStreaming || isReviewing}
              title="この章のあらすじと次の章の方針を作り直す"
            >
              <Icon name="refresh-cw" size={12} /> 再生成
            </button>
          </div>
          <div className="scene-summary-body">{scene.summary}</div>
        </div>
      )}
      {open &&
        (isCurrent ? (
          <SceneContent
            scene={scene}
            msgs={msgs}
            meta={meta}
            isStreaming={isStreaming}
            editingId={editingId}
            showIllustButtons={showIllustButtons}
            act={act}
          />
        ) : (
          // 過去シーンは右側の縦スパイン（] ブラケット）でどこからでも折りたためる（FB8-D #7）
          <div className="scene-block">
            <button
              className="scene-spine"
              onClick={() => act.toggleScene(scene.id)}
              title="押すと本文を隠す"
              aria-label="本文を隠す"
            />
            <SceneContent
              scene={scene}
              msgs={msgs}
              meta={meta}
              isStreaming={isStreaming}
              editingId={editingId}
              showIllustButtons={showIllustButtons}
              act={act}
            />
          </div>
        ))}
      {/* 別視点の幕間（F6・設計 §2.9）。本文の後ろに置く＝読み物であって本編ではない */}
      {meta.mode === 'story' && hasRealContent && (
        <InterludePanel
          scene={scene}
          cast={meta.cast}
          focusCharacterId={meta.focusCharacterId}
          presentIds={meta.presentIds}
          closed={!!scene.endedAt || !isCurrent}
        />
      )}
    </>
  )
})

/** メッセージ＋挿絵をアンカー順に描画（アンカー消失分はシーン末尾に集約） */
function SceneContent({
  scene,
  msgs,
  meta,
  isStreaming,
  editingId,
  showIllustButtons,
  act,
}: Omit<SceneBlockProps, 'isCurrent' | 'open' | 'isReviewing' | 'number'>) {
  const ills = scene.illustrations ?? []
  const msgIds = new Set(msgs.map((m) => m.id))
  const byMessage = new Map<string, SceneIllustration[]>()
  const orphans: SceneIllustration[] = []
  for (const ill of ills) {
    if (ill.messageId && msgIds.has(ill.messageId)) {
      const list = byMessage.get(ill.messageId) ?? []
      list.push(ill)
      byMessage.set(ill.messageId, list)
    } else {
      orphans.push(ill)
    }
  }
  const illView = (ill: SceneIllustration) => (
    <IllustrationView
      key={ill.id}
      ill={ill}
      onRemove={() => act.removeIllustration(scene.id, ill.id)}
      onRegenerate={() =>
        act.regenerateIllustration(scene.id, ill.messageId, ill.prompt, ill.negative)
      }
    />
  )
  // マーカーは本文を持たず、ターンの境目に薄い水平線（.gen-divider）だけを描く。
  // 小説形式ではユーザー入力の前にも線を1本入れる。シーン先頭（＝直前に本文が無い）では線を出さない（A2）
  let seenContent = false
  const out: JSX.Element[] = []
  for (const m of msgs) {
    const marker = isMarker(m)
    const isSceneStart = m.content === SCENE_START_PROMPT
    const boundary = seenContent && !isSceneStart && (marker || (meta.novel && m.role === 'user'))
    if (boundary) out.push(<div className="gen-divider" key={m.id + '-div'} />)
    if (marker) {
      seenContent = true
      continue
    }
    out.push(
      <Fragment key={m.id}>
        <MessageRow
          m={m}
          meta={meta}
          isStreaming={isStreaming}
          editing={editingId === m.id}
          showIllustButtons={showIllustButtons}
          act={act}
        />
        {(byMessage.get(m.id) ?? []).map(illView)}
      </Fragment>,
    )
    seenContent = true
  }
  return (
    <>
      {out}
      {orphans.map(illView)}
    </>
  )
}

