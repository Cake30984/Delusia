import { memo, useState } from 'react'
import { storeActions, useStore } from '../store'
import MenuPopover from './MenuPopover'
import { useOverlays } from '../lib/nav'

/**
 * 本編/選択肢/まとめ/画像生成の進行状態を一元表示し、中止できるチップ。
 * 描き終わって選ぶのを待っている画像もここに出し、「選ぶ」で画像生成ジョブの画面を開く（P9 段5）。
 * `memo`＝親（ChatPanelBody）の再描画では描き直さず、自分が購読している進行状態だけで動く（P2b）
 */
function ActivityIndicator() {
  const isStreaming = useStore((st) => st.isStreaming)
  const isGeneratingChoices = useStore((st) => st.isGeneratingChoices)
  const isReviewing = useStore((st) => st.isReviewing)
  const imageJobs = useStore((st) => st.imageJobs)
  const { stop, stopChoices, stopReview, cancelImageJob } = storeActions()
  const [open, setOpen] = useState(false)

  const runningJobs = imageJobs.filter((j) => j.status === 'running')
  const openJobs = () => useOverlays.getState().setJobsOpen(true)
  const items: { key: string; label: string; onStop?: () => void; onOpen?: () => void }[] = []
  if (isStreaming) items.push({ key: 'main', label: '本文を書いています', onStop: stop })
  if (isReviewing) items.push({ key: 'review', label: '章をまとめています', onStop: stopReview })
  if (isGeneratingChoices) items.push({ key: 'choices', label: '展開の候補を考えています', onStop: stopChoices })
  for (const j of runningJobs) {
    items.push({
      key: j.id,
      label: `画像を描いています（${j.results.length}/${j.count}）`,
      onStop: () => cancelImageJob(j.id),
      onOpen: openJobs,
    })
  }
  for (const j of imageJobs) {
    if (j.status === 'selecting') items.push({ key: j.id, label: `選んでください: ${j.label}`, onOpen: openJobs })
    if (j.status === 'error') items.push({ key: j.id, label: `描けませんでした: ${j.label}`, onOpen: openJobs })
  }

  if (items.length === 0) return null
  const main = items[0]

  return (
    <div className="menu-anchor">
      <button className="activity" onClick={() => setOpen((v) => !v)}>
        <span className="activity-dot" />
        {main.label}
        {items.length > 1 && <span className="activity-more">+{items.length - 1}</span>}
      </button>
      {open && (
        <MenuPopover onClose={() => setOpen(false)}>
          {items.map((it) => (
            <div className="activity-row" key={it.key}>
              <span>{it.label}</span>
              {it.onOpen && (
                <button
                  className="link"
                  onClick={() => {
                    setOpen(false)
                    it.onOpen!()
                  }}
                >
                  {it.onStop ? '見る' : '選ぶ'}
                </button>
              )}
              {it.onStop && (
                <button className="link" onClick={it.onStop}>
                  止める
                </button>
              )}
            </div>
          ))}
        </MenuPopover>
      )}
    </div>
  )
}

export default memo(ActivityIndicator)
