'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function GenerateRin() {
  const router = useRouter()
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState('')

  async function generateOne(): Promise<boolean> {
    const res = await fetch('/api/generate/rin', { method: 'POST' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? '生成に失敗しました')
      return false
    }
    return true
  }

  async function handleGenerate(count: number) {
    setError('')
    setProgress({ done: 0, total: count })
    for (let i = 0; i < count; i++) {
      const ok = await generateOne()
      if (!ok) break
      setProgress({ done: i + 1, total: count })
    }
    setProgress(null)
    router.refresh()
  }

  const isGenerating = progress !== null

  return (
    <div className="rounded-2xl border border-pink-900/40 bg-indigo-950/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">🌸</span>
        <h2 className="text-sm font-semibold text-pink-200">凛（Rin）生成</h2>
      </div>

      {isGenerating ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>⏳ 生成中... ({progress.done}/{progress.total})</span>
            <span>{Math.round((progress.done / progress.total) * 100)}%</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2">
            <div
              className="bg-pink-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 text-center">fal.ai で画像生成中です。しばらくお待ちください。</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => handleGenerate(1)}
            className="h-11 rounded-xl bg-pink-900/50 active:bg-pink-800/70 text-xs font-semibold text-pink-200 touch-manipulation"
          >
            ＋1件
          </button>
          <button
            onClick={() => handleGenerate(2)}
            className="h-11 rounded-xl bg-pink-900/50 active:bg-pink-800/70 text-xs font-semibold text-pink-200 touch-manipulation"
          >
            今日分<br /><span className="text-xs font-normal opacity-70">2件</span>
          </button>
          <button
            onClick={() => handleGenerate(14)}
            className="h-11 rounded-xl bg-pink-700/60 active:bg-pink-700/80 text-xs font-semibold text-pink-100 touch-manipulation"
          >
            7日分<br /><span className="text-xs font-normal opacity-70">14件</span>
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-400 text-center">{error}</p>}
    </div>
  )
}
