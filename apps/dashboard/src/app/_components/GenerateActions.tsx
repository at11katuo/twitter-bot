'use client'

import { useTransition } from 'react'

export default function GenerateActions({
  generateToday,
  generateWeek,
}: {
  generateToday: () => Promise<void>
  generateWeek: () => Promise<void>
}) {
  const [todayPending, startToday] = useTransition()
  const [weekPending, startWeek] = useTransition()
  const anyPending = todayPending || weekPending

  return (
    <div className="space-y-2">
      {/* 1週間分生成 — メインボタン */}
      <button
        onClick={() => startWeek(() => { generateWeek() })}
        disabled={anyPending}
        className="w-full h-16 rounded-2xl bg-pink-700 active:bg-pink-800 disabled:opacity-40 disabled:cursor-not-allowed text-base font-bold text-white transition touch-manipulation shadow-lg shadow-pink-900/30 flex items-center justify-center gap-2"
      >
        {weekPending ? (
          <>
            <span className="animate-spin">⏳</span>
            <span>生成中... しばらくお待ちください</span>
          </>
        ) : (
          '🗓 Generate Next 7 Days（1週間分を生成）'
        )}
      </button>

      {/* 今日のみ生成 — サブボタン */}
      <button
        onClick={() => startToday(() => { generateToday() })}
        disabled={anyPending}
        className="w-full h-12 rounded-xl bg-slate-700 active:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold text-slate-200 transition touch-manipulation"
      >
        {todayPending ? '生成中...' : '+ 今日分だけ生成'}
      </button>
    </div>
  )
}
