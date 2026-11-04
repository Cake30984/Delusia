import { useState } from 'react'

/** 同梱している書体のライセンス文（public/licenses/fonts.txt）を開いたときに読み込んで出す */
export default function FontLicenses() {
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState('')
  const load = () => {
    if (text !== null) return
    fetch('./licenses/fonts.txt')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.text()
      })
      .then(setText)
      .catch((e: Error) => setError(`読み込めませんでした（${e.message}）`))
  }
  return (
    <details className="help-details" onToggle={(e) => (e.currentTarget.open ? load() : undefined)}>
      <summary>書体のライセンス</summary>
      <div className="help-details-body">
        {error ? (
          <p className="desc">{error}</p>
        ) : (
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, margin: 0, textAlign: 'left' }}>
            {text ?? '読み込み中…'}
          </pre>
        )}
      </div>
    </details>
  )
}
