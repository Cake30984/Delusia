import type { ReactNode } from 'react'
import { storeActions, useStore } from '../store'
import { openCommands, useIsMobile } from '../lib/nav'
import ActivityIndicator from './ActivityIndicator'
import { Icon } from './icons'

/**
 * 「何をしますか」を開くボタン（P9 段2）。PC は重ねて開き（Ctrl+K）、モバイルは「メニュー」のページへ。
 * 常設のナビを置かない代わりに、どの画面の右上にもこれがある
 */
export function CommandButton() {
  const mobile = useIsMobile()
  return (
    <button
      className="btn command-btn"
      onClick={openCommands}
      title={mobile ? undefined : '何をしますか（Ctrl+K）'}
    >
      {mobile ? (
        'メニュー'
      ) : (
        <>
          <Icon name="search" size={14} /> 何をしますか <kbd>Ctrl K</kbd>
        </>
      )}
    </button>
  )
}

/** ホームへ戻るボタン。ホームでは出さない */
export function HomeButton() {
  const view = useStore((st) => st.view)
  const { setView } = storeActions()
  if (view === 'home') return null
  return (
    <button className="icon-btn" onClick={() => setView('home')} title="ホーム">
      <Icon name="home" size={18} />
    </button>
  )
}

/** 物語以外のページの上端（ホーム・題・右側の操作・進行状態・何をしますか） */
export default function PageHeader({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <header className="shell-head">
      <HomeButton />
      <h1 className="shell-title">{title}</h1>
      <div className="shell-head-end">
        {children}
        <ActivityIndicator />
        <CommandButton />
      </div>
    </header>
  )
}
