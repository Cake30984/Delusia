import { useEffect, useState } from 'react'
import { storeActions } from '../../store'
import type { Character } from '../../types'
import AvatarField from './AvatarField'
import CsvInput from '../CsvInput'
import { exportCharacterCard } from '../../lib/cards'
import { appConfirm } from '../../lib/dialogs'
import ModalShell from '../ModalShell'
import { Icon } from '../icons'

interface Props {
  character: Character
  onClose: () => void
  /**
   * 未保存の下書きとして開く（発見キャラのキャラ化・FB7-E）。
   * まだライブラリに無いので「削除」「カードとして保存」は出さず、先頭の注意書きを差し替える。
   */
  draft?: boolean
  /** draft モードの案内文（起案が失敗した理由の表示にも使う） */
  draftNotice?: string
  /** 保存された内容を受け取る（保存先の追加処理＝セッション参加などを呼び出し側でやるため） */
  onSaved?: (c: Character) => void
  /**
   * その場で開く（P9 段7。キャラクターと世界観のページの右の列・モバイルの1枚の編集）。
   * モーダルにせず、保存しても閉じない。`onBack` があれば上に「一覧へ」を出す
   */
  inline?: boolean
  onBack?: () => void
  /** 未保存の変更があるか（一覧で別の人を選ぶ前に確かめるため） */
  onDirty?: (dirty: boolean) => void
}

