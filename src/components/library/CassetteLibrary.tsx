import { useEffect, useState } from 'react'
import { storeActions, useStore } from '../../store'
import type { Cassette } from '../../types'
import { parseCardPng, exportCassetteCard } from '../../lib/cards'
import { getImage, useImageUrl } from '../../lib/imageStore'
import { generateDefaultAvatar } from '../../lib/avatarGen'
import { useCardDrop } from '../../lib/useCardDrop'
import { appConfirm } from '../../lib/dialogs'
import { Icon } from '../icons'
import CassetteEditor from '../CassetteEditor'
import HelpDetails from '../HelpDetails'

/** カセット1枚のカード（表紙・紹介文・遊ぶ/編集/書き出し/削除）。FB2-E / FB3-D */
function CassetteCard({
  cas,
  onPlay,
  onEdit,
  onExport,
  onDelete,
}: {
  cas: Cassette
  /** このカセットで到達したエンディング数（全プレイの通算・distinct。E3 / FB9-B） */
  /** この世界のエンディング総数（E3） */
  onPlay: () => void
  onEdit: () => void
  onExport: () => void
  onDelete: () => void
}) {
  const coverUrl = useImageUrl(cas.coverImageId)
  return (
    <div className="cassette-card">
      <div className="cassette-cover">
        {coverUrl ? (
          <img src={coverUrl} alt="" />
        ) : (
          <div className="cassette-cover-ph">
            <Icon name="gamepad" size={44} />
          </div>
        )}
      </div>
      <div className="cassette-body">
        <div className="entity-name">
          {cas.title || '無題のカセット'}
        </div>
        <div className="entity-desc">{cas.description || '紹介文なし'}</div>
        <div className="cassette-actions">
          <button className="btn primary" onClick={onPlay}>
            <Icon name="play" size={13} /> 始める
          </button>
          <button className="btn" onClick={onEdit} title="カセットを編集">
            <Icon name="pencil" size={13} />
          </button>
          <button className="btn" onClick={onExport} title="PNGカードとして書き出す">
            <Icon name="download" size={13} />
          </button>
          <button className="btn danger" onClick={onDelete} title="棚から削除">
            <Icon name="trash-2" size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * カセットの棚（P9 段7 で「キャラクターと世界観」のページの3つめのタブに）。カードの一覧と、作る・直すはモーダルのまま。
 * 「＋カセットを作る」はページの上端（`createSeq` が増える）
 */
export default function CassetteLibrary({ createSeq }: { createSeq: number }) {
  const cassettes = useStore((st) => st.cassettes)
  const characters = useStore((st) => st.characters)
  const worlds = useStore((st) => st.worlds)
  const { importCassette, playCassette, deleteCassette } = storeActions()
  const [notice, setNotice] = useState('')
  // null=閉じている / {}=新規 / {cassette}=編集
  const [editing, setEditing] = useState<{ cassette?: Cassette } | null>(null)
  // 開いたあとに押されたときだけ（ほかのタブで押した回数を持ち込まない）
  const [seqAtMount] = useState(createSeq)
  useEffect(() => {
    if (createSeq !== seqAtMount) setEditing({})
  }, [createSeq, seqAtMount])

  const handleFiles = async (files: FileList) => {
    for (const file of Array.from(files)) {
      if (!file.type.includes('png') && !file.name.toLowerCase().endsWith('.png')) continue
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const parsed = parseCardPng(bytes)
        if (!parsed || parsed.kind !== 'cassette') throw new Error('ゲームカセットが見つかりません。')
        await importCassette(parsed.bundle, new Blob([bytes as BlobPart], { type: 'image/png' }))
        setNotice(`「${parsed.bundle.session.title || '無題'}」を棚に登録しました。`)
      } catch (e) {
        setNotice(`読み込み失敗：${(e as Error).message}`)
      }
    }
  }
  const { dragOver, dropProps } = useCardDrop(handleFiles)

  const doExport = async (cas: Cassette) => {
    try {
      const world = worlds.find((w) => w.id === cas.session.worldId)
      const refs = {
        characters: cas.session.characterIds
          .map((id) => characters.find((c) => c.id === id))
          .filter((c): c is NonNullable<typeof c> => !!c),
        world,
      }
      const cover =
        (cas.coverImageId ? await getImage(cas.coverImageId) : null) ??
        (await generateDefaultAvatar(cas.title || '物語', '#7c5cff'))
      await exportCassetteCard(cas.session, refs, cover, cas.description)
    } catch (e) {
      setNotice(`書き出し失敗：${(e as Error).message}`)
    }
  }

  const doDelete = async (cas: Cassette) => {
    if (
      !(await appConfirm({
        message: `カセット「${cas.title || '無題'}」を棚から削除しますか？\n（すでに始めた物語は残ります）`,
        danger: true,
      }))
    )
      return
    deleteCassette(cas.id)
  }

  return (
    <div className={'library lib-cassettes' + (dragOver ? ' drag-over' : '')} {...dropProps}>
      <div className="desc">世界観・登場人物・書き出しをひとまとめにした、物語の始まりのカード（PNG）の棚です。</div>
      <HelpDetails>
        <p>
          「カセットを作る」で世界観・キャラクター・中心人物・始め方を1つにまとめて作れます。読んでいる物語の
          「カセットにする」からも作れます。PNG をここへドラッグ＆ドロップして取り込むこともできます。
        </p>
        <p>
          「始める」でいつでも新しい物語を始められます（何度でも最初から）。世界観・キャラクターは
          キャラクターと世界観にも自動で加わります。
        </p>
      </HelpDetails>
      {notice && <p className="notice">{notice}</p>}

      {cassettes.length === 0 ? (
        <div className="library-empty">
          <p>まだカセットがありません。「カセットを作る」か、カセットの PNG をここへドラッグしてください。</p>
        </div>
      ) : (
        <div className="cassette-grid">
          {cassettes.map((cas) => {
            return (
            <CassetteCard
              key={cas.id}
              cas={cas}
              onPlay={() => playCassette(cas.id)}
              onEdit={() => setEditing({ cassette: cas })}
              onExport={() => doExport(cas)}
              onDelete={() => doDelete(cas)}
            />
            )
          })}
        </div>
      )}

      {editing && (
        <CassetteEditor cassette={editing.cassette} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}
