'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface GenerationJob {
  id: string
  status: 'pending' | 'generating' | 'done' | 'failed'
  errorMessage: string | null
  postId: string | null
  createdAt: string
}

export default function GenerateRin({ referenceUrl }: { referenceUrl?: string }) {
  const router = useRouter()
  const [jobs, setJobs] = useState<GenerationJob[]>([])
  const [globalError, setGlobalError] = useState('')
  const pollingRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const pendingCount = useRef(0)  // 未完了リクエスト数

  const hasActiveJobs = jobs.some(j => j.status === 'pending' || j.status === 'generating')
  const isGenerating  = pendingCount.current > 0 || hasActiveJobs

  async function fetchJobs(): Promise<GenerationJob[]> {
    try {
      const res = await fetch('/api/jobs')
      if (res.ok) {
        const data = await res.json() as GenerationJob[]
        setJobs(data)
        return data
      }
    } catch { /* ignore */ }
    return []
  }

  // ポーリング: 5秒ごとにジョブ状態を取得しページを更新
  function startPolling() {
    if (pollingRef.current) return
    pollingRef.current = setInterval(async () => {
      const data = await fetchJobs()
      router.refresh()  // サーバーコンポーネント（投稿リスト）も再取得

      const stillActive = data.some(j => j.status === 'pending' || j.status === 'generating')
      if (!stillActive && pendingCount.current === 0) {
        clearInterval(pollingRef.current!)
        pollingRef.current = null
      }
    }, 5000)
  }

  function stopPolling() {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }

  useEffect(() => {
    fetchJobs()
    return stopPolling
  }, [])

  // fire-and-forget: レスポンスを待たずにポーリング開始
  async function generateOne(): Promise<boolean> {
    pendingCount.current += 1

    // リクエスト送信（await しない）
    const resPromise = fetch('/api/generate/rin', { method: 'POST' })

    // ルートがジョブを作成するまで少し待ってからポーリング開始
    await new Promise(r => setTimeout(r, 800))
    await fetchJobs()
    startPolling()

    // レスポンスを待つ（90秒程度かかる）
    let ok = false
    try {
      const res = await resPromise
      const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string }
      if (!res.ok) setGlobalError(data.error ?? '生成に失敗しました')
      else ok = true
    } catch {
      setGlobalError('通信エラー（タイムアウトの可能性）')
    } finally {
      pendingCount.current -= 1
      await fetchJobs()
    }
    return ok
  }

  async function handleGenerate(count: number) {
    setGlobalError('')
    for (let i = 0; i < count; i++) {
      await generateOne()
    }
    // 全ジョブ完了後に最終ページ更新
    if (pendingCount.current === 0) {
      await fetchJobs()
      router.refresh()
      stopPolling()
    }
  }

  async function handleClearJobs() {
    setGlobalError('')
    await fetch('/api/jobs', { method: 'DELETE' })
    stopPolling()
    pendingCount.current = 0
    await fetchJobs()
    router.refresh()
  }

  const refFilename = referenceUrl
    ? (referenceUrl.split('/').pop() ?? referenceUrl.slice(-20))
    : null

  function statusIcon(s: GenerationJob['status']) {
    if (s === 'pending')    return '⏳'
    if (s === 'generating') return '🔄'
    if (s === 'done')       return '✅'
    return '❌'
  }

  return (
    <div className="rounded-2xl border border-pink-900/40 bg-indigo-950/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">🌸</span>
        <h2 className="text-sm font-semibold text-pink-200">凛（Rin）生成</h2>
        {isGenerating && (
          <span className="ml-auto text-xs text-blue-400 animate-pulse">● 処理中</span>
        )}
      </div>

      {/* 参照画像インジケーター */}
      {referenceUrl ? (
        <div className="flex items-center gap-3 p-2 rounded-xl bg-slate-900/60 border border-slate-700/40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={referenceUrl}
            alt="参照画像"
            className="w-12 h-12 rounded-lg object-cover flex-shrink-0 border border-slate-600/40"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-400 mb-0.5">現在の参照画像</p>
            <p className="text-xs text-slate-500 truncate font-mono">{refFilename}</p>
          </div>
        </div>
      ) : (
        <div className="p-2 rounded-xl bg-red-900/20 border border-red-700/40">
          <p className="text-xs text-red-400">⚠️ REFERENCE_IMAGE_URL 未設定</p>
        </div>
      )}

      {/* 生成ボタン（設定ページへ遷移） */}
      <div className="grid grid-cols-3 gap-2">
        {([1, 2, 4] as const).map(n => (
          <button
            key={n}
            onClick={() => router.push(`/generate?count=${n}`)}
            disabled={isGenerating}
            className="h-11 rounded-xl bg-pink-900/50 active:bg-pink-800/70 disabled:opacity-40 text-xs font-semibold text-pink-200 touch-manipulation"
          >
            {n}件
          </button>
        ))}
      </div>

      {globalError && <p className="text-xs text-red-400 text-center">{globalError}</p>}

      {/* ジョブ状態リスト */}
      {jobs.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500 font-medium">最近のジョブ</p>
            {jobs.some(j => j.status === 'pending' || j.status === 'generating') && (
              <button
                onClick={handleClearJobs}
                className="text-xs text-slate-500 hover:text-red-400 underline"
              >
                スタック中をクリア
              </button>
            )}
          </div>
          {jobs.map(j => (
            <div key={j.id} className="flex items-start gap-2 text-xs rounded-lg px-2 py-1.5 bg-slate-900/40 border border-slate-700/20">
              <span className="flex-shrink-0 mt-0.5">{statusIcon(j.status)}</span>
              <div className="min-w-0 flex-1">
                {j.status === 'pending'    && <span className="text-slate-400">準備中</span>}
                {j.status === 'generating' && <span className="text-blue-400 animate-pulse">生成中...</span>}
                {j.status === 'done'       && <span className="text-green-400">完了</span>}
                {j.status === 'failed'     && (
                  <span className="text-red-400 break-words">失敗: {j.errorMessage?.slice(0, 80) ?? 'unknown error'}</span>
                )}
              </div>
              {j.status === 'failed' && (
                <button
                  onClick={() => handleGenerate(1)}
                  disabled={isGenerating}
                  className="flex-shrink-0 text-xs text-pink-400 underline hover:text-pink-300 disabled:opacity-40"
                >
                  再試行
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
