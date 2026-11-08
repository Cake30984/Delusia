import { memo } from 'react'

/**
 * PC の左の章の一覧（P9 段3）。押すとその章の見出しへ移る（畳まれた章は開く）。
 * 本文（messages）は受け取らない＝書いている最中に描き直さない
 */
function ChapterList({
  chapters,
  currentId,
  onJump,
}: {
  chapters: { id: string; title: string }[]
  currentId: string | null
  onJump: (sceneId: string) => void
}) {
  if (chapters.length === 0) return null
  return (
    <nav className="chapter-list" aria-label="章">
      {chapters.map((c, i) => (
        <button
          key={c.id}
          className={'chapter-link' + (c.id === currentId ? ' current' : '')}
          aria-current={c.id === currentId ? 'location' : undefined}
          onClick={() => onJump(c.id)}
        >
          <span className="chapter-link-num">第{i + 1}章</span>
          <span className="chapter-link-title">{c.title || '無題の章'}</span>
        </button>
      ))}
    </nav>
  )
}

export default memo(ChapterList)
