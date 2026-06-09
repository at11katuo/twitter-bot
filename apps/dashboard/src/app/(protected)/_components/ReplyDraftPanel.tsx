'use client'
import { useState } from 'react'

interface Draft {
  reply: string
  reply_ja?: string
  image_prompt: string
}

async function fetchReplyDrafts(
  post: string,
  author: string | null,
  tone: string | null,
  n: number,
): Promise<Draft[]> {
  const res = await fetch('/api/reply-drafts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ post, author, tone, n }),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(data.error ?? 'draft generation failed')
  return data.drafts as Draft[]
}

async function generateReplyImage(imagePrompt: string): Promise<string> {
  const res = await fetch('/api/generate/reply-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imagePrompt }),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(data.error ?? 'image generation failed')
  return data.imageUrl as string
}

export default function ReplyDraftPanel() {
  const [post, setPost]     = useState('')
  const [author, setAuthor] = useState('')
  const [tone, setTone]     = useState('')
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [copied, setCopied]     = useState<string | null>(null)
  const [imgLoading, setImgLoading] = useState<number | null>(null)
  const [images, setImages]     = useState<Record<number, string>>({})
  const [imgErrors, setImgErrors] = useState<Record<number, string>>({})

  async function handleGenerate() {
    if (!post.trim()) { setError('投稿本文を入力してください'); return }
    setLoading(true); setError(''); setDrafts([]); setImages({}); setImgErrors({})
    try {
      const result = await fetchReplyDrafts(post.trim(), author.trim() || null, tone.trim() || null, 3)
      setDrafts(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy(text: string, key: string) {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  async function handleGenerateImage(index: number, imagePrompt: string) {
    setImgLoading(index)
    setImgErrors(prev => { const n = { ...prev }; delete n[index]; return n })
    try {
      const imageUrl = await generateReplyImage(imagePrompt)
      setImages(prev => ({ ...prev, [index]: imageUrl }))
    } catch (e) {
      setImgErrors(prev => ({ ...prev, [index]: e instanceof Error ? e.message : '生成エラー' }))
    } finally {
      setImgLoading(null)
    }
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
            placeholder="例: Misty winter shrine at dawn, utterly silent."
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-xs text-slate-400">相手のハンドル（任意）</label>
            <input
              value={author}
              onChange={e => setAuthor(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-pink-700"
              placeholder="@TokyoCheapo"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-400">写真のトーン（任意）</label>
            <input
              value={tone}
              onChange={e => setTone(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-pink-700"
              placeholder="例: cold blue winter light, misty"
            />
          </div>
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
            <div key={i} className="rounded-2xl border border-slate-700/50 bg-slate-900/60 p-4 space-y-3">
              <p className="text-xs text-slate-500">候補 {i + 1}</p>

              <div className="space-y-1">
                <div className="flex items-baseline gap-2">
                  <p className="text-xs text-pink-400 font-medium">REPLY</p>
                  <p className="text-xs text-slate-500">{d.reply.length}字</p>
                  {d.reply.length > 140 && (
                    <p className="text-xs text-red-400 font-semibold">⚠ 140字超過</p>
                  )}
                </div>
                <p className="text-sm text-slate-200 leading-relaxed">{d.reply}</p>
                {d.reply_ja && (
                  <p className="text-xs text-slate-500 leading-relaxed italic">{d.reply_ja}</p>
                )}
                <button
                  onClick={() => handleCopy(d.reply, `reply-${i}`)}
                  className="text-xs rounded-lg bg-slate-700 px-3 py-1.5 text-slate-300 transition hover:bg-slate-600"
                >
                  {copied === `reply-${i}` ? 'コピー完了 ✓' : 'リプ文コピー'}
                </button>
              </div>

              {d.image_prompt && (
                <div className="space-y-2 border-t border-slate-700/50 pt-3">
                  <p className="text-xs text-teal-400 font-medium">IMAGE PROMPT</p>
                  <p className="text-xs text-slate-400 leading-relaxed font-mono">{d.image_prompt}</p>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => handleCopy(d.image_prompt, `img-${i}`)}
                      className="text-xs rounded-lg bg-slate-700 px-3 py-1.5 text-slate-300 transition hover:bg-slate-600"
                    >
                      {copied === `img-${i}` ? 'コピー完了 ✓' : 'プロンプトコピー'}
                    </button>
                    <button
                      onClick={() => handleGenerateImage(i, d.image_prompt)}
                      disabled={imgLoading !== null}
                      className="text-xs rounded-lg bg-teal-800 px-3 py-1.5 text-teal-200 transition hover:bg-teal-700 disabled:opacity-50"
                    >
                      {imgLoading === i ? '生成中… (1〜2分)' : '画像を生成'}
                    </button>
                  </div>
                  {imgErrors[i] && <p className="text-xs text-red-400">{imgErrors[i]}</p>}
                </div>
              )}

              {images[i] && (
                <img
                  src={images[i]}
                  alt={`生成画像 候補${i + 1}`}
                  className="rounded-xl w-full max-w-sm object-cover"
                />
              )}
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
