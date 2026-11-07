import { useEffect } from 'react'
import { currentScene, useStore } from '../store'
import { modalStackSize } from './modalStack'
import { isMobileWidth, useOverlays } from './nav'

/**
 * グローバルショートカット（UI-7）。App.tsx から1回だけ登録する単一 keydown リスナ。
 * 判定規則: ① isComposing は無視 ② input/textarea/select にフォーカス中は Ctrl 系のみ許可
 * （Escape は没入解除のため例外） ③ モーダルが1枚でも開いている間は Escape 以外無効
 * （Escape 自体は各モーダルの useModalEscape が最前面優先で処理する）。
 */
export function useGlobalShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) return

      // Ctrl+. の没入トグルと違い、Escape での没入解除はモーダルが無い時だけ・フィールド内でも有効。
      // ただし一覧の選択解除（useMultiSelect）が先に処理していたら何もしない（FB3-A5）
      if (e.key === 'Escape') {
        if (e.defaultPrevented) return
        if (modalStackSize() === 0 && useStore.getState().ui.immersive) {
          useStore.getState().setUiPrefs({ immersive: false })
        }
        return
      }

      const target = e.target as HTMLElement | null
      const isField = !!target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
      const ctrl = e.ctrlKey || e.metaKey
      if (isField && !ctrl) return
      if (modalStackSize() > 0) return
      if (!ctrl) return

      const key = e.key.toLowerCase()

      if (key === 'k') {
        e.preventDefault()
        // 「何をしますか」。モバイルの骨組み（キーボードをつないだタブレット等）ではメニューのページへ
        if (isMobileWidth()) useStore.getState().setView('menu')
        else useOverlays.getState().setPaletteOpen(!useOverlays.getState().paletteOpen)
        return
      }

      if (key === '.') {
        e.preventDefault()
        const ui = useStore.getState().ui
        useStore.getState().setUiPrefs({ immersive: !ui.immersive })
        return
      }

      if (e.key === '1') {
        // 読んでいる物語へ。開く物語が無ければホーム
        e.preventDefault()
        const st = useStore.getState()
        st.setView(st.sessions.some((s) => s.id === st.activeId) ? 'sessions' : 'home')
        return
      }
      if (e.key === '2') {
        e.preventDefault()
        useStore.getState().setView('characters')
        return
      }
      if (e.key === '3') {
        e.preventDefault()
        useStore.getState().setView('system')
        return
      }

      if (key === 'g') {
        e.preventDefault()
        const st = useStore.getState()
        const session = st.sessions.find((s) => s.id === st.activeId)
        // 読んでいる画面でだけ（別の画面で押して裏で進むと分からなくなる）
        if (st.view !== 'sessions') return
        if (!session || session.mode !== 'story' || st.isStreaming) return
        const scene = currentScene(session)
        const storyStarted = session.messages.some((m) => m.sceneId === scene?.id)
        if (storyStarted) void st.continueStory()
        else void st.startStory()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
