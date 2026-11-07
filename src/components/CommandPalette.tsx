import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { useModalEscape } from '../lib/modalStack'
import { buildCommands, commandInputFromStore, filterCommands, type Command } from '../lib/commands'
import { goBack, goBackThen, useIsMobile } from '../lib/nav'
import { Icon } from './icons'

/**
 * 「何をしますか」の検索欄と一覧（P9 段2）。PC の重ねて開く版（Ctrl+K）とモバイルのページが共有する。
 * 一覧の中身は `lib/commands.ts`。上下キーで選び Enter で実行する
 */
function CommandList({ onRun, autoFocus }: { onRun: (c: Command) => void; autoFocus: boolean }) {
  // 一覧に効く値だけを購読する（中身は commandInputFromStore が store から読み直す）
  const sessions = useStore((st) => st.sessions)
  const characters = useStore((st) => st.characters)
  const worlds = useStore((st) => st.worlds)
  const view = useStore((st) => st.view)
  const activeId = useStore((st) => st.activeId)
  const isStreaming = useStore((st) => st.isStreaming)
  const isReviewing = useStore((st) => st.isReviewing)
  const immersive = useStore((st) => st.ui.immersive)
  const jobCount = useStore((st) => st.imageJobs.length)
  const mobile = useIsMobile()

  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  const commands = useMemo(
    () => buildCommands(commandInputFromStore()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions, characters, worlds, view, activeId, isStreaming, isReviewing, immersive, jobCount],
  )
  const results = filterCommands(commands, query).slice(0, 60)

  useEffect(() => setIndex(0), [query])
  useEffect(() => {
    listRef.current?.querySelector('.cmdk-item.active')?.scrollIntoView({ block: 'nearest' })
  }, [index])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (results[index]) onRun(results[index])
    }
  }

  return (
    <>
      <div className="cmdk-search">
        <Icon name="search" size={16} />
        <input
          ref={inputRef}
          className="cmdk-input"
          placeholder="物語・キャラクター・操作を探す"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
      </div>
      <div className="cmdk-list" ref={listRef}>
        {results.length === 0 && <div className="cmdk-empty">見つかりません。</div>}
        {results.map((c, i) => (
          <div key={c.id}>
            {(i === 0 || results[i - 1].group !== c.group) && <div className="cmdk-group-head">{c.group}</div>}
            <button
              type="button"
              className={'cmdk-item' + (i === index ? ' active' : '')}
              onMouseEnter={() => setIndex(i)}
              onClick={() => onRun(c)}
            >
              <Icon name={c.icon} size={16} />
              <span className="cmdk-item-label">{c.label}</span>
              {!mobile && c.shortcut && <kbd className="cmdk-kbd">{c.shortcut}</kbd>}
            </button>
          </div>
        ))}
      </div>
    </>
  )
}

/** PC: Ctrl+K で本文の上に重ねて開く */
export default function CommandPalette({ onClose }: { onClose: () => void }) {
  useModalEscape(onClose)
  return (
    <div className="cmdk-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cmdk-box" role="dialog" aria-label="何をしますか">
        <CommandList
          autoFocus
          onRun={(c) => {
            onClose()
            c.run()
          }}
        />
      </div>
    </div>
  )
}

/** モバイル: 右上の「メニュー」で開く1枚のページ。戻るで元の画面へ */
export function MenuPage() {
  return (
    <div className="shell-page menu-page">
      <header className="shell-head">
        <h1 className="shell-title">何をしますか</h1>
        <div className="shell-head-end">
          <button className="btn ghost" onClick={goBack}>
            閉じる
          </button>
        </div>
      </header>
      <div className="menu-body">
        <CommandList
          autoFocus={false}
          // 先にメニューを閉じて元の画面へ戻ってから実行する（メニューは履歴に残さない）
          onRun={(c) => goBackThen(c.run)}
        />
      </div>
    </div>
  )
}
