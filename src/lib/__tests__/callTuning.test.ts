import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultMaxTokensMode, reasoningParam, resolveCallTuning } from '../callTuning'
import { streamChat } from '../openrouter'
import { makeProvider } from './fixtures'

// `appFetch` を差し替え、送った body を取り出す
let lastBody: Record<string, unknown> = {}
vi.mock('../platform', () => ({
  appFetch: async (_url: string, init: RequestInit) => {
    lastBody = JSON.parse(String(init.body))
    return new Response('data: [DONE]\n\n', { status: 200 })
  },
}))

describe('resolveCallTuning', () => {
  it('既定: 本編は物語ごとの上限、裏方は上限なし。推論はおまかせ', () => {
    expect(defaultMaxTokensMode('main')).toBe('app')
    expect(resolveCallTuning(undefined, 'main', 32768)).toEqual({ maxTokens: 32768, reasoning: undefined })
    expect(resolveCallTuning(undefined, 'kickoff', 6000)).toEqual({ maxTokens: undefined, reasoning: undefined })
  })

  it('設定した種類だけ変わる', () => {
    const map = { kickoff: { maxTokens: 'app' as const, reasoning: 'off' as const }, main: { maxTokens: 'unlimited' as const } }
    expect(resolveCallTuning(map, 'kickoff', 6000)).toEqual({ maxTokens: 6000, reasoning: 'off' })
    expect(resolveCallTuning(map, 'main', 32768).maxTokens).toBeUndefined()
    expect(resolveCallTuning(map, 'review', 8000)).toEqual({ maxTokens: undefined, reasoning: undefined })
  })
})

describe('reasoningParam', () => {
  it('オフは enabled:false、低〜高は effort', () => {
    expect(reasoningParam('off', undefined)).toEqual({ enabled: false })
    expect(reasoningParam('high', ['reasoning'])).toEqual({ effort: 'high' })
    expect(reasoningParam(undefined, ['reasoning'])).toBeUndefined()
  })

  it('対応を申告していないモデルには送らない（require_parameters で 404 になるため）', () => {
    expect(reasoningParam('off', ['temperature', 'max_tokens'])).toBeUndefined()
  })
})

describe('streamChat のリクエスト本体', () => {
  afterEach(() => vi.unstubAllGlobals())

  async function sentBody(params: Partial<Parameters<typeof streamChat>[0]>) {
    // OpenRouter 向けヘッダが location.origin を読む（node 環境には無い）
    vi.stubGlobal('location', { origin: 'http://localhost' })
    await streamChat(
      { provider: makeProvider(), model: 'm', messages: [{ role: 'user', content: 'x' }], temperature: 0.5, ...params },
      () => {},
    )
    return lastBody
  }

  it('maxTokens 未指定なら max_tokens を送らない', async () => {
    const body = await sentBody({})
    expect('max_tokens' in body).toBe(false)
    expect('reasoning' in body).toBe(false)
  })

  it('推論の指定は OpenRouter にだけ送る', async () => {
    expect((await sentBody({ reasoning: 'off' })).reasoning).toEqual({ enabled: false })
    const other = await sentBody({ reasoning: 'off', provider: makeProvider({ kind: 'openai' }) })
    expect('reasoning' in other).toBe(false)
  })

  it('temperature 非対応を申告するモデルには temperature を送らない', async () => {
    const body = await sentBody({ supportedParameters: ['max_tokens', 'structured_outputs'] })
    expect('temperature' in body).toBe(false)
    expect((await sentBody({ supportedParameters: ['temperature'] })).temperature).toBe(0.5)
  })
})
