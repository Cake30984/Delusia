import { useState } from 'react'
import { storeActions, useStore } from '../../store'
import { appConfirm } from '../../lib/dialogs'
import { closeStoryPanel, openSettings, openStoryPanel, useIsMobile, useOverlays } from '../../lib/nav'
import type { DockTab } from '../../types'
import ActivityIndicator from '../ActivityIndicator'
import MenuPopover from '../MenuPopover'
import { CommandButton } from '../PageHeader'
import { Icon } from '../icons'

interface Props {
  sessionId: string
  title: string
  mode: 'story' | 'roleplay'
  archived: boolean
  ended: boolean
  chapterNumber: number
}

/**
 * 読書画面の上端（P9 段3）。PC は現在地（デルシア / 物語 / 第N章）と右側の操作、
 * モバイルは題と「メニュー」だけ（ほかの操作は「何をしますか」から）。
 * 本文は受け取らない＝書いている最中に描き直さない
 */
export default function ReaderHeader({ sessionId, title, mode, archived, ended, chapterNumber }: Props) {
  const mobile = useIsMobile()
  const dockTab = useStore((st) => st.ui.dockTab)
  const imageJobCount = useStore((st) => st.imageJobs.length)
  const { setView, updateSession, deleteSession } = storeActions()
  const { setReaderModal } = useOverlays()
  const [showMenu, setShowMenu] = useState(false)
  const [lastTab, setLastTab] = useState<DockTab>('status')

  const name = title || '無題の物語'
  const chapter = chapterNumber > 0 ? `第${chapterNumber}章` : ''

  if (mobile) {
    return (
      <header className="reader-head">
        <div className="reader-crumb mobile">
          <span className="reader-crumb-title">{name}</span>
          {chapter && <span className="reader-crumb-sep">·</span>}
          {chapter && <span>{chapter}</span>}
        </div>
        <CommandButton />
      </header>
    )
  }

  const pick = (fn: () => void) => () => {
    setShowMenu(false)
    fn()
  }

  return (
    <header className="reader-head">
      <nav className="reader-crumb" aria-label="現在地">
        <button className="reader-crumb-link" onClick={() => setView('home')}>
          デルシア
        </button>
        <span className="reader-crumb-sep">/</span>
        <button className="reader-crumb-link current" onClick={() => setReaderModal('editor')} title="物語の設定">
          {name}
        </button>
        {chapter && (
          <>
            <span className="reader-crumb-sep">/</span>
            <span className="reader-crumb-chapter">{chapter}</span>
          </>
        )}
      </nav>
      <div className="reader-head-end">
        <ActivityIndicator />
        {/* 状況・分岐・挿絵のパネル（右に重ねて開く） */}
        <button
          className={'icon-btn' + (dockTab ? ' on' : '')}
          onClick={() => {
            if (dockTab) {
              setLastTab(dockTab)
              closeStoryPanel()
            } else openStoryPanel(lastTab)
          }}
          title={dockTab ? 'パネルを閉じる' : '状況・分岐・挿絵を開く'}
        >
          <Icon name="panel-right" />
          {imageJobCount > 0 && <span className="icon-badge">{imageJobCount}</span>}
        </button>
        {/* 文字の大きさ・行の間隔・色・書体は表示と設定の「表示」へ（P9 段8） */}
        <button className="icon-btn" onClick={() => openSettings('display')} title="表示（文字の大きさ・色・書体）">
          Aa
        </button>
        <div className="menu-anchor">
          <button className="icon-btn" onClick={() => setShowMenu((v) => !v)} title="この物語の操作">
            <Icon name="more-horizontal" />
          </button>
          {showMenu && (
            <MenuPopover onClose={() => setShowMenu(false)}>
              <button className="menu-item" onClick={pick(() => setReaderModal('log'))}>
                <Icon name="scroll-text" size={15} /> あらすじ
              </button>
              {mode === 'story' && !ended && (
                <button className="menu-item" onClick={pick(() => setReaderModal('ending'))}>
                  <Icon name="flag" size={15} /> 終わり方を考える…
                </button>
              )}
              <button className="menu-item" onClick={pick(() => setReaderModal('export'))}>
                <Icon name="download" size={15} /> 物語を書き出す…
              </button>
              <button className="menu-item" onClick={pick(() => setReaderModal('cassette'))}>
                <Icon name="library-big" size={15} /> カセットにする…
              </button>
              <div className="menu-sep" />
              <button className="menu-item" onClick={pick(() => setReaderModal('editor'))}>
                <Icon name="settings" size={15} /> 物語の設定
              </button>
              <button className="menu-item" onClick={pick(() => updateSession(sessionId, { archived: !archived }))}>
                <Icon name="archive" size={15} /> {archived ? 'アーカイブから戻す' : 'アーカイブする'}
              </button>
              <button
                className="menu-item danger"
                onClick={pick(async () => {
                  if (await appConfirm({ message: 'この物語を削除しますか？', danger: true })) deleteSession(sessionId)
                })}
              >
                <Icon name="trash-2" size={15} /> 物語を削除
              </button>
            </MenuPopover>
          )}
        </div>
        <CommandButton />
      </div>
    </header>
  )
}
