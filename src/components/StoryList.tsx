import { useState } from 'react'
import { storeActions, useListStore, useStore } from '../store'
import { parseCardPng } from '../lib/cards'
import { useCardDrop } from '../lib/useCardDrop'
import { useMultiSelect } from '../lib/useMultiSelect'
import { appConfirm } from '../lib/dialogs'
import { Icon } from './icons'
import MenuPopover from './MenuPopover'
import type { SessionMode } from '../types'
import SessionEditor from './SessionEditor'
import CassetteEditor from './CassetteEditor'

/** 一覧に要るセッションの見出しだけ（本文は含めない。P2b） */
interface SessionRow {
  id: string
  title: string
  mode: SessionMode
  archived: boolean
  /** 参加キャラの id を連結したもの（行はプリミティブだけで持つ＝配列を入れると毎回不一致になる） */
  castKey: string
  messageCount: number
}

/**
 * 物語の一覧（P9 段2 でサイドバーからホームへ移した）。検索・右クリックの操作・複数選択・
 * カセットの PNG の取り込みは今のまま。見た目の作り直しは段6（ホーム）
 */
export default function StoryList() {
  const characters = useStore((st) => st.characters)
  // 一覧が読むのは見出しだけ。**本文（messages）を購読しない**＝ストリーミングの
  // 1チャンクごとに一覧全体を描き直さない（P2b）
  const rows = useListStore<SessionRow>((st) =>
    st.sessions.map((s) => ({
      id: s.id,
      title: s.title,
      mode: s.mode,
      archived: !!s.archived,
      castKey: s.characterIds.join('\u0000'),
      messageCount: s.messages.length,
    })),
  )
  const { setActive, updateSession, deleteSession, importCassette } = storeActions()
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [cassetteSeedId, setCassetteSeedId] = useState<string | null>(null)

  // カセット（PNG）のドロップ受付
  const handleFiles = async (files: FileList) => {
    for (const file of Array.from(files)) {
      if (!file.type.includes('png') && !file.name.toLowerCase().endsWith('.png')) continue
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const parsed = parseCardPng(bytes)
        if (parsed?.kind === 'cassette') {
          await importCassette(parsed.bundle, new Blob([bytes as BlobPart], { type: 'image/png' }))
          setNotice(`ゲームカセット「${parsed.bundle.session.title || '無題'}」を棚に登録しました（「カセット」から遊べます）。`)
        } else {
          throw new Error('ゲームカセットではありません。')
        }
      } catch (e) {
        setNotice(`読み込み失敗：${(e as Error).message}`)
      }
    }
  }
  const { dragOver, dropProps } = useCardDrop(handleFiles)

  const castIdsOf = (row: SessionRow) => (row.castKey ? row.castKey.split('\u0000') : [])
  const q = query.trim().toLowerCase()
  const matchesQuery = (s: SessionRow) => {
    if (!q) return true
    if ((s.title || '').toLowerCase().includes(q)) return true
    return castIdsOf(s).some((id) =>
      (characters.find((c) => c.id === id)?.name ?? '').toLowerCase().includes(q),
    )
  }
  const archivedCount = rows.filter((s) => s.archived).length
  const visible = rows.filter((s) => (showArchived || !s.archived) && matchesQuery(s))

  const { selected, clear, handleClick, selectForContext } = useMultiSelect(visible.map((s) => s.id))

  const bulkDelete = async (ids: string[]) => {
    if (
      !(await appConfirm({
        message: `選択した${ids.length}件の物語を削除しますか？\nこの操作は元に戻せません。`,
        danger: true,
      }))
    )
      return
    ids.forEach((id) => deleteSession(id))
    clear()
  }
  const bulkArchive = (ids: string[], archived: boolean) => {
    ids.forEach((id) => updateSession(id, { archived }))
    clear()
  }

  const ctxSession = ctxMenu ? rows.find((s) => s.id === ctxMenu.id) : undefined
  const ctxMulti = ctxMenu ? selected.has(ctxMenu.id) && selected.size > 1 : false
  // 編集・カセット化はセッション全体が要るので、開いている間だけ本体を購読する
  const editingSession = useStore((st) =>
    editingId ? st.sessions.find((s) => s.id === editingId) : undefined,
  )
  const cassetteSeed = useStore((st) =>
    cassetteSeedId ? st.sessions.find((s) => s.id === cassetteSeedId) : undefined,
  )

  return (
    <section
      className="story-list"
      {...dropProps}
      style={dragOver ? { outline: '2px dashed var(--accent)', outlineOffset: -4 } : undefined}
    >
      <div className="story-list-search">
        <input
          className="model-search"
          placeholder="物語の名前・キャラクター名で探す"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {selected.size >= 2 && (
        <div className="sidebar-sel-bar">
          <span>{selected.size} 件選択</span>
          <div style={{ flex: 1 }} />
          <button className="btn danger" onClick={() => bulkDelete([...selected])}>
            <Icon name="trash-2" size={12} /> 削除
          </button>
          <button className="icon-btn small" title="選択を解除" onClick={clear}>
            <Icon name="x" size={13} />
          </button>
        </div>
      )}

      <div className="session-list">
        {notice && <p style={{ color: 'var(--accent)', fontSize: 13, padding: '4px 12px' }}>{notice}</p>}
        {rows.length === 0 && (
          <p style={{ color: 'var(--text-faint)', fontSize: 14, padding: '8px 12px' }}>まだ物語がありません。</p>
        )}
        {rows.length > 0 && visible.length === 0 && (
          <p style={{ color: 'var(--text-faint)', fontSize: 14, padding: '8px 12px' }}>見つかりません。</p>
        )}
        {visible.map((s) => {
          const cast = castIdsOf(s)
            .map((id) => characters.find((c) => c.id === id)?.name)
            .filter(Boolean)
          return (
            <div
              key={s.id}
              className={
                'session-item' + (s.archived ? ' archived' : '') + (selected.has(s.id) ? ' selected' : '')
              }
              onClick={(e) => {
                if (handleClick(e, s.id)) return
                setActive(s.id)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                selectForContext(s.id)
                setCtxMenu({ id: s.id, x: e.clientX, y: e.clientY })
              }}
            >
              <div className="title">{s.title || '無題'}</div>
              <div className="meta">
                <span className={'badge ' + s.mode}>{s.mode === 'roleplay' ? 'ロールプレイ' : '物語'}</span>
                {s.archived && <span className="badge">アーカイブ</span>}
                {cast.length > 0 && <span className="cast">{cast.join('・')}</span>}
                <span title="この物語の発言数">発言 {s.messageCount}</span>
              </div>
              {/* 右クリックが無い端末（タッチ）向けの入口。右クリックと同じメニューを開く */}
              <button
                className="icon-btn small session-item-more"
                title="操作"
                onClick={(e) => {
                  e.stopPropagation()
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  setCtxMenu({ id: s.id, x: r.left, y: r.bottom })
                }}
              >
                <Icon name="more-horizontal" size={16} />
              </button>
            </div>
          )
        })}
      </div>

      {archivedCount > 0 && (
        <div className="sidebar-archive-toggle">
          <button className="btn" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? 'アーカイブ済みを隠す' : `アーカイブ済み (${archivedCount}) を表示`}
          </button>
        </div>
      )}

      {/* 複数選択時の一括メニュー（FB2-D） */}
      {ctxMenu && ctxSession && ctxMulti && (
        <MenuPopover position={{ x: ctxMenu.x, y: ctxMenu.y }} onClose={() => setCtxMenu(null)}>
          <button
            className="menu-item"
            onClick={() => {
              bulkArchive([...selected], true)
              setCtxMenu(null)
            }}
          >
            <Icon name="archive" size={15} /> 選択した {selected.size} 件をアーカイブ
          </button>
          <button
            className="menu-item danger"
            onClick={() => {
              const ids = [...selected]
              setCtxMenu(null)
              void bulkDelete(ids)
            }}
          >
            <Icon name="trash-2" size={15} /> 選択した {selected.size} 件を削除
          </button>
        </MenuPopover>
      )}

      {/* 物語の右クリックメニュー（F3/R14）。物語の画面の ⋯ メニューと両導線 */}
      {ctxMenu && ctxSession && !ctxMulti && (
        <MenuPopover position={{ x: ctxMenu.x, y: ctxMenu.y }} onClose={() => setCtxMenu(null)}>
          <button
            className="menu-item"
            onClick={() => {
              setActive(ctxMenu.id)
              setCtxMenu(null)
            }}
          >
            <Icon name="book-open" size={15} /> 開く
          </button>
          <button
            className="menu-item"
            onClick={() => {
              setEditingId(ctxMenu.id)
              setCtxMenu(null)
            }}
          >
            <Icon name="settings" size={15} /> 物語の設定
          </button>
          <button
            className="menu-item"
            onClick={() => {
              setCassetteSeedId(ctxMenu.id)
              setCtxMenu(null)
            }}
          >
            <Icon name="library-big" size={15} /> カセットにする…
          </button>
          <button
            className="menu-item"
            onClick={() => {
              updateSession(ctxMenu.id, { archived: !ctxSession.archived })
              setCtxMenu(null)
            }}
          >
            <Icon name="archive" size={15} /> {ctxSession.archived ? 'アーカイブから戻す' : 'アーカイブする'}
          </button>
          <button
            className="menu-item danger"
            onClick={async () => {
              const id = ctxMenu.id
              setCtxMenu(null)
              if (await appConfirm({ message: 'この物語を削除しますか？', danger: true })) deleteSession(id)
            }}
          >
            <Icon name="trash-2" size={15} /> 削除
          </button>
        </MenuPopover>
      )}

      {editingSession && <SessionEditor session={editingSession} onClose={() => setEditingId(null)} />}
      {cassetteSeed && <CassetteEditor seedSession={cassetteSeed} onClose={() => setCassetteSeedId(null)} />}
    </section>
  )
}
