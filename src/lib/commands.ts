import { currentScene, useStore, type View } from '../store'
import type { DockTab, Session } from '../types'
import type { IconName } from '../components/icons'
import { openInLibrary, openStoryPanel, useOverlays, viewBeneathMenu, type ReaderModal } from './nav'
import { appConfirm } from './dialogs'

/**
 * 「何をしますか」の操作一覧（P9 段2）。PC の Ctrl+K と、モバイルの「メニュー」のページが同じ一覧を使う。
 * 一覧を作るのは純関数 `buildCommands`（入力は表示に要る値だけ）。実行は store を直接呼ぶ。
 */
export interface Command {
  id: string
  label: string
  group: CommandGroup
  icon: IconName
  /** PC で右端に出すキー操作の表記 */
  shortcut?: string
  run: () => void
}

/** 並び順もこの順（今の物語の操作が先頭） */
export const COMMAND_GROUPS = ['この物語', '移動', '物語', 'キャラクター', '世界観', '表示'] as const
export type CommandGroup = (typeof COMMAND_GROUPS)[number]

export interface CommandInput {
  view: View
  sessions: Pick<Session, 'id' | 'title' | 'archived'>[]
  characters: { id: string; name: string }[]
  worlds: { id: string; name: string }[]
  /** 開いている物語（無ければ null） */
  active: {
    id: string
    mode: Session['mode']
    /** 今の章に本文が1つでもあるか（「物語をはじめる」と「続ける」の出し分け） */
    storyStarted: boolean
    hasScene: boolean
    /** 完結済み（続ける・終わり方を出さない） */
    ended: boolean
    archived: boolean
    /** 登場キャラクター（「この物語」から直接開くため） */
    castIds: string[]
    worldId: string | null
  } | null
  isStreaming: boolean
  isReviewing: boolean
  immersive: boolean
  imageJobCount: number
}

const st = () => useStore.getState()

function goto(view: View) {
  return () => st().setView(view)
}

function openReader(modal: ReaderModal) {
  return () => useOverlays.getState().setReaderModal(modal)
}

function openDock(tab: DockTab) {
  return () => openStoryPanel(tab)
}

