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
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const hasActiveJobs = jobs.some(j => j.status === 'pending' || j.status === 'generating')

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

  function startPolling() {
    if (pollingRef.current) return
    pollingRef.current = setInterval(async () => {
      const data = await fetchJobs()
      const stillActive = data.some(j => j.status === 'pending' || j.status === 'generating')
      if (!stillActive) {
        clearInterval(pollingRef.current!)
        pollingRef.current = null
        router.refresh()
      }
    }, 3000)
  }

  useEffect(() => {
    fetchJobs()
    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [])

  async function generateOne(): Promise<boolean> {
    const res = await fetch('/api/generate/rin', { method: 'POST' })
    await fetchJobs()
    startPolling()
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string }
      setGlobalError(data.error ?? '生成に失敗しました')
      return false
    }
    return true
  }

  async function handleGenerate(count: number) {
    setGlobalError('')
    for (let i = 0; i < count; i++) {
      const ok = await generateOne()
      if (!ok) break
    }
  }

  const refFilename = referenceUrl
    ? (referenceUrl.split('/').pop() ?? referenceUrl.slice(-20))
    : null

  function statusIcon(status: GenerationJob['status']) {
    if (status === 'pending')    return '⏳'
    if (status === 'generating') return '🔄'
    if (status === 'done')       return '✅'
    return '❌'
  }

  return (
    <div className="rounded-2xl border border-pink-900/40 bg-indigo-950/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">🌸</span>
        <h2 className="text-sm font-semibold text-pink-200">凛（Rin）生成</h2>
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

      {/* 生成ボタン */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => handleGenerate(1)}
          disabled={hasActiveJobs}
          className="h-11 rounded-xl bg-pink-900/50 active:bg-pink-800/70 disabled:opacity-40 text-xs font-semibold text-pink-200 touch-manipulation"
        >
          {hasActiveJobs ? '生成中...' : '＋1件'}
        </button>
        <button
          onClick={() => handleGenerate(2)}
          disabled={hasActiveJobs}
          className="h-11 rounded-xl bg-pink-900/50 active:bg-pink-800/70 disabled:opacity-40 text-xs font-semibold text-pink-200 touch-manipulation"
        >
          今日分<br /><span className="text-xs font-normal opacity-70">2件</span>
        </button>
        <button
          onClick={() => handleGenerate(14)}
          disabled={hasActiveJobs}
          className="h-11 rounded-xl bg-pink-700/60 active:bg-pink-700/80 disabled:opacity-40 text-xs font-semibold text-pink-100 touch-manipulation"
        >
          7日分<br /><span className="text-xs font-normal opacity-70">14件</span>
        </button>
      </div>

      {globalError && <p className="text-xs text-red-400 text-center">{globalError}</p>}

      {/* ジョブ状態リスト */}
      {jobs.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-slate-500 font-medium">最近のジョブ</p>
          {jobs.map(j => (
            <div key={j.id} className="flex items-start gap-2 text-xs rounded-lg px-2 py-1.5 bg-slate-900/40 border border-slate-700/20">
              <span className="flex-shrink-0 mt-0.5">{statusIcon(j.status)}</span>
              <div className="min-w-0 flex-1">
                {j.status === 'pending'    && <span className="text-slate-400">準備中</span>}
                {j.status === 'generating' && <span className="text-blue-400">生成中...</span>}
                {j.status === 'done'       && <span className="text-green-400">完了</span>}
                {j.status === 'failed'     && (
                  <span className="text-red-400 break-words">失敗: {j.errorMessage?.slice(0, 80) ?? 'unknown error'}</span>
                )}
              </div>
              {j.status === 'failed' && (
                <button
                  onClick={() => handleGenerate(1)}
                  disabled={hasActiveJobs}
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
