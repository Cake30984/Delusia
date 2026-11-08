import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { useStore, type View } from '../store'

/**
 * 画面の行き先とブラウザの履歴をつなぐ（P9 段2）。ルーターは入れない。
 * 行き先そのものは store の `view`＋`activeId`（UI だけの状態）。ここはその変化を `history.pushState` に積み、
 * 戻る操作（`popstate`）で積んだ値を store へ戻すだけ。URL は変えない（どの画面も同じ1枚のページ）。
 */

interface NavEntry {
  view: View
  activeId: string | null
  /** アプリを開いてから積んだ数。0 なら一つ前はこのアプリの画面ではない */
  depth: number
}

/** history.state の中で自分の値を置く鍵（ほかの用途の state を壊さない） */
const STATE_KEY = 'delusiaNav'

let applyingPop = false
let replaceNext = false
/** 戻る操作が反映されたあとに1回だけ呼ぶもの（goBackThen） */
let afterPop: (() => void) | null = null
/** モバイルの「何をしますか」を開く前の画面（一覧の「この物語」の出し分けに使う） */
let beneathMenu: View = 'home'

export function viewBeneathMenu(): View {
  return beneathMenu
}

function entryOf(st: { view: View; activeId: string | null }, depth: number): NavEntry {
  // 物語の画面以外では、開いている物語は行き先の一部ではない（戻ったときに物語を切り替えない）
  return { view: st.view, activeId: st.view === 'sessions' ? st.activeId : null, depth }
}

function sameEntry(a: NavEntry | undefined, b: NavEntry): boolean {
  return !!a && a.view === b.view && a.activeId === b.activeId
}

function currentEntry(): NavEntry | undefined {
  const s = history.state as Record<string, unknown> | null
  return (s?.[STATE_KEY] as NavEntry | undefined) ?? undefined
}

function writeEntry(entry: NavEntry, mode: 'push' | 'replace') {
  const state = { ...((history.state as Record<string, unknown> | null) ?? {}), [STATE_KEY]: entry }
  if (mode === 'push') history.pushState(state, '')
  else history.replaceState(state, '')
}

/**
 * 次の1回の行き先の変化を、履歴に積まずに今の項目へ上書きする。
 * 「何をしますか」のページ（モバイル）から別の画面へ行くときに使う＝戻るでメニューへ戻らない
 */
export function replaceNextNav() {
  replaceNext = true
}

/**
 * 履歴との同期を始める。App から1回だけ呼ぶ（読み込みと OAuth の戻りの処理が済んでから。
 * OAuth の戻りは URL を書き換えるときに history.state を空にするため）
 */
export function startHistorySync(): () => void {
  // 再読み込みしてもブラウザの履歴（とその state）は残るので、積んだ数は今の項目のものを引き継ぐ
  writeEntry(entryOf(useStore.getState(), currentEntry()?.depth ?? 0), 'replace')

  const unsub = useStore.subscribe((st, prev) => {
    if (st.view === prev.view && st.activeId === prev.activeId) return
    if (st.view === 'menu' && prev.view !== 'menu') beneathMenu = prev.view
    if (applyingPop) return
    const mode = replaceNext ? 'replace' : 'push'
    replaceNext = false
    const cur = currentEntry()
    const depth = cur?.depth ?? 0
    const next = entryOf(st, mode === 'push' ? depth + 1 : depth)
    if (sameEntry(cur, next)) return
    writeEntry(next, mode)
  })

  const onPop = (e: PopStateEvent) => {
    const entry = (e.state as Record<string, unknown> | null)?.[STATE_KEY] as NavEntry | undefined
    if (!entry) return
    applyingPop = true
    try {
      const st = useStore.getState()
      if (entry.view === 'sessions') {
        // 戻った先の物語が消されていたらホームへ
        const exists = !!entry.activeId && st.sessions.some((s) => s.id === entry.activeId)
        useStore.setState(exists ? { view: 'sessions', activeId: entry.activeId } : { view: 'home' })
      } else {
        useStore.setState({ view: entry.view })
      }
    } finally {
      applyingPop = false
    }
    const fn = afterPop
    afterPop = null
    fn?.()
  }
  window.addEventListener('popstate', onPop)
  return () => {
    unsub()
    window.removeEventListener('popstate', onPop)
  }
}

