'use client'
import { useState } from 'react'

async function fetchReplyDrafts(post: string, author: string | null, n: number): Promise<string[]> {
  const res = await fetch('/api/reply-drafts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ post, author, n }),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(data.error ?? 'draft generation failed')
  return data.drafts as string[]
}

export default function ReplyDraftPanel() {
  const [post, setPost]     = useState('')
  const [author, setAuthor] = useState('')
  const [drafts, setDrafts] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')
  const [copied, setCopied] = useState<number | null>(null)

  async function handleGenerate() {
    if (!post.trim()) { setError('投稿本文を入力してください'); return }
    setLoading(true); setError(''); setDrafts([])
    try {
      const result = await fetchReplyDrafts(post.trim(), author.trim() || null, 3)
      setDrafts(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy(text: string, index: number) {
    await navigator.clipboard.writeText(text)
    setCopied(index)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-700/50 bg-slate-900/60 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-pink-200">🌸 リプライ下書き生成</h2>

        <div className="space-y-1">
          <label className="text-xs text-slate-400">相手の投稿本文</label>
          <textarea
            value={post}
            onChange={e => setPost(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-pink-700"
            placeholder="例: Just visited Kyoto, the temples were stunning!"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-slate-400">相手のハンドル（任意）</label>
          <input
            value={author}
            onChange={e => setAuthor(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-pink-700"
            placeholder="@TokyoCheapo"
          />
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading}
          className="w-full rounded-xl bg-pink-800 py-2.5 text-sm font-semibold text-white transition hover:bg-pink-700 disabled:opacity-50"
        >
          {loading ? '生成中…' : '候補を生成'}
        </button>

        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>

      {drafts.length > 0 && (
        <div className="space-y-2">
          {drafts.map((d, i) => (
            <div key={i} className="rounded-2xl border border-slate-700/50 bg-slate-900/60 p-4 space-y-2">
              <p className="text-xs text-slate-500">候補 {i + 1}</p>
              <p className="text-sm text-slate-200 leading-relaxed">{d}</p>
              <button
                onClick={() => handleCopy(d, i)}
                className="text-xs rounded-lg bg-slate-700 px-3 py-1.5 text-slate-300 transition hover:bg-slate-600"
              >
                {copied === i ? 'コピー完了 ✓' : 'コピー'}
              </button>
            </div>
          ))}
          <p className="text-xs text-slate-600 text-center pb-2">
            ※ 送信は手動。候補を選んでXで返信してください。
          </p>
        </div>
      )}
    </div>
  )
}
