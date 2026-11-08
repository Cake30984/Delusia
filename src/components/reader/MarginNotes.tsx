import { useStore } from '../../store'
import { sceneCharsOf } from '../../lib/prompts'
import { lengthLevel } from '../../lib/tokens'
import { formatSessionUsage } from '../../lib/cost'
import type { DockTab, Session } from '../../types'

/**
 * PC の右の余白の注記（P9 段3）。いまの時と場所・居合わせている人・分かったこと・章の分量・累計。
 * 押すと右のパネルの該当するタブを開く。段落ごとの操作（やり直す・挿絵・別の道）は
 * 段落に重ねたときに同じ余白へ出る（StoryBody の msg-actions を CSS で余白へ置く）
 */
export default function MarginNotes({ session }: { session: Session }) {
  const characters = useStore((st) => st.characters)
  const setUiPrefs = useStore((st) => st.setUiPrefs)
  const open = (tab: DockTab) => setUiPrefs({ dockTab: tab })

  const st = session.state
  const scene = session.scenes.find((s) => s.id === session.currentSceneId)
  const when = [st?.now?.trim() || scene?.timeLabel, st?.place?.trim()].filter(Boolean) as string[]
  const present = (st?.presentIds ?? [])
    .map((id) => characters.find((c) => c.id === id)?.name)
    .filter((n): n is string => !!n)

  // 分かったこと: いちばん新しいものを2件まで（世界観の発見 → 人物の深まりの順で後ろから）
  const found: string[] = []
  const lore = session.overlay?.lore ?? []
  for (let i = lore.length - 1; i >= 0 && found.length < 2; i--) {
    const t = lore[i].content.split('\n')[0].trim()
    if (t) found.push(t)
  }
  for (const g of [...(session.overlay?.characterDevelopments ?? [])].reverse()) {
    for (let i = g.developments.length - 1; i >= 0 && found.length < 2; i--) {
      const t = g.developments[i].text.trim()
      if (t) found.push(t)
    }
  }

  const chars = sceneCharsOf(session)
  const lvl = lengthLevel(chars)
  const usage = formatSessionUsage(session.usage)

  return (
    <div className="margin-notes">
      {when.length > 0 && (
        <button className="margin-note" onClick={() => open('status')} title="いまの状況を見る">
          {when.map((w, i) => (
            <span key={i} className="margin-note-line">
              {w}
            </span>
          ))}
        </button>
      )}
      {present.length > 0 && (
        <button className="margin-note" onClick={() => open('status')} title="いまの状況を見る">
          いる人　{present.join('・')}
        </button>
      )}
      {found.length > 0 && (
        <button className="margin-note" onClick={() => open('discovery')} title="分かったことを見る">
          <span className="margin-note-label">分かったこと</span>
          {found.map((f, i) => (
            <span key={i} className="margin-note-line clamp">
              {f}
            </span>
          ))}
        </button>
      )}
      {chars > 0 && (
        <div
          className={'margin-note static' + (lvl === 'high' ? ' warn' : '')}
          title="この章の本文の分量（文字数。書き手への指示・進行の合図は数えない）"
        >
          この章　{chars.toLocaleString()}字{lvl === 'high' ? '　そろそろ閉じどき' : ''}
        </div>
      )}
      {usage && (
        <div className="margin-note static" title="この物語で使った累計（提供元が返した値のまま）">
          累計　{usage}
        </div>
      )}
    </div>
  )
}