/** 一つ前の画面へ戻る。履歴の始まり（アプリを開いた直後の画面）ならホームへ */
export function goBack() {
  goBackThen()
}

/**
 * 一つ前の画面へ戻ってから fn を呼ぶ（戻る操作は非同期で反映されるため、反映を待ってから）。
 * モバイルの「何をしますか」から操作を実行するときに使う＝メニューは履歴に残らない
 */
export function goBackThen(fn?: () => void) {
  replaceNext = false
  if ((currentEntry()?.depth ?? 0) > 0) {
    afterPop = fn ?? null
    history.back()
    return
  }
  replaceNextNav()
  // 履歴の始まり（メニューを開いたまま再読み込みした等）。メニューなら下の画面へ、それ以外はホームへ
  useStore.getState().setView(useStore.getState().view === 'menu' ? beneathMenu : 'home')
  fn?.()
}

/** 物語の画面で開くもの: あらすじ・終わり方・書き出し・カセットにする・物語の設定・章の名前と状況 */
export type ReaderModal = 'log' | 'ending' | 'export' | 'cassette' | 'editor' | 'scene'

/**
 * 行き先ではない、重ねて開くもの。どの画面からも開け、App が描く
 * （物語を作ると画面が物語へ移るので、開いた画面の中に置くと一緒に消える）
 */
export const useOverlays = create<{
  /** PC の「何をしますか」 */
  paletteOpen: boolean
  /** 画像生成ジョブ（物語の画面の外から見るとき） */
  jobsOpen: boolean
  /** 一行から始める（起案が終わると自分で物語の設定を開く） */
  kickoffOpen: boolean
  /** 白紙から作った直後に開く物語の設定 */
  newEditorId: string | null
  /**
   * 物語の画面で開くもの（P9 段3）。「何をしますか」から開けるようここに置く
   * （モバイルはメニューのページから戻ってきた物語の画面が開く）
   */
  readerModal: ReaderModal | null
  /** readerModal を開いた物語（別の物語を開いたら出さない＝持ち越さない） */
  readerModalFor: string | null
  /** 章を閉じるページの「この章の挿絵を描く」で物語の画面へ戻ったとき、挿絵を描く章 */
  illustrateSceneId: string | null
  setPaletteOpen: (open: boolean) => void
  setJobsOpen: (open: boolean) => void
  setKickoffOpen: (open: boolean) => void
  setNewEditorId: (id: string | null) => void
  setReaderModal: (m: ReaderModal | null) => void
  setIllustrateSceneId: (id: string | null) => void
}>((set) => ({
  paletteOpen: false,
  jobsOpen: false,
  kickoffOpen: false,
  newEditorId: null,
  readerModal: null,
  readerModalFor: null,
  illustrateSceneId: null,
  setIllustrateSceneId: (illustrateSceneId) => set({ illustrateSceneId }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setJobsOpen: (jobsOpen) => set({ jobsOpen }),
  setKickoffOpen: (kickoffOpen) => set({ kickoffOpen }),
  setNewEditorId: (newEditorId) => set({ newEditorId }),
  setReaderModal: (readerModal) =>
    set({ readerModal, readerModalFor: readerModal ? useStore.getState().activeId : null }),
}))

/** これより狭い幅はモバイルの骨組み（縦向きのスマートフォン）。デスクトップ版の最小幅 960px には掛からない */
export const MOBILE_MAX_WIDTH = 767
const MOBILE_QUERY = `(max-width: ${MOBILE_MAX_WIDTH}px)`

export function isMobileWidth(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches
}

/** モバイルの骨組みで描くか。幅が変わると追従する */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(isMobileWidth)
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const onChange = () => setMobile(mq.matches)
    onChange()
    // change が来ない環境（端末の幅の切り替えを真似る開発用ブラウザ等）があるので resize でも見る
    mq.addEventListener('change', onChange)
    window.addEventListener('resize', onChange)
    return () => {
      mq.removeEventListener('change', onChange)
      window.removeEventListener('resize', onChange)
    }
  }, [])
  return mobile
}

/** 「何をしますか」を開く。PC は重ねて開き、モバイルはメニューのページへ行く */
export function openCommands() {
  if (isMobileWidth()) useStore.getState().setView('menu')
  else useOverlays.getState().setPaletteOpen(true)
}
