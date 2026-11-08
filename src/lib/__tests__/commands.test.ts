import { describe, expect, it } from 'vitest'
import { buildCommands, COMMAND_GROUPS, filterCommands, type CommandInput } from '../commands'

const base: CommandInput = {
  view: 'home',
  sessions: [
    { id: 's1', title: '霧の街', archived: false },
    { id: 's2', title: '', archived: false },
    { id: 's3', title: '古い話', archived: true },
  ],
  characters: [
    { id: 'c1', name: 'ミナ' },
    { id: 'c2', name: '' },
  ],
  worlds: [{ id: 'w1', name: '霧の街' }],
  active: null,
  isStreaming: false,
  isReviewing: false,
  immersive: false,
  imageJobCount: 0,
}

const reading: CommandInput = {
  ...base,
  view: 'sessions',
  active: { id: 's1', mode: 'story', storyStarted: true, hasScene: true, ended: false, archived: false },
}

const ids = (input: CommandInput) => buildCommands(input).map((c) => c.id)

describe('buildCommands', () => {
  it('どの画面からも行き先の一覧（ホーム・新しい物語・素材の3つ・設定）へ行ける', () => {
    for (const view of ['sessions', 'new', 'characters', 'system'] as const) {
      const list = ids({ ...reading, view })
      for (const id of ['go:new', 'go:characters', 'go:worlds', 'go:cassettes', 'go:system']) {
        expect(list).toContain(id)
      }
      expect(list).toContain('go:home')
    }
    // ホームではホームへ行く項目は出さない
    expect(ids(base)).not.toContain('go:home')
  })

  it('この物語の操作は読んでいる画面でだけ出す', () => {
    expect(ids(reading)).toContain('cmd:continue')
    expect(ids(reading)).toContain('cmd:end-scene')
    expect(ids({ ...reading, view: 'characters' })).not.toContain('cmd:continue')
    // 読んでいる画面以外からは「戻る」を出す
    expect(ids({ ...reading, view: 'characters' })).toContain('go:story')
    expect(ids(reading)).not.toContain('go:story')
  })

  it('本文が無い章では「物語をはじめる」、書いている最中は続けると章を閉じるを出さない', () => {
    const notStarted = buildCommands({ ...reading, active: { ...reading.active!, storyStarted: false } })
    expect(notStarted.find((c) => c.id === 'cmd:continue')?.label).toBe('物語をはじめる')
    const streaming = ids({ ...reading, isStreaming: true })
    expect(streaming).not.toContain('cmd:continue')
    expect(streaming).not.toContain('cmd:end-scene')
    expect(ids({ ...reading, active: { ...reading.active!, mode: 'roleplay' } })).not.toContain('cmd:continue')
  })

  it('物語の切り替えはアーカイブ済みと開いている物語を除き、無題に名前をつける', () => {
    const list = buildCommands(reading).filter((c) => c.group === '物語')
    expect(list.map((c) => c.id)).toEqual(['session:s2'])
    expect(list[0].label).toBe('無題の物語')
    expect(ids(base).filter((id) => id.startsWith('session:'))).toEqual(['session:s1', 'session:s2'])
  })

  it('名前の無い素材は出さず、ジョブは1件以上のときだけ出す', () => {
    expect(ids(base)).toContain('char:c1')
    expect(ids(base)).not.toContain('char:c2')
    expect(ids(base)).not.toContain('cmd:jobs')
    expect(ids({ ...base, imageJobCount: 2 })).toContain('cmd:jobs')
  })

  it('物語の画面の操作（あらすじ・書き出し・設定など）を出し、完結後は続けると終わり方を出さない', () => {
    for (const id of ['cmd:log', 'cmd:scene', 'cmd:ending', 'cmd:export', 'cmd:cassette', 'cmd:editor', 'cmd:archive', 'cmd:delete']) {
      expect(ids(reading)).toContain(id)
    }
    const ended = ids({ ...reading, active: { ...reading.active!, ended: true } })
    expect(ended).not.toContain('cmd:continue')
    expect(ended).not.toContain('cmd:end-scene')
    expect(ended).not.toContain('cmd:ending')
    expect(ended).toContain('cmd:export')
  })

  it('グループの順に並ぶ', () => {
    const order = buildCommands(reading).map((c) => COMMAND_GROUPS.indexOf(c.group))
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })
})

describe('filterCommands', () => {
  it('名前とグループ名で絞り、空なら全部', () => {
    const list = buildCommands(base)
    expect(filterCommands(list, '  ')).toHaveLength(list.length)
    expect(filterCommands(list, '霧').map((c) => c.id)).toEqual(['session:s1', 'world:w1'])
    expect(filterCommands(list, '世界観').map((c) => c.id)).toEqual(['go:worlds', 'world:w1'])
  })
})
