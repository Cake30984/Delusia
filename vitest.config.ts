import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

// 本体バージョンは vite.config.ts と同じく package.json を唯一の出所にする（`__APP_VERSION__` を
// 参照する src/lib/version.ts がテストから間接的に読み込まれるため、ここでも定義が要る）
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string }

// 純関数のテストだけを置く前提なので jsdom は入れない（DOM が要るものはテストしない）
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    // CSS は既定で空として読まれる。tokens.css だけは用意した色の値の一致を確かめるため中身を通す（P9）
    css: { include: [/tokens\.css/] },
  },
})
