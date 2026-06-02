'use client'

import { useEffect, useState, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'

type PostDetail = {
  id: string
  slot: string
  scheduledAt: string
  themeName: string
  imagePrompt: string
  tweetText: string
  japaneseTranslation: string
  imagePath: string | null
  status: string
  tweetId: string | null
  postedAt: string | null
}

export default function PostDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [post, setPost] = useState<PostDetail | null>(null)
  const [tweetText, setTweetText] = useState('')
  const [uploading, setUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetch(`/api/posts/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        setPost(data)
        setTweetText(data.tweetText)
      })
  }, [params.id])

  const uploadFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setMessage('Image files only.')
      return
    }
    setUploading(true)
    setMessage('')
    const formData = new FormData()
    formData.append('image', file)
    const res = await fetch(`/api/upload/${params.id}`, { method: 'POST', body: formData })
    if (res.ok) {
      setPost((p) => p ? { ...p, imagePath: 'uploaded', status: 'ready' } : p)
      setMessage('Image uploaded!')
    } else {
      setMessage('Upload failed.')
    }
    setUploading(false)
  }, [params.id])

  // Ctrl+V / Cmd+V でクリップボードの画像を貼り付け
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (uploading) return
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) uploadFile(file)
          break
        }
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [uploading, uploadFile])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
    e.target.value = ''
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) uploadFile(file)
  }

  const handlePost = () => {
    startTransition(async () => {
      const res = await fetch(`/api/posts/${params.id}/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tweetText }),
      })
      const data = await res.json()
      if (data.ok) {
        setMessage(`Posted! Tweet ID: ${data.tweetId}`)
        setPost((p) => p ? { ...p, status: 'posted', tweetId: data.tweetId } : p)
      } else {
        setMessage(`Error: ${data.error}`)
      }
    })
  }

  const handleSaveText = async () => {
    const res = await fetch(`/api/posts/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tweetText }),
    })
    if (res.ok) setMessage('Text saved.')
  }

  if (!post) return <div className="text-slate-400 text-center py-16">Loading...</div>

  const isPosted = post.status === 'posted'
  const canPost = post.status === 'ready' && !isPending

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <button onClick={() => router.back()} className="text-sm text-slate-400 hover:text-white">
        ← Back
      </button>

      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <span className="text-2xl">🌸</span>
        <div>
          <p className="font-medium text-pink-200">{post.themeName}</p>
          <p className="text-xs text-slate-400 capitalize">{post.slot} · {new Date(post.scheduledAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</p>
        </div>
        <span className={`ml-auto rounded-full px-3 py-1 text-xs font-medium ${
          isPosted ? 'bg-green-900/50 text-green-300' :
          post.status === 'ready' ? 'bg-blue-900/50 text-blue-300' :
          'bg-yellow-900/50 text-yellow-300'
        }`}>{post.status}</span>
      </div>

      {/* 画像エリア */}
      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
        <h3 className="text-sm font-medium text-slate-300 mb-3">Image</h3>
        {post.imagePath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/image/${post.id}`} alt="" className="w-full rounded-lg object-cover max-h-96" />
        ) : (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              isDragging
                ? 'border-pink-500 bg-pink-950/20'
                : 'border-slate-600'
            }`}
          >
            {uploading ? (
              <p className="text-slate-400 text-sm">Uploading...</p>
            ) : (
              <>
                <p className="text-slate-400 text-sm mb-1">
                  No image yet. Upload after generating in Pollo AI.
                </p>
                <p className="text-slate-600 text-xs mb-4">
                  Drop image here, paste with Ctrl+V, or click to select
                </p>
                <label className="cursor-pointer rounded-lg bg-pink-800 hover:bg-pink-700 px-4 py-2 text-sm text-white">
                  Upload Image
                  <input type="file" accept="image/*" className="hidden" onChange={handleInputChange} />
                </label>
              </>
            )}
          </div>
        )}
        {post.imagePath && !isPosted && (
          <label className="mt-3 block cursor-pointer rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-400 hover:border-pink-600 text-center">
            Replace image
            <input type="file" accept="image/*" className="hidden" onChange={handleInputChange} />
          </label>
        )}
      </div>

      {/* Pollo AI プロンプト */}
      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
        <h3 className="text-sm font-medium text-slate-300 mb-2">Pollo AI Image Prompt</h3>
        <p className="text-xs text-slate-400 mb-2">Copy this prompt into Pollo AI to generate Hana&apos;s image.</p>
        <div className="rounded-lg bg-slate-800 p-3 text-xs text-slate-300 leading-relaxed select-all">
          {post.imagePrompt}
        </div>
        <button
          onClick={() => navigator.clipboard.writeText(post.imagePrompt)}
          className="mt-2 text-xs text-pink-400 hover:text-pink-300"
        >
          Copy to clipboard
        </button>
      </div>

      {/* ツイート本文 */}
      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
        <h3 className="text-sm font-medium text-slate-300 mb-2">
          Tweet Text <span className="text-slate-500 font-normal">({tweetText.length} chars)</span>
        </h3>
        <textarea
          value={tweetText}
          onChange={(e) => setTweetText(e.target.value)}
          disabled={isPosted}
          rows={6}
          className="w-full rounded-lg bg-slate-800 border border-slate-600 p-3 text-sm text-slate-200 resize-none focus:outline-none focus:border-pink-600 disabled:opacity-60"
        />
        {!isPosted && (
          <button onClick={handleSaveText} className="mt-2 text-xs text-slate-400 hover:text-white">
            Save changes
          </button>
        )}
        {post.japaneseTranslation && (
          <div className="mt-3 rounded-lg bg-slate-800/60 border border-slate-700/50 p-3">
            <p className="text-xs text-slate-500 mb-1">🇯🇵 日本語訳（カンペ）</p>
            <p className="text-sm text-slate-300 leading-relaxed">{post.japaneseTranslation}</p>
          </div>
        )}
      </div>

      {/* 投稿ボタン */}
      {!isPosted && (
        <button
          onClick={handlePost}
          disabled={!canPost}
          className="w-full rounded-xl bg-pink-700 hover:bg-pink-600 disabled:opacity-40 disabled:cursor-not-allowed py-4 text-lg font-bold text-white transition"
        >
          {isPending ? 'Posting...' : post.status === 'draft' ? 'Upload image first' : '🌸 Post to Twitter'}
        </button>
      )}

      {isPosted && post.tweetId && (
        <div className="rounded-xl border border-green-800/40 bg-green-950/30 p-4 text-center">
          <p className="text-green-400 font-medium">Posted successfully</p>
          <a
            href={`https://twitter.com/i/web/status/${post.tweetId}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-400 hover:underline"
          >
            View on Twitter
          </a>
        </div>
      )}

      {message && (
        <p className="text-sm text-center text-slate-400">{message}</p>
      )}
    </div>
  )
}
