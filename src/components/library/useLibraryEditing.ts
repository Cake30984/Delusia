import { useEffect, useRef, useState } from 'react'
import { appConfirm } from '../../lib/dialogs'
import { useIsMobile, useOverlays } from '../../lib/nav'

/**
 * キャラクターと世界観のページの「一覧で選んで、右（モバイルは1枚）で直す」の選び方（P9 段7）。
 * - 直しかけ（未保存）のまま別のものを選ぶ・一覧へ戻るときは確かめる
 * - PC は何も選んでいなければ先頭を開く（右の列を空けておかない）
 * - 物語の画面から指名されたもの（`useOverlays.libraryFocusId`）を開く
 * - ページ上端の「＋作る」（`createSeq` が増える）で新しいものを開く
 */
export function useLibraryEditing<T extends { id: string }>(items: T[], createNew: () => T, createSeq: number) {
  const mobile = useIsMobile()
  const [editing, setEditing] = useState<T | null>(null)
  const dirty = useRef(false)
  const focusId = useOverlays((o) => o.libraryFocusId)

  const select = async (item: T | null) => {
    if (
      dirty.current &&
      !(await appConfirm({ message: '直した内容を保存せずに離れますか？', okLabel: '保存せずに離れる', danger: true }))
    )
      return false
    dirty.current = false
    setEditing(item)
    return true
  }

  // 物語の画面から指名された
  useEffect(() => {
    if (!focusId) return
    const hit = items.find((x) => x.id === focusId)
    useOverlays.getState().setLibraryFocusId(null)
    if (hit) void select(hit)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId])

  // PC は先頭を開いておく。開いていたものが消えたら（削除）先頭へ
  useEffect(() => {
    if (mobile) return
    if (!editing && items.length > 0 && !focusId) setEditing(items[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobile, items.length])

  // 「＋作る」。開いたあとに押されたときだけ（ほかのタブで押した回数を持ち込まない）
  const seqAtMount = useRef(createSeq)
  useEffect(() => {
    if (createSeq !== seqAtMount.current) void select(createNew())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createSeq])

  return {
    mobile,
    editing,
    select,
    /** 編集の画面から未保存の有無を受け取る */
    onDirty: (d: boolean) => {
      dirty.current = d
    },
    /** 削除などで今開いているものを閉じる（確かめない） */
    close: () => {
      dirty.current = false
      setEditing(null)
    },
  }
}
