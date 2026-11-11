import { useState } from 'react'
import { newWorld, storeActions, useListStore, useStore } from '../../store'
import WorldEditor from './WorldEditor'
import { parseCardPng } from '../../lib/cards'
import { useCardDrop } from '../../lib/useCardDrop'
import { useMultiSelect } from '../../lib/useMultiSelect'
import { appConfirm } from '../../lib/dialogs'
import { SelectionBar, CardContextMenu } from './LibraryMultiSelect'
import { useLibraryEditing } from './useLibraryEditing'
import { Icon } from '../icons'

/**
 * 世界観（P9 段7）。PC は左に一覧・右にその場で直す編集、モバイルは一覧と1枚の編集。
 * 一覧は 名前で探す・カード（PNG）の取り込み・右クリックの複製と削除・複数選択
 */
export default function WorldLibrary({ createSeq }: { createSeq: number }) {
  const worlds = useStore((st) => st.worlds)
  const used = useListStore((st) => st.sessions.map((s) => ({ w: s.worldId ?? '' })))
  const { importWorldCard, deleteWorld, duplicateWorld } = storeActions()
  const { mobile, editing, select, onDirty, close } = useLibraryEditing(worlds, newWorld, createSeq)
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [ctxMenu, setCtxMenu] = useState<{ id: string; x: number; y: number } | null>(null)

  const handleFiles = async (files: FileList) => {
    for (const file of Array.from(files)) {
      if (!file.type.includes('png') && !file.name.toLowerCase().endsWith('.png')) continue
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const parsed = parseCardPng(bytes)
        if (!parsed || parsed.kind !== 'world') throw new Error('世界観のカードが見つかりません。')
        importWorldCard(parsed.world)
        setNotice(`カードから「${parsed.world.name || '無名の世界'}」を追加しました。`)
      } catch (e) {
        setNotice(`読み込めませんでした：${(e as Error).message}`)
      }
    }
  }
  const { dragOver, dropProps } = useCardDrop(handleFiles)

  const q = query.trim().toLowerCase()
  const visible = worlds.filter((w) => !q || (w.name || '').toLowerCase().includes(q))
  const { selected, clear, handleClick, selectForContext } = useMultiSelect(visible.map((w) => w.id))
  const storyCount = (id: string) => used.filter((s) => s.w === id).length

  const doDelete = async (ids: string[]) => {
    const names = ids
      .map((id) => worlds.find((w) => w.id === id)?.name || '無名の世界')
      .slice(0, 5)
      .join('・')
    const more = ids.length > 5 ? ` ほか${ids.length - 5}件` : ''
    if (
      !(await appConfirm({
        message: `世界観${ids.length}件（${names}${more}）を削除しますか？\nこの操作は元に戻せません。`,
        danger: true,
      }))
    )
      return
    ids.forEach((id) => deleteWorld(id))
    if (editing && ids.includes(editing.id)) close()
    clear()
  }

  // 複製（G4-a）。編集は開かず一覧に増やすだけ＝一括複製と挙動を揃える
  const doDuplicate = (ids: string[]) => {
    ids.forEach((id) => duplicateWorld(id))
    setNotice(ids.length > 1 ? `世界観 ${ids.length} 件を複製しました。` : '世界観を複製しました。')
    clear()
  }

  const editor = editing && (
    <WorldEditor
      key={editing.id}
      world={editing}
      inline
      // 世界観の編集は戻る前に自分で確かめるので、ここでは確かめずに一覧へ
      onBack={
        mobile
          ? () => {
              onDirty(false)
              void select(null)
            }
          : undefined
      }
      onClose={close}
      onDirty={onDirty}
    />
  )

  if (mobile && editing) return <div className="lib-single">{editor}</div>

  return (
    <div className="lib-layout">
      <div className={'lib-list' + (dragOver ? ' drag-over' : '')} {...dropProps}>
        {worlds.length > 0 && (
          <input
            type="search"
            className="lib-search"
            aria-label="世界観を探す"
            placeholder="名前で探す"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
        {notice && <p className="notice">{notice}</p>}
        <SelectionBar count={selected.size} noun="世界観" onDelete={() => doDelete([...selected])} onClear={clear} />
        {worlds.length === 0 ? (
          <p className="lib-empty">
            世界観を作ると、いくつもの物語で同じ舞台を使えます。「世界観を作る」から作るか、世界観のカード（PNG）をここへドラッグしてください。
          </p>
        ) : visible.length === 0 ? (
          <p className="lib-empty">見つかりません。</p>
        ) : (
          visible.map((w) => {
            const n = storyCount(w.id)
            return (
              <button
                key={w.id}
                className={'lib-row' + (editing?.id === w.id ? ' on' : '') + (selected.has(w.id) ? ' selected' : '')}
                aria-current={editing?.id === w.id ? 'true' : undefined}
                onClick={(e) => {
                  if (handleClick(e, w.id)) return
                  void select(w)
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  selectForContext(w.id)
                  setCtxMenu({ id: w.id, x: e.clientX, y: e.clientY })
                }}
              >
                <span className="lib-row-avatar icon">
                  <Icon name="globe" size={18} />
                </span>
                <span className="lib-row-text">
                  <span className="lib-row-name">{w.name || '無名の世界'}</span>
                  <small>
                    {[`設定 ${w.entries.length}件`, n > 0 ? `${n}つの物語で使用` : ''].filter(Boolean).join('　')}
                  </small>
                </span>
              </button>
            )
          })
        )}
        {worlds.length > 0 && !mobile && (
          <p className="lib-hint">世界観のカード（PNG）を一覧へドラッグすると読み込めます。</p>
        )}
      </div>

      {!mobile && (editor || <div className="lib-editor-empty">一覧から選ぶと、ここで直せます。</div>)}

      {ctxMenu && (
        <CardContextMenu
          pos={{ x: ctxMenu.x, y: ctxMenu.y }}
          count={selected.has(ctxMenu.id) ? selected.size : 1}
          noun="世界観"
          onEdit={() => {
            const w = worlds.find((x) => x.id === ctxMenu.id)
            if (w) void select(w)
          }}
          onDuplicate={() => doDuplicate(selected.has(ctxMenu.id) && selected.size > 0 ? [...selected] : [ctxMenu.id])}
          onDelete={() => doDelete(selected.has(ctxMenu.id) && selected.size > 0 ? [...selected] : [ctxMenu.id])}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  )
}
