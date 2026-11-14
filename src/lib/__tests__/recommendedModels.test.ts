import { describe, expect, it } from 'vitest'
import { RECOMMENDED_MODELS, isRecommendedModel } from '../recommendedModels'

describe('おすすめのモデル', () => {
  it('id は重複せず、系列をまたぐ「常に最新」別名や auto を含まない', () => {
    expect(RECOMMENDED_MODELS.length).toBeGreaterThan(0)
    const ids = RECOMMENDED_MODELS.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) {
      expect(id).not.toMatch(/^~/)
      expect(id).not.toMatch(/-latest$|\/auto$/)
      expect(id).toMatch(/^[\w.-]+\/[\w.-]+$/)
    }
    for (const m of RECOMMENDED_MODELS) expect(m.name.trim().length).toBeGreaterThan(0)
  })

  it('おすすめかどうかの判定', () => {
    expect(isRecommendedModel(RECOMMENDED_MODELS[0].id)).toBe(true)
    expect(isRecommendedModel('openrouter/auto')).toBe(false)
    expect(isRecommendedModel('')).toBe(false)
  })
})