export function buildCommands(input: CommandInput): Command[] {
  const list: Command[] = []
  const { active } = input
  const reading = active && input.view === 'sessions'

  // この物語（読んでいる画面からだけ。別の画面から「続ける」を押して裏で進むと分からなくなる）
  if (reading && active) {
    if (active.mode === 'story' && !input.isStreaming && !active.ended) {
      list.push({
        id: 'cmd:continue',
        label: active.storyStarted ? '続ける' : '物語をはじめる',
        group: 'この物語',
        icon: active.storyStarted ? 'fast-forward' : 'play',
        shortcut: 'Ctrl G',
        run: () => void (active.storyStarted ? st().continueStory() : st().startStory()),
      })
    }
    if (active.hasScene && !input.isStreaming && !input.isReviewing && !active.ended) {
      list.push({
        id: 'cmd:end-scene',
        label: 'この章を閉じる',
        group: 'この物語',
        icon: 'check',
        run: () => void st().prepareSceneReview(),
      })
    }
    list.push({ id: 'cmd:dock-status', label: 'いまの状況と分かったことを見る', group: 'この物語', icon: 'bar-chart-3', run: openDock('status') })
    list.push({ id: 'cmd:dock-branch', label: '分岐としおりを見る', group: 'この物語', icon: 'git-branch', run: openDock('branch') })
    list.push({ id: 'cmd:dock-gallery', label: '挿絵を見る', group: 'この物語', icon: 'image', run: openDock('gallery') })
    list.push({ id: 'cmd:log', label: 'あらすじを読む', group: 'この物語', icon: 'scroll-text', run: openReader('log') })
    if (active.hasScene) {
      list.push({ id: 'cmd:scene', label: '章の名前と状況を直す', group: 'この物語', icon: 'pencil', run: openReader('scene') })
    }
    if (active.mode === 'story' && !active.ended) {
      list.push({ id: 'cmd:ending', label: '終わり方を考える', group: 'この物語', icon: 'flag', run: openReader('ending') })
    }
    list.push({ id: 'cmd:export', label: '物語を書き出す', group: 'この物語', icon: 'download', run: openReader('export') })
    list.push({ id: 'cmd:cassette', label: 'カセットにする', group: 'この物語', icon: 'library-big', run: openReader('cassette') })
    list.push({ id: 'cmd:editor', label: '物語の設定', group: 'この物語', icon: 'settings', run: openReader('editor') })
    list.push({
      id: 'cmd:archive',
      label: active.archived ? 'アーカイブから戻す' : 'アーカイブする',
      group: 'この物語',
      icon: 'archive',
      run: () => st().updateSession(active.id, { archived: !active.archived }),
    })
    list.push({
      id: 'cmd:delete',
      label: '物語を削除',
      group: 'この物語',
      icon: 'trash-2',
      run: async () => {
        if (await appConfirm({ message: 'この物語を削除しますか？', danger: true })) st().deleteSession(active.id)
      },
    })
    // 登場人物と世界観を直接開く（P9 段7・統合案6。素材は第一階層から下げ、物語から開く）
    for (const id of active.castIds) {
      const c = input.characters.find((x) => x.id === id)
      if (!c?.name) continue
      list.push({
        id: `cast:${id}`,
        label: `登場人物「${c.name}」を開く`,
        group: 'この物語',
        icon: 'users',
        run: () => openInLibrary('characters', id),
      })
    }
    const world = active.worldId ? input.worlds.find((w) => w.id === active.worldId) : undefined
    if (world?.name) {
      list.push({
        id: `cast-world:${world.id}`,
        label: `世界観「${world.name}」を開く`,
        group: 'この物語',
        icon: 'globe',
        run: () => openInLibrary('worlds', world.id),
      })
    }
  }

  // 移動（行き先）
  if (active && input.view !== 'sessions') {
    list.push({ id: 'go:story', label: '読んでいる物語へ戻る', group: '移動', icon: 'book-open', shortcut: 'Ctrl 1', run: goto('sessions') })
  }
  if (input.view !== 'home') list.push({ id: 'go:home', label: 'ホーム', group: '移動', icon: 'home', run: goto('home') })
  list.push({ id: 'go:new', label: '新しい物語を始める', group: '移動', icon: 'plus', run: goto('new') })
  list.push({ id: 'go:characters', label: 'キャラクター', group: '移動', icon: 'users', shortcut: 'Ctrl 2', run: goto('characters') })
  list.push({ id: 'go:worlds', label: '世界観', group: '移動', icon: 'globe', run: goto('worlds') })
  list.push({ id: 'go:cassettes', label: 'カセット', group: '移動', icon: 'library-big', run: goto('cassettes') })
  list.push({ id: 'go:system', label: '表示と設定', group: '移動', icon: 'settings', shortcut: 'Ctrl 3', run: goto('system') })
  if (input.imageJobCount > 0) {
    list.push({
      id: 'cmd:jobs',
      label: `画像生成ジョブを見る（${input.imageJobCount}件）`,
      group: '移動',
      icon: 'hourglass',
      // 進み具合と、できた候補から選ぶ画面（P9 段5 でパネルのタブをやめ、どの画面からも重ねて開く）
      run: () => useOverlays.getState().setJobsOpen(true),
    })
  }

  // 物語を切り替える（開いている物語とアーカイブ済みは出さない）
  for (const s of input.sessions) {
    if (s.archived || (reading && s.id === active?.id)) continue
    list.push({
      id: `session:${s.id}`,
      label: s.title || '無題の物語',
      group: '物語',
      icon: 'message-circle',
      run: () => st().setActive(s.id),
    })
  }
  for (const c of input.characters) {
    if (!c.name) continue
    list.push({ id: `char:${c.id}`, label: c.name, group: 'キャラクター', icon: 'users', run: () => openInLibrary('characters', c.id) })
  }
  for (const w of input.worlds) {
    if (!w.name) continue
    list.push({ id: `world:${w.id}`, label: w.name, group: '世界観', icon: 'globe', run: () => openInLibrary('worlds', w.id) })
  }

  if (reading) {
    list.push({
      id: 'cmd:immersive',
      label: input.immersive ? '没入モードを解除' : '没入モードにする',
      group: '表示',
      icon: 'maximize',
      shortcut: 'Ctrl .',
      run: () => st().setUiPrefs({ immersive: !input.immersive }),
    })
  }

  const order = (g: CommandGroup) => COMMAND_GROUPS.indexOf(g)
  return list.map((c, i) => ({ c, i })).sort((a, b) => order(a.c.group) - order(b.c.group) || a.i - b.i).map((x) => x.c)
}

/** 検索語で絞る。空なら全部 */
export function filterCommands(list: Command[], query: string): Command[] {
  const q = query.trim().toLowerCase()
  if (!q) return list
  return list.filter((c) => (c.label + ' ' + c.group).toLowerCase().includes(q))
}

/** 今の store から一覧の入力を作る（描画のたびに呼ぶ。本文は見ない） */
export function commandInputFromStore(): CommandInput {
  const s = st()
  const session = s.sessions.find((x) => x.id === s.activeId)
  const scene = session ? currentScene(session) : undefined
  return {
    // モバイルの「何をしますか」のページでは、開く前の画面を基準に出し分ける
    view: s.view === 'menu' ? viewBeneathMenu() : s.view,
    sessions: s.sessions,
    characters: s.characters,
    worlds: s.worlds,
    active: session
      ? {
          id: session.id,
          mode: session.mode,
          storyStarted: session.messages.some((m) => m.sceneId === scene?.id),
          hasScene: !!scene,
          ended: !!session.ending,
          archived: !!session.archived,
          castIds: session.characterIds,
          worldId: session.worldId,
        }
      : null,
    isStreaming: s.isStreaming,
    isReviewing: s.isReviewing,
    immersive: s.ui.immersive,
    imageJobCount: s.imageJobs.length,
  }
}
