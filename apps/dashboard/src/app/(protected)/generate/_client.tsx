'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import genSettings from '../../../../../../research/data/generation_settings.json'

type Settings = {
  situation: string; color: string; shade: string
  pattern: string; expression: string; weather: string; freeText: string
}

const DEFAULTS: Settings = {
  situation: 'random', color: 'random', shade: 'random',
  pattern: 'random', expression: 'random', weather: 'random', freeText: '',
}

function pillCls(selected: boolean) {
  return `px-3 py-1.5 rounded-lg text-xs font-medium touch-manipulation transition-colors ${
    selected
      ? 'bg-pink-800/80 text-pink-100 border border-pink-600/60'
      : 'bg-slate-800/60 text-slate-300 border border-slate-700/40 active:bg-slate-700/60'
  }`
}

export default function GenerateClient({ count }: { count: number }) {
  const router = useRouter()
  const [settings, setSettings] = useState<Settings>({ ...DEFAULTS })
  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  function pick(key: keyof Settings, value: string) {
    setSettings(prev => {
      const next = { ...prev, [key]: value }
      if (key === 'color' && value === 'random') next.shade = 'random'
      return next
    })
  }

  async function handleCreate() {
    setIsGenerating(true)
    setError('')
    setProgress(0)

    const body = {
      situation:  settings.situation  !== 'random' ? settings.situation  : undefined,
      color:      settings.color      !== 'random' ? settings.color      : undefined,
      shade:      settings.shade      !== 'random' ? settings.shade      : undefined,
      pattern:    settings.pattern    !== 'random' ? settings.pattern    : undefined,
      expression: settings.expression !== 'random' ? settings.expression : undefined,
      weather:    settings.weather    !== 'random' ? settings.weather    : undefined,
      freeText:   settings.freeText.trim() || undefined,
    }

    try {
      // count 件分のジョブをキューに積む（各レスポンスは即座に返る）
      for (let i = 0; i < count; i++) {
        const res = await fetch('/api/generate/rin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json().catch(() => ({})) as { ok?: boolean; jobId?: string; error?: string }
        if (!res.ok) throw new Error(data.error ?? 'ジョブの登録に失敗しました')
        setProgress(i + 1)
      }
      // 全ジョブ登録完了 → ダッシュボードに戻る（ジョブ一覧でポーリング確認）
      router.push('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラー')
      setIsGenerating(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-slate-200 pb-32">
      {/* ヘッダー */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 bg-[#0a0a1a]/95 backdrop-blur-sm border-b border-slate-800/60">
        <button
          onClick={() => router.back()}
          disabled={isGenerating}
          className="text-slate-400 hover:text-slate-200 text-sm disabled:opacity-40"
        >
          ← 戻る
        </button>
        <span className="flex-1 text-sm font-semibold text-pink-200">
          凛 生成設定
          {count > 1 && <span className="text-slate-400 font-normal ml-2">×{count}件</span>}
        </span>
      </div>

      {/* 設定セクション */}
      <div className="px-4 py-5 space-y-7">

        {/* シチュエーション */}
        <div className="space-y-2.5">
          <h3 className="text-xs font-semibold text-slate-400 tracking-widest">シチュエーション</h3>
          <div className="flex flex-wrap gap-2">
            {genSettings.situations.map(item => (
              <button
                key={item.id}
                onClick={() => pick('situation', item.id)}
                disabled={isGenerating}
                className={pillCls(settings.situation === item.id) + ' disabled:opacity-50'}
              >
                {item.label}{item.id === 'random' ? ' ★' : ''}
              </button>
            ))}
          </div>
        </div>

        {/* 着物の色 */}
        <div className="space-y-2.5">
          <h3 className="text-xs font-semibold text-slate-400 tracking-widest">着物の色</h3>
          <div className="flex flex-wrap gap-2">
            {genSettings.colors.map(item => (
              <button
                key={item.id}
                onClick={() => pick('color', item.id)}
                disabled={isGenerating}
                className={pillCls(settings.color === item.id) + ' disabled:opacity-50'}
              >
                {item.label}{item.id === 'random' ? ' ★' : ''}
              </button>
            ))}
          </div>
          {settings.color !== 'random' && (
            <div className="mt-3">
              <p className="text-xs text-slate-500 mb-2">濃淡</p>
              <div className="flex gap-2">
                {genSettings.shades.map(item => (
                  <button
                    key={item.id}
                    onClick={() => pick('shade', item.id)}
                    disabled={isGenerating}
                    className={pillCls(settings.shade === item.id) + ' disabled:opacity-50'}
                  >
                    {item.label}{item.id === 'random' ? ' ★' : ''}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 着物の柄 */}
        <div className="space-y-2.5">
          <h3 className="text-xs font-semibold text-slate-400 tracking-widest">着物の柄</h3>
          <div className="flex flex-wrap gap-2">
            {genSettings.patterns.map(item => (
              <button
                key={item.id}
                onClick={() => pick('pattern', item.id)}
                disabled={isGenerating}
                className={pillCls(settings.pattern === item.id) + ' disabled:opacity-50'}
              >
                {item.label}{item.id === 'random' ? ' ★' : ''}
              </button>
            ))}
          </div>
        </div>

        {/* 表情 */}
        <div className="space-y-2.5">
          <h3 className="text-xs font-semibold text-slate-400 tracking-widest">表情</h3>
          <div className="flex flex-wrap gap-2">
            {genSettings.expressions.map(item => (
              <button
                key={item.id}
                onClick={() => pick('expression', item.id)}
                disabled={isGenerating}
                className={pillCls(settings.expression === item.id) + ' disabled:opacity-50'}
              >
                {item.label}{item.id === 'random' ? ' ★' : ''}
              </button>
            ))}
          </div>
        </div>

        {/* 天候 */}
        <div className="space-y-2.5">
          <h3 className="text-xs font-semibold text-slate-400 tracking-widest">天候</h3>
          <div className="flex flex-wrap gap-2">
            {genSettings.weather.map(item => (
              <button
                key={item.id}
                onClick={() => pick('weather', item.id)}
                disabled={isGenerating}
                className={pillCls(settings.weather === item.id) + ' disabled:opacity-50'}
              >
                {item.label}{item.id === 'random' ? ' ★' : ''}
              </button>
            ))}
          </div>
        </div>

        {/* 自由入力（所作・動作） */}
        <div className="space-y-2.5">
          <h3 className="text-xs font-semibold text-slate-400 tracking-widest">自由入力（所作・動作）</h3>
          <textarea
            value={settings.freeText}
            onChange={e => setSettings(prev => ({ ...prev, freeText: e.target.value }))}
            placeholder={'例: しゃがんで花を見ている\n例: 傘を差して歩いている'}
            className="w-full px-3 py-2.5 rounded-xl bg-slate-800/60 border border-slate-700/40 text-sm text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-pink-700/60"
            rows={2}
            disabled={isGenerating}
          />
          <p className="text-xs text-slate-600">入力した場合、シチュエーションの所作プールより優先されます</p>
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="mx-4 mb-4 p-3 rounded-xl bg-red-900/30 border border-red-700/40">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* フッター固定ボタン */}
      <div className="fixed bottom-0 left-0 right-0 px-4 py-4 bg-[#0a0a1a]/95 backdrop-blur-sm border-t border-slate-800/60">
        {isGenerating ? (
          <div className="h-14 rounded-2xl bg-slate-800/60 border border-slate-700/40 flex items-center justify-center gap-3">
            <div className="w-4 h-4 rounded-full border-2 border-pink-500 border-t-transparent animate-spin" />
            <span className="text-sm text-slate-300">
              {count > 1
                ? `ジョブ登録中... (${progress}/${count}件)`
                : 'ジョブ登録中...'}
            </span>
          </div>
        ) : (
          <button
            onClick={handleCreate}
            className="w-full h-14 rounded-2xl bg-pink-800/80 hover:bg-pink-700/80 active:bg-pink-700 text-pink-100 font-semibold text-base touch-manipulation"
          >
            作成する
            {count > 1 && <span className="ml-2 text-sm font-normal opacity-70">({count}件)</span>}
          </button>
        )}
      </div>
    </div>
  )
}
