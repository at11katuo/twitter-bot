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
  const [promptCopied, setPromptCopied] = useState(false)

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
      setMessage('画像ファイルのみ対応しています。')
      return
    }
    setUploading(true)
    setMessage('')
    const formData = new FormData()
    formData.append('image', file)
    const res = await fetch(`/api/upload/${params.id}`, { method: 'POST', body: formData })
    if (res.ok) {
      setPost((p) => p ? { ...p, imagePath: 'uploaded', status: 'ready' } : p)
      setMessage('✅ 画像をアップロードしました')
    } else {
      setMessage('❌ アップロードに失敗しました')
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
        setMessage(`✅ 投稿完了！ Tweet ID: ${data.tweetId}`)
        setPost((p) => p ? { ...p, status: 'posted', tweetId: data.tweetId } : p)
      } else {
        setMessage(`❌ エラー: ${data.error}`)
      }
    })
  }

  const handleSaveText = async () => {
    const res = await fetch(`/api/posts/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tweetText }),
    })
    if (res.ok) setMessage('💾 保存しました')
  }

  const handleCopyPrompt = async () => {
    if (!post) return
    await navigator.clipboard.writeText(post.imagePrompt)
    setPromptCopied(true)
    setTimeout(() => setPromptCopied(false), 2000)
  }

  if (!post) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <p className="text-slate-400 text-sm">読み込み中...</p>
    </div>
  )

  const isPosted = post.status === 'posted'
  const canPost = post.status === 'ready' && !isPending

  return (
    <div className="space-y-4 pb-8">
      {/* 戻るボタン */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1 text-sm text-slate-400 active:text-white py-1 touch-manipulation"
      >
        ← 一覧に戻る
      </button>

      {/* ヘッダー */}
      <div className="rounded-2xl border border-slate-700/50 bg-slate-900/60 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-pink-200 text-base leading-tight">{post.themeName}</p>
            <p className="text-xs text-slate-400 mt-0.5 capitalize">
              {post.slot} · {new Date(post.scheduledAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
            </p>
          </div>
          <span className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
            isPosted          ? 'bg-green-900/50 text-green-300' :
            post.status === 'ready' ? 'bg-blue-900/50 text-blue-300' :
            'bg-yellow-900/50 text-yellow-300'
          }`}>{post.status}</span>
        </div>
      </div>

      {/* 画像エリア */}
      <div className="rounded-2xl border border-slate-700/50 bg-slate-900/60 p-4">
        <h3 className="text-sm font-semibold text-slate-300 mb-3">📷 Image</h3>

        {post.imagePath ? (
          <div className="space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/image/${post.id}`}
              alt=""
              className="w-full rounded-xl object-cover max-h-80"
            />
            {!isPosted && (
              <label className="flex items-center justify-center w-full h-12 rounded-xl border border-slate-600 text-sm text-slate-400 active:bg-slate-800 transition cursor-pointer touch-manipulation">
                🔄 画像を差し替える
                <input
                  type="file"
                  accept="image/*"
                  capture={undefined}
                  className="hidden"
                  onChange={handleInputChange}
                />
              </label>
            )}
          </div>
        ) : (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`rounded-xl border-2 border-dashed transition-colors ${
              isDragging ? 'border-pink-500 bg-pink-950/20' : 'border-slate-600'
            }`}
          >
            {uploading ? (
              <div className="flex items-center justify-center h-32">
                <p className="text-slate-400 text-sm">アップロード中...</p>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-3 p-8 cursor-pointer touch-manipulation">
                <span className="text-4xl opacity-40">🖼</span>
                <div className="text-center">
                  <p className="text-slate-300 text-sm font-medium">タップして写真を選択</p>
                  <p className="text-slate-600 text-xs mt-0.5">またはドラッグ＆ドロップ・Ctrl+V</p>
                </div>
                <span className="rounded-xl bg-pink-700 active:bg-pink-800 px-6 py-3 text-sm font-semibold text-white touch-manipulation">
                  フォトライブラリから選ぶ
                </span>
                <input
                  type="file"
                  accept="image/*"
                  capture={undefined}
                  className="hidden"
                  onChange={handleInputChange}
                />
              </label>
            )}
          </div>
        )}
      </div>

      {/* Pollo AI プロンプト */}
      <div className="rounded-2xl border border-slate-700/50 bg-slate-900/60 p-4">
        <h3 className="text-sm font-semibold text-slate-300 mb-1">🎨 Pollo AI プロンプト</h3>
        <p className="text-xs text-slate-500 mb-3">このプロンプトをPollo AIに貼り付けて花の画像を生成してください。</p>
        <div className="rounded-xl bg-slate-800 p-3 text-xs text-slate-300 leading-relaxed select-all mb-3">
          {post.imagePrompt}
        </div>
        <button
          onClick={handleCopyPrompt}
          className={`w-full h-12 rounded-xl text-sm font-semibold transition touch-manipulation ${
            promptCopied
              ? 'bg-green-800 text-green-200'
              : 'bg-slate-700 active:bg-slate-600 text-slate-200'
          }`}
        >
          {promptCopied ? '✅ コピーしました！' : '📋 プロンプトをコピー'}
        </button>
      </div>

      {/* ツイート本文 + 日本語訳 */}
      <div className="rounded-2xl border border-slate-700/50 bg-slate-900/60 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-300">✍️ ツイート本文</h3>
          <span className="text-xs text-slate-500">{tweetText.length} chars</span>
        </div>

        <textarea
          value={tweetText}
          onChange={(e) => setTweetText(e.target.value)}
          disabled={isPosted}
          rows={6}
          className="w-full rounded-xl bg-slate-800 border border-slate-700 p-3 text-sm text-slate-200 leading-relaxed resize-none focus:outline-none focus:border-pink-600 disabled:opacity-60"
        />

        {!isPosted && (
          <button
            onClick={handleSaveText}
            className="w-full h-11 rounded-xl border border-slate-600 text-sm text-slate-400 active:bg-slate-800 transition touch-manipulation"
          >
            💾 テキストを保存
          </button>
        )}

        {/* 日本語訳（カンペ） */}
        {post.japaneseTranslation && (
          <div className="rounded-xl bg-indigo-950/60 border border-indigo-800/40 p-4">
            <p className="text-xs font-semibold text-indigo-400 mb-2">🇯🇵 日本語訳（カンペ）</p>
            <p className="text-sm text-slate-200 leading-relaxed">{post.japaneseTranslation}</p>
          </div>
        )}
      </div>

      {/* 投稿ボタン */}
      {!isPosted && (
        <button
          onClick={handlePost}
          disabled={!canPost}
          className="w-full h-16 rounded-2xl bg-pink-700 active:bg-pink-800 disabled:opacity-40 disabled:cursor-not-allowed text-lg font-bold text-white transition touch-manipulation shadow-lg shadow-pink-900/30"
        >
          {isPending
            ? '投稿中...'
            : post.status === 'draft'
              ? '画像をアップロードしてください'
              : '🌸 Twitterに投稿する'}
        </button>
      )}

      {isPosted && post.tweetId && (
        <div className="rounded-2xl border border-green-800/40 bg-green-950/30 p-5 text-center space-y-2">
          <p className="text-green-400 font-semibold text-base">投稿完了 ✅</p>
          <a
            href={`https://twitter.com/i/web/status/${post.tweetId}`}
            target="_blank"
            rel="noreferrer"
            className="block text-sm text-blue-400 underline underline-offset-2"
          >
            Twitterで確認する →
          </a>
        </div>
      )}

      {message && (
        <p className="text-sm text-center text-slate-300 py-1">{message}</p>
      )}
    </div>
  )
}
