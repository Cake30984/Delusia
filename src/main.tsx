import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { registerServiceWorker } from './lib/platform'
// 書体（P9）。すべて OFL-1.1 で同梱（ライセンス文は public/licenses/fonts.txt）。
// 画面の文字は M PLUS 2（可変。本文のゴシックも兼ねる）。本文用の残り3書体は太さ 400 だけ入れ、
// 選ばれたときに `lib/proseFonts.ts` が読み込む。どれも unicode-range で分かれているので、
// 表示に使った範囲の woff2 だけが読み込まれる
import '@fontsource-variable/m-plus-2/wght.css'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// PWA（P5）。Web の本番ビルドでだけアプリシェルをキャッシュする
registerServiceWorker()
