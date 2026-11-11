import { storeActions, useStore } from '../../store'
import { goBack, useIsMobile, useOverlays } from '../../lib/nav'
import { modelRefLabel, parseModelRef } from '../../lib/providers'
import { CommandButton } from '../PageHeader'
import ActivityIndicator from '../ActivityIndicator'
import ImageProviderSettings from '../ImageProviderSettings'
import { Icon } from '../icons'
import DisplaySettings, { FontChooser } from './DisplaySettings'
import WriterSettings from './WriterSettings'
import { AboutSettings, DataSettings, TuningSettings, UsageSettings, totalUsageCost } from './SettingsSections'

type SectionId = 'display' | 'writer' | 'image' | 'tuning' | 'usage' | 'data' | 'about'

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'display', label: '表示' },
  { id: 'writer', label: '書き手（AI）の接続先' },
  { id: 'image', label: '挿絵の接続先' },
  { id: 'tuning', label: 'AI 呼び出しの詳細' },
  { id: 'usage', label: '使った金額' },
  { id: 'data', label: 'データの書き出しと読み込み' },
  { id: 'about', label: 'このアプリについて' },
]

function SectionBody({ id, mobile }: { id: SectionId; mobile: boolean }) {
  switch (id) {
    case 'display':
      return <DisplaySettings mobile={mobile} />
    case 'writer':
      return <WriterSettings />
    case 'image':
      return (
        <section className="set-section set-legacy">
          <ImageProviderSettings />
        </section>
      )
    case 'tuning':
      return <TuningSettings />
    case 'usage':
      return <UsageSettings />
    case 'data':
      return <DataSettings />
    case 'about':
      return <AboutSettings />
  }
}

/** 画面の中のページ（項目）を開く。履歴に積まれる＝戻るで前の項目へ */
function openSection(id: string) {
  useOverlays.setState({ subPage: { view: 'system', id } })
}

/** モバイルの一覧の行の右に出す、いまの値の短い要約 */
function useSummaries(): Partial<Record<SectionId, string>> {
  const providers = useStore((st) => st.providers)
  const defaultModelRef = useStore((st) => st.defaultModelRef)
  const imageProviders = useStore((st) => st.imageProviders)
  const usageLog = useStore((st) => st.usageLog)
  const writer = defaultModelRef
    ? parseModelRef(defaultModelRef, providers).provider?.label || modelRefLabel(defaultModelRef, providers)
    : providers[0]?.label
  const cost = totalUsageCost(usageLog)
  return {
    writer: writer || '',
    image: imageProviders[0]?.label ?? 'なし',
    usage: cost > 0 ? `合計 $${cost.toFixed(2)}` : '',
  }
}

/**
 * 表示と設定（P9 段8）。PC は左に項目の一覧・右にその項目の中身、モバイルは「表示」を最初のページに置き、
 * ほかの項目は1枚ずつのページで開く（項目は `useOverlays.subPage`＝戻るで1つ前へ）
 */
export default function SettingsPage() {
  const mobile = useIsMobile()
  const sub = useOverlays((o) => (o.subPage?.view === 'system' ? o.subPage.id : null))
  const { setView } = storeActions()
  const summaries = useSummaries()

  if (mobile) {
    const section = SECTIONS.find((s) => s.id === sub)
    const isFont = sub === 'font'
    const title = isFont ? '本文の書体' : (section?.label ?? '表示と設定')
    return (
      <div className="shell-page set-page mobile">
        <header className="reader-head review-head">
          <button className="icon-btn" onClick={goBack} title="戻る" aria-label="戻る">
            <Icon name="chevron-left" size={20} />
          </button>
          <h1 className="review-head-title">{title}</h1>
        </header>
        <div className="set-scroll">
          {isFont ? (
            <section className="set-section">
              <p className="set-desc">画面の文字はゴシックのまま。物語の本文だけが変わる。</p>
              <FontChooser column />
              <div className="set-sample">
                「合ってる。去年もここで見た」
                <br />
                千歳はそれだけ言って、ノートの端に何かを書きつけた。
              </div>
            </section>
          ) : section && section.id !== 'display' ? (
            <SectionBody id={section.id} mobile />
          ) : (
            <>
              <DisplaySettings mobile />
              <nav className="set-section" aria-label="ほかの設定">
                {SECTIONS.filter((s) => s.id !== 'display').map((s) => (
                  <button key={s.id} className="set-link" onClick={() => openSection(s.id)}>
                    {s.label}
                    <small>{summaries[s.id] ?? ''}</small>
                  </button>
                ))}
              </nav>
            </>
          )}
        </div>
      </div>
    )
  }

  // PC。本文の書体のページ（モバイルから幅を広げた）は表示に含まれる
  const current: SectionId = SECTIONS.some((s) => s.id === sub) ? (sub as SectionId) : 'display'
  return (
    <div className="shell-page set-page">
      <header className="reader-head">
        <nav className="reader-crumb" aria-label="現在地">
          <button className="reader-crumb-link" onClick={() => setView('home')}>
            デルシア
          </button>
          <span className="reader-crumb-sep">/</span>
          <span className="reader-crumb-chapter">表示と設定</span>
        </nav>
        <div className="reader-head-end">
          <ActivityIndicator />
          <CommandButton />
        </div>
      </header>
      <div className="set-layout">
        <nav className="set-nav" aria-label="設定の項目">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              className={'set-nav-item' + (s.id === current ? ' on' : '')}
              aria-current={s.id === current ? 'page' : undefined}
              onClick={() => s.id !== current && openSection(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <main className="set-main" key={current}>
          {current !== 'display' && <h1 className="set-title">{SECTIONS.find((s) => s.id === current)?.label}</h1>}
          <SectionBody id={current} mobile={false} />
        </main>
      </div>
    </div>
  )
}
