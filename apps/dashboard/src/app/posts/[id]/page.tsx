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
  mediaType: string  // "image" | "video"
  status: string
  tweetId: string | null
  postedAt: string | null
}

function slotEmoji(slot: string) {
  if (slot === 'morning') return '☀️'
  if (slot === 'noon')    return '🌿'
  return '🌙'
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
      .then((data: PostDetail) => {
        setPost(data)
        setTweetText(data.tweetText)
      })
  }, [params.id])

  // ── 画像アップロード共通処理 ──────────────────────────────────────
  const uploadFile = useCallback(async (file: File) => {
    const isVideo = file.type.startsWith('video/')
    const isImage = file.type.startsWith('image/')
    if (!isImage && !isVideo) {
      setMessage('画像または動画ファイルのみ対応しています。')
      return
    }
    setUploading(true)
    setMessage('')
    const formData = new FormData()
    formData.append('image', file)
    const res = await fetch(`/api/upload/${params.id}`, { method: 'POST', body: formData })
    if (res.ok) {
      const data = await res.json()
      setPost((p) => p ? { ...p, imagePath: 'uploaded', mediaType: data.mediaType ?? 'image' } : p)
      setMessage(isVideo ? '✅ 動画を保存しました' : '✅ 画像を保存しました')
    } else {
      setMessage('❌ アップロードに失敗しました')
    }
    setUploading(false)
  }, [params.id])

  // Ctrl+V / Cmd+V ペースト
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

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false) }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) uploadFile(file)
  }

  // ── 予約登録 ──────────────────────────────────────────────────────
  const handleSchedule = () => {
    startTransition(async () => {
      const res = await fetch(`/api/posts/${params.id}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tweetText }),
      })
      const data = await res.json()
      if (data.ok) {
        setPost((p) => p ? { ...p, status: 'ready', tweetText } : p)
        setMessage('🕐 予約完了！自動投稿を待っています')
      } else {
        setMessage(`❌ エラー: ${data.error}`)
      }
    })
  }

  // ── 今すぐ投稿（テスト用） ────────────────────────────────────────
  const handlePostNow = () => {
    if (!confirm('今すぐ Twitter に投稿します。よろしいですか？')) return
    startTransition(async () => {
      const res = await fetch(`/api/posts/${params.id}/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tweetText }),
      })
      const data = await res.json()
      if (data.ok) {
        setPost((p) => p ? { ...p, status: 'posted', tweetId: data.tweetId } : p)
        setMessage(`✅ 投稿完了！ Tweet ID: ${data.tweetId}`)
      } else {
        setMessage(`❌ エラー: ${data.error}`)
      }
    })
  }

  // ── プロンプトコピー ───────────────────────────────────────────────
  const handleCopyPrompt = async () => {
    if (!post) return
    await navigator.clipboard.writeText(post.imagePrompt)
    setPromptCopied(true)
    setTimeout(() => setPromptCopied(false), 2000)
  }

  const handleSaveText = async () => {
    const res = await fetch(`/api/posts/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tweetText }),
    })
    if (res.ok) setMessage('💾 テキストを保存しました')
  }

  if (!post) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <p className="text-slate-400 text-sm">読み込み中...</p>
    </div>
  )

  const isPosted    = post.status === 'posted'
  const isScheduled = post.status === 'ready'
  const hasImage    = Boolean(post.imagePath)
  const canSchedule = hasImage && !isPosted && !isScheduled && !isPending

  const scheduledJST = new Date(post.scheduledAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })

  return (
    <div className="space-y-4 pb-10">
      {/* 戻るボタン */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1 text-sm text-slate-400 active:text-white py-2 touch-manipulation"
      >
        ← 一覧に戻る
      </button>

      {/* ヘッダーカード */}
      <div className="rounded-2xl border border-slate-700/50 bg-slate-900/60 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{slotEmoji(post.slot)}</span>
              <p className="font-semibold text-pink-200 text-base leading-tight truncate">{post.themeName}</p>
            </div>
            <p className="text-xs text-slate-400 capitalize">
              {post.slot} · 予定 {scheduledJST}
            </p>
          </div>
          <StatusBadge status={post.status} />
        </div>

        {/* 投稿済みリンク */}
        {isPosted && post.tweetId && (
          <a
            href={`https://twitter.com/i/web/status/${post.tweetId}`}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex items-center justify-center w-full h-11 rounded-xl bg-green-900/30 border border-green-700/40 text-sm text-green-400"
          >
            Twitter で確認する →
          </a>
        )}
      </div>

      {/* 画像エリア */}
      <div className="rounded-2xl border border-slate-700/50 bg-slate-900/60 p-4">
        <h3 className="text-sm font-semibold text-slate-300 mb-3">📷 画像</h3>

        {hasImage ? (
          <div className="space-y-3">
            {post.mediaType === 'video' ? (
              <video
                src={`/api/image/${post.id}`}
                controls
                playsInline
                className="w-full rounded-xl max-h-80 bg-black"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/image/${post.id}`}
                alt=""
                className="w-full rounded-xl object-cover max-h-80"
              />
            )}
            {!isPosted && (
              <label className="flex items-center justify-center w-full h-12 rounded-xl border border-slate-600 text-sm text-slate-400 active:bg-slate-800 cursor-pointer touch-manipulation">
                🔄 ファイルを差し替える
                <input type="file" accept="image/*,video/mp4,video/*" className="hidden" onChange={handleInputChange} />
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
                <span className="text-4xl opacity-30">🖼</span>
                <div className="text-center">
                  <p className="text-slate-300 text-sm font-medium">タップして画像 / 動画を選択</p>
                  <p className="text-slate-600 text-xs mt-0.5">ドラッグ＆ドロップ・Ctrl+V も可</p>
                  <p className="text-slate-700 text-xs">画像（jpg/png/gif）または動画（mp4）</p>
                </div>
                <span className="w-full rounded-xl bg-pink-700 active:bg-pink-800 py-3 text-center text-sm font-semibold text-white touch-manipulation">
                  フォトライブラリ / ファイルを選ぶ
                </span>
                <input type="file" accept="image/*,video/mp4,video/*" className="hidden" onChange={handleInputChange} />
              </label>
            )}
          </div>
        )}
      </div>

      {/* Pollo AI プロンプト */}
      <div className="rounded-2xl border border-slate-700/50 bg-slate-900/60 p-4">
        <h3 className="text-sm font-semibold text-slate-300 mb-1">🎨 Pollo AI プロンプト</h3>
        <p className="text-xs text-slate-500 mb-3">このプロンプトを Pollo AI に貼り付けて花の画像を生成してください。</p>
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
          disabled={isPosted || isScheduled}
          rows={6}
          className="w-full rounded-xl bg-slate-800 border border-slate-700 p-3 text-sm text-slate-200 leading-relaxed resize-none focus:outline-none focus:border-pink-600 disabled:opacity-60"
        />

        {!isPosted && !isScheduled && (
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

      {/* 予約ボタン / 予約済み表示 */}
      {!isPosted && (
        isScheduled ? (
          <div className="rounded-2xl border border-blue-800/40 bg-blue-950/30 p-5 text-center space-y-1">
            <p className="text-blue-300 font-semibold text-base">🕐 自動投稿を予約済み</p>
            <p className="text-xs text-slate-400">予定時刻: {scheduledJST}</p>
            <p className="text-xs text-slate-500">時刻になると自動でツイートされます</p>
          </div>
        ) : (
          <button
            onClick={handleSchedule}
            disabled={!canSchedule || isPending}
            className="w-full h-16 rounded-2xl bg-pink-700 active:bg-pink-800 disabled:opacity-40 disabled:cursor-not-allowed text-base font-bold text-white transition touch-manipulation shadow-lg shadow-pink-900/30"
          >
            {isPending
              ? '予約中...'
              : !hasImage
                ? '先に画像をアップロードしてください'
                : `🌸 Schedule Post（予約する）`}
          </button>
        )
      )}

      {/* 今すぐ投稿（テスト用） */}
      {!isPosted && hasImage && (
        <button
          onClick={handlePostNow}
          disabled={isPending}
          className="w-full h-12 rounded-xl border border-orange-700/60 text-orange-400 text-sm font-semibold active:bg-orange-900/20 disabled:opacity-40 transition touch-manipulation"
        >
          {isPending ? '投稿中...' : '⚡ 今すぐ投稿（テスト）'}
        </button>
      )}

      {isPosted && (
        <div className="rounded-2xl border border-green-800/40 bg-green-950/30 p-5 text-center space-y-2">
          <p className="text-green-400 font-semibold text-base">✅ 投稿完了</p>
          {post.postedAt && (
            <p className="text-xs text-slate-400">
              {new Date(post.postedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
            </p>
          )}
          {post.tweetId && (
            <a
              href={`https://twitter.com/i/web/status/${post.tweetId}`}
              target="_blank"
              rel="noreferrer"
              className="block text-sm text-blue-400 underline underline-offset-2"
            >
              Twitter で確認する →
            </a>
          )}
        </div>
      )}

      {message && (
        <p className="text-sm text-center text-slate-300 py-1">{message}</p>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    draft:   { label: '未予約',   cls: 'bg-yellow-900/50 text-yellow-300' },
    ready:   { label: '予約済み', cls: 'bg-blue-900/50 text-blue-300' },
    posted:  { label: '投稿済み', cls: 'bg-green-900/50 text-green-300' },
    skipped: { label: 'スキップ', cls: 'bg-gray-800 text-gray-400' },
  }
  const s = map[status] ?? { label: status, cls: 'bg-gray-800 text-gray-400' }
  return (
    <span className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${s.cls}`}>
      {s.label}
    </span>
  )
}
