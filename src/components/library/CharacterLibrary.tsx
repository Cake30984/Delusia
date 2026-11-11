import { useState } from 'react'
import { newCharacter, storeActions, useListStore, useStore } from '../../store'
import CharacterEditor from './CharacterEditor'
import EntityAvatar from '../EntityAvatar'
import { parseCardPng, attachCardImage } from '../../lib/cards'
import { useCardDrop } from '../../lib/useCardDrop'
import { useMultiSelect } from '../../lib/useMultiSelect'
import { appConfirm } from '../../lib/dialogs'
import { SelectionBar, CardContextMenu } from './LibraryMultiSelect'
import { useLibraryEditing } from './useLibraryEditing'

/**
 * キャラクター（P9 段7）。PC は左に一覧・右にその場で直す編集、モバイルは一覧と1枚の編集。
 * 一覧は 名前で探す・カード（PNG）の取り込み（ドラッグ＆ドロップ）・右クリックの複製と削除・複数選択
 */
export default function CharacterLibrary({ createSeq }: { createSeq: number }) {
  const characters = useStore((st) => st.characters)
  // どの物語に出ているか（件数だけ）。本文は読まない
  const casts = useListStore((st) => st.sessions.map((s) => ({ ids: s.characterIds.join('\u0000') })))
  const { importCharacterCard, deleteCharacter, duplicateCharacter } = storeActions()
  const { mobile, editing, select, onDirty, close } = useLibraryEditing(characters, newCharacter, createSeq)
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [ctxMenu, setCtxMenu] = useState<{ id: string; x: number; y: number } | null>(null)

  const handleFiles = async (files: FileList) => {
    for (const file of Array.from(files)) {
      if (!file.type.includes('png') && !file.name.toLowerCase().endsWith('.png')) continue
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const parsed = parseCardPng(bytes)
        if (!parsed || parsed.kind !== 'character') throw new Error('キャラクターのカードが見つかりません。')
        const withImage = await attachCardImage(parsed.character, bytes)
        importCharacterCard(withImage)
        setNotice(`カードから「${withImage.name || '無名'}」を追加しました。`)
      } catch (e) {
        setNotice(`読み込めませんでした：${(e as Error).message}`)
      }
    }
  }
  const { dragOver, dropProps } = useCardDrop(handleFiles)

  const q = query.trim().toLowerCase()
  const visible = characters.filter((c) => {
    if (!q) return true
    if ((c.name || '').toLowerCase().includes(q)) return true
    return c.tags.some((t) => t.toLowerCase().includes(q))
  })
  const { selected, clear, handleClick, selectForContext } = useMultiSelect(visible.map((c) => c.id))
  const storyCount = (id: string) => casts.filter((s) => s.ids.split('\u0000').includes(id)).length

  const doDelete = async (ids: string[]) => {
    const names = ids
      .map((id) => characters.find((c) => c.id === id)?.name || '無名')
      .slice(0, 5)
      .join('・')
    const more = ids.length > 5 ? ` ほか${ids.length - 5}件` : ''
    if (
      !(await appConfirm({
        message: `キャラクター${ids.length}件（${names}${more}）を削除しますか？\nこの操作は元に戻せません。`,
        danger: true,
      }))
    )
      return
    ids.forEach((id) => deleteCharacter(id))
    if (editing && ids.includes(editing.id)) close()
    clear()
  }

  // 複製（G4-a）。編集は開かず一覧に増やすだけ＝一括複製と挙動を揃える
  const doDuplicate = (ids: string[]) => {
    ids.forEach((id) => duplicateCharacter(id))
    setNotice(ids.length > 1 ? `キャラクター ${ids.length} 件を複製しました。` : 'キャラクターを複製しました。')
    clear()
  }

  const editor = editing && (
    <CharacterEditor
      key={editing.id}
      character={editing}
      inline
      onBack={mobile ? () => void select(null) : undefined}
      onClose={close}
      onDirty={onDirty}
    />
  )

  // モバイルは選んだら1枚の編集
  if (mobile && editing) return <div className="lib-single">{editor}</div>

  return (
    <div className="lib-layout">
      <div className={'lib-list' + (dragOver ? ' drag-over' : '')} {...dropProps}>
        {characters.length > 0 && (
          <input
            type="search"
            className="lib-search"
            aria-label="キャラクターを探す"
            placeholder="名前やタグで探す"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
        {notice && <p className="notice">{notice}</p>}
        <SelectionBar count={selected.size} noun="キャラクター" onDelete={() => doDelete([...selected])} onClear={clear} />
        {characters.length === 0 ? (
          <p className="lib-empty">
            まだキャラクターがいません。「キャラクターを作る」から作るか、キャラクターのカード（PNG）をここへドラッグしてください。
          </p>
        ) : visible.length === 0 ? (
          <p className="lib-empty">見つかりません。</p>
        ) : (
          visible.map((c) => {
            const n = storyCount(c.id)
            return (
              <button
                key={c.id}
                className={
                  'lib-row' + (editing?.id === c.id ? ' on' : '') + (selected.has(c.id) ? ' selected' : '')
                }
                aria-current={editing?.id === c.id ? 'true' : undefined}
                onClick={(e) => {
                  if (handleClick(e, c.id)) return
                  void select(c)
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  selectForContext(c.id)
                  setCtxMenu({ id: c.id, x: e.clientX, y: e.clientY })
                }}
              >
                <EntityAvatar className="lib-row-avatar" avatar={c.avatar} name={c.name || '無'} />
                <span className="lib-row-text">
                  <span className="lib-row-name">{c.name || '無名'}</span>
                  <small>
                    {[c.persona.split('\n')[0].slice(0, 28), n > 0 ? `${n}つの物語に登場` : ''].filter(Boolean).join('　')}
                  </small>
                </span>
              </button>
            )
          })
        )}
        {characters.length > 0 && !mobile && (
          <p className="lib-hint">キャラクターのカード（PNG）を一覧へドラッグすると読み込めます。</p>
        )}
        {mobile && <p className="lib-hint">スマートフォンでは見る・少し直すまで。新しく作り込むときはパソコンが向いています。</p>}
      </div>

      {!mobile &&
        (editor || <div className="lib-editor-empty">一覧から選ぶと、ここで直せます。</div>)}

      {ctxMenu && (
        <CardContextMenu
          pos={{ x: ctxMenu.x, y: ctxMenu.y }}
          count={selected.has(ctxMenu.id) ? selected.size : 1}
          noun="キャラクター"
          onEdit={() => {
            const c = characters.find((x) => x.id === ctxMenu.id)
            if (c) void select(c)
          }}
          onDuplicate={() => doDuplicate(selected.has(ctxMenu.id) && selected.size > 0 ? [...selected] : [ctxMenu.id])}
          onDelete={() => doDelete(selected.has(ctxMenu.id) && selected.size > 0 ? [...selected] : [ctxMenu.id])}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  )
}
