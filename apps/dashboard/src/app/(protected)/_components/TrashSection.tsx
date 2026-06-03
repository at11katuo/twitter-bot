'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type DeletedPost = {
  id: string
  tweetText: string
  themeName: string
  deletedAt: string
  imagePath: string | null
}

export default function TrashSection({ posts }: { posts: DeletedPost[] }) {
  const router = useRouter()
  const [items, setItems] = useState(posts)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  async function restore(id: string) {
    await fetch(`/api/posts/${id}/restore`, { method: 'POST' })
    setItems((prev) => prev.filter((p) => p.id !== id))
    router.refresh()
  }

  async function permanentDelete(id: string) {
    await fetch(`/api/posts/${id}/permanent`, { method: 'DELETE' })
    setItems((prev) => prev.filter((p) => p.id !== id))
    setConfirmId(null)
  }

  if (items.length === 0) return null

  return (
    <details className="group rounded-2xl border border-red-900/30 bg-slate-900/40 overflow-hidden">
      <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer select-none list-none active:bg-slate-800/60 touch-manipulation">
        <div className="flex items-center gap-2">
          <span className="text-sm">🗑</span>
          <span className="text-sm font-semibold text-slate-400">ゴミ箱</span>
          <span className="text-xs text-red-400/70 bg-red-900/20 rounded-full px-2 py-0.5">{items.length}件</span>
          <span className="text-xs text-slate-600">（30日後に自動完全削除）</span>
        </div>
        <span className="text-slate-500 text-xs transition-transform group-open:rotate-180">▼</span>
      </summary>

      <div className="px-3 pb-3 pt-3 space-y-2 border-t border-red-900/20">
        {items.map((post) => {
          const deletedDate = new Date(post.deletedAt).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })
          return (
            <div key={post.id} className="rounded-xl border border-slate-700/30 bg-slate-800/40 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-500 mb-0.5">{post.themeName} · 削除日: {deletedDate}</p>
                  <p className="text-xs text-slate-400 line-clamp-2 leading-snug">{post.tweetText}</p>
                </div>
              </div>

              {confirmId === post.id ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmId(null)}
                    className="flex-1 h-9 rounded-xl border border-slate-600 text-xs text-slate-400 active:bg-slate-700 touch-manipulation"
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={() => permanentDelete(post.id)}
                    className="flex-1 h-9 rounded-xl bg-red-800 active:bg-red-700 text-xs font-bold text-white touch-manipulation"
                  >
                    完全削除する
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => restore(post.id)}
                    className="flex-1 h-9 rounded-xl bg-slate-700 active:bg-slate-600 text-xs font-semibold text-slate-200 touch-manipulation"
                  >
                    ↩ 復元
                  </button>
                  <button
                    onClick={() => setConfirmId(post.id)}
                    className="flex-1 h-9 rounded-xl border border-red-800/50 text-xs text-red-400 active:bg-red-950/40 touch-manipulation"
                  >
                    🗑 完全削除
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </details>
  )
}
