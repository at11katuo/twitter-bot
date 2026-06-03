'use client'

import Link from 'next/link'
import { useState } from 'react'

type Post = {
  id: string
  slot: string
  themeName: string
  tweetText: string
  japaneseTranslation: string
  imagePath: string | null
  mediaType: string
  status: string
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  draft:   { label: '未対応',   cls: 'bg-yellow-900/50 text-yellow-300' },
  ready:   { label: '準備中',   cls: 'bg-blue-900/50 text-blue-300' },
  done:    { label: '投稿済み', cls: 'bg-green-900/50 text-green-300' },
  posted:  { label: '投稿済み', cls: 'bg-green-900/50 text-green-300' },
  skipped: { label: '却下',     cls: 'bg-gray-800 text-gray-400' },
}

const SLOT_TIME: Record<string, string> = {
  morning: '☀️ 08:00',
  noon:    '🌿 15:00',
  evening: '🌙 22:00',
}

export default function PostCardClient({ post: initial }: { post: Post }) {
  const [status, setStatus] = useState(initial.status)
  const [updating, setUpdating] = useState(false)

  const s = STATUS_MAP[status] ?? { label: status, cls: 'bg-gray-800 text-gray-400' }
  const isDone    = status === 'done' || status === 'posted'
  const isSkipped = status === 'skipped'
  const isActive  = !isDone && !isSkipped

  async function patch(newStatus: string) {
    setUpdating(true)
    await fetch(`/api/posts/${initial.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    setStatus(newStatus)
    setUpdating(false)
  }

  return (
    <div className="flex items-stretch gap-2 rounded-xl border border-slate-700/40 bg-slate-800/50 overflow-hidden">
      {/* メインリンク */}
      <Link
        href={`/posts/${initial.id}`}
        className="flex items-start gap-3 flex-1 p-3 active:bg-slate-700/60 transition touch-manipulation min-w-0"
      >
        {/* サムネイル */}
        <div className="w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-slate-700 flex items-center justify-center">
          {initial.imagePath ? (
            initial.mediaType === 'video' ? (
              <span className="text-2xl">🎬</span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/image/${initial.id}`} alt="" className="w-full h-full object-cover" />
            )
          ) : (
            <span className="text-xl opacity-20">🖼</span>
          )}
        </div>

        {/* テキスト */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs text-slate-500">{SLOT_TIME[initial.slot] ?? initial.slot}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>
          </div>
          <p className="text-xs font-medium text-slate-400 truncate mb-0.5">{initial.themeName}</p>
          <p className="text-sm text-slate-300 line-clamp-2 leading-snug">{initial.tweetText}</p>
        </div>
      </Link>

      {/* クイックアクション */}
      {isActive && (
        <div className="flex flex-col border-l border-slate-700/40 divide-y divide-slate-700/40">
          <button
            onClick={() => patch('done')}
            disabled={updating}
            className="flex-1 w-12 flex items-center justify-center text-lg active:bg-green-900/40 disabled:opacity-40 touch-manipulation"
            title="投稿済み"
          >
            ✅
          </button>
          <button
            onClick={() => patch('skipped')}
            disabled={updating}
            className="flex-1 w-12 flex items-center justify-center text-lg active:bg-red-900/40 disabled:opacity-40 touch-manipulation"
            title="却下"
          >
            ❌
          </button>
        </div>
      )}

      {isDone && (
        <div className="flex items-center justify-center w-12 border-l border-slate-700/40">
          <span className="text-lg">✅</span>
        </div>
      )}

      {isSkipped && (
        <button
          onClick={() => patch('draft')}
          disabled={updating}
          className="flex items-center justify-center w-12 border-l border-slate-700/40 active:bg-slate-700/60 touch-manipulation"
          title="下書きに戻す"
        >
          <span className="text-xs text-slate-500">↩</span>
        </button>
      )}
    </div>
  )
}
