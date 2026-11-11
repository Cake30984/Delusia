import { useEffect, useState, type CSSProperties } from 'react'
import { useImageUrl } from '../lib/imageStore'
import { contrastRatio, isHexColor } from '../lib/palette'
import type { Avatar } from '../types'

/** イニシャルの文字色。人物ごとの色の上で白と黒のうち読みやすい方（色が無ければ画面の文字色） */
function initialColor(bg: string | undefined): string {
  if (!bg || !isHexColor(bg)) return 'var(--ink)'
  return contrastRatio('#FFFFFF', bg) >= contrastRatio('#000000', bg) ? '#FFFFFF' : '#000000'
}

interface Props {
  avatar?: Avatar
  /** イニシャルのフォールバック表示に使う名前 */
  name: string
  /** 既存クラス（.avatar / .entity-avatar / .dot-avatar 等）のサイズ・角丸を流用する */
  className?: string
  /** 指定時はクラスの既定サイズを上書き */
  size?: number
  style?: CSSProperties
}

/** 画像があれば表示、なければ色＋名前イニシャルで表示する共通アバター */
export default function EntityAvatar({ avatar, name, className, size, style }: Props) {
  const url = useImageUrl(avatar?.imageId)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [avatar?.imageId])

  const dimStyle: CSSProperties = size ? { width: size, height: size } : {}
  const initial = Array.from(name.trim())[0] ?? '?'

  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        className={className}
        style={{ ...dimStyle, ...style, objectFit: 'cover' }}
        onError={() => setFailed(true)}
      />
    )
  }

  return (
    <div
      className={className}
      style={{ ...dimStyle, ...style, background: avatar?.color ?? 'var(--tint)', color: initialColor(avatar?.color) }}
    >
      {initial}
    </div>
  )
}