export default function CharacterEditor({ character, onClose, draft, draftNotice, onSaved, inline, onBack, onDirty }: Props) {
  const { upsertCharacter, deleteCharacter } = storeActions()
  const [d, setD] = useState<Character>(character)
  const [exporting, setExporting] = useState(false)
  const [dirty, setDirty] = useState(false)
  const patch = (p: Partial<Character>) => {
    setD((c) => ({ ...c, ...p }))
    setDirty(true)
  }
  useEffect(() => {
    onDirty?.(dirty)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty])

  const exportCard = async () => {
    setExporting(true)
    try {
      await exportCharacterCard(d)
    } finally {
      setExporting(false)
    }
  }

  const save = () => {
    upsertCharacter(d)
    onSaved?.(d)
    if (inline) setDirty(false)
    else onClose()
  }

  const remove = async () => {
    if (await appConfirm({ message: 'このキャラクターを削除しますか？', danger: true })) {
      deleteCharacter(d.id)
      onClose()
    }
  }

  const exportButton = (
    <button className="btn" onClick={exportCard} disabled={exporting}>
      {exporting ? (
        '書き出し中…'
      ) : (
        <>
          <Icon name="credit-card" size={14} /> カードとして保存
        </>
      )}
    </button>
  )

  const fields = (
    <>
      <div className="field lib-wide">
        <label>アバター</label>
        <AvatarField
          avatar={d.avatar}
          name={d.name}
          genContext={{ name: d.name, appearance: d.appearance, imagePrompt: d.imagePrompt }}
          target={{ type: 'character-avatar', characterId: d.id }}
          onChange={(avatar) => patch({ avatar })}
        />
      </div>
      <div className="field lib-wide">
        <label>名前</label>
        <input value={d.name} placeholder="例: 沙耶" onChange={(e) => patch({ name: e.target.value })} />
      </div>
      <div className="field">
        <label>人となり</label>
        <div className="desc">価値観、過去、動機など。詳しいほど一貫します。</div>
        <textarea
          rows={5}
          value={d.persona}
          placeholder="例: 物静かだが芯が強い。本が好きで..."
          onChange={(e) => patch({ persona: e.target.value })}
        />
      </div>
      <div className="field">
        <label>話し方</label>
        <div className="desc">口調・一人称・癖など。</div>
        <textarea
          rows={5}
          value={d.speechStyle}
          placeholder="例: 丁寧な敬語混じり。一人称は「私」。"
          onChange={(e) => patch({ speechStyle: e.target.value })}
        />
      </div>
      <div className="field">
        <label>見た目</label>
        <textarea
          rows={3}
          value={d.appearance}
          placeholder="例: 長い黒髪、眼鏡、制服。"
          onChange={(e) => patch({ appearance: e.target.value })}
        />
      </div>
      <div className="field">
        <label>セリフの例</label>
        <div className="desc">話し方の再現が上がります。1行に1つ。</div>
        <textarea
          rows={3}
          value={d.exampleDialogues}
          placeholder={'例:\n「……別に、あなたのためじゃないですから」\n「もう少しだけ、ここにいてもいいですか」'}
          onChange={(e) => patch({ exampleDialogues: e.target.value })}
        />
      </div>
      <div className="field lib-wide">
        <label>最初のセリフ（任意）</label>
        <textarea
          rows={2}
          value={d.greeting}
          placeholder="例: あら、こんなところで奇遇ですね。"
          onChange={(e) => patch({ greeting: e.target.value })}
        />
      </div>
      {d.developments.length > 0 && (
        <div className="field lib-wide">
          <label>物語の中で分かったこと　{d.developments.length}件</label>
          <div className="desc">章を閉じるときに選んで書き足したことです。チェックを外すと AI に渡しません。</div>
          <div className="growth-list">
            {d.developments.map((dev) => (
              <div key={dev.id} className="growth-edit">
                <input
                  type="checkbox"
                  checked={dev.enabled}
                  title="AI に渡す"
                  onChange={(e) =>
                    patch({
                      developments: d.developments.map((x) => (x.id === dev.id ? { ...x, enabled: e.target.checked } : x)),
                    })
                  }
                />
                <textarea
                  rows={2}
                  value={dev.text}
                  className={dev.enabled ? '' : 'dimmed'}
                  onChange={(e) =>
                    patch({
                      developments: d.developments.map((x) => (x.id === dev.id ? { ...x, text: e.target.value } : x)),
                    })
                  }
                />
                <button
                  className="icon-btn small"
                  onClick={() => patch({ developments: d.developments.filter((x) => x.id !== dev.id) })}
                  title="消す"
                >
                  <Icon name="x" size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="field">
        <label>タグ（カンマ区切り・任意）</label>
        <CsvInput value={d.tags} placeholder="例: 学園, クール, ヒロイン" onChange={(tags) => patch({ tags })} />
      </div>
      <div className="field">
        <label>画像を描くときのタグ（英語・任意）</label>
        <div className="desc">挿絵・顔を描くときに自動で使われ、カードにも含まれます。</div>
        <input
          value={d.imagePrompt ?? ''}
          placeholder="例: 1girl, long black hair, glasses"
          onChange={(e) => patch({ imagePrompt: e.target.value || undefined })}
        />
      </div>
    </>
  )

  const notice = draft
    ? draftNotice
    : '直した内容はすべての物語・すべての分岐で共有されます（分岐を戻しても巻き戻りません）。'

  if (inline) {
    return (
      <section className="lib-editor" aria-label={`${d.name || '無名'}を直す`}>
        <div className="lib-editor-head">
          {onBack && (
            <button className="icon-btn" onClick={onBack} title="一覧へ" aria-label="一覧へ">
              <Icon name="chevron-left" size={20} />
            </button>
          )}
          <h2 className="lib-editor-title">{d.name || '無名'}</h2>
          <div className="lib-editor-actions">
            {!draft && (
              <>
                <button className="btn danger" onClick={() => void remove()}>
                  削除
                </button>
                {exportButton}
              </>
            )}
            <button className="btn primary" onClick={save} disabled={!dirty}>
              {dirty ? '保存' : '保存済み'}
            </button>
          </div>
        </div>
        <p className="lib-editor-notice">{notice}</p>
        <div className="lib-editor-grid">{fields}</div>
      </section>
    )
  }

  return (
    <ModalShell
      title={draft ? `キャラクターにする：${character.name || '無名'}` : 'キャラクター'}
      onClose={onClose}
      dirty={dirty}
      footer={
        <>
          {/* 下書き（発見キャラ）はまだライブラリに無いので削除・カード書き出しを出さない（FB7-E） */}
          {!draft && (
            <>
              <button className="btn danger" onClick={() => void remove()}>
                削除
              </button>
              {exportButton}
            </>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={onClose}>
            キャンセル
          </button>
          <button className="btn primary" onClick={save}>
            保存
          </button>
        </>
      }
    >
      <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 0, marginBottom: 10 }}>{notice}</p>
      {fields}
    </ModalShell>
  )
}
