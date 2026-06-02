import { prisma } from '@hana/db'
import { SLOT_LABELS } from '@hana/shared'
import Link from 'next/link'
import GenerateActions from './_components/GenerateActions'
import { generateContentAction, generateWeekAction } from '@/server/actions/post'

export const dynamic = 'force-dynamic'

// ── ユーティリティ ────────────────────────────────────────────────

function getJSTDateKey(utcDate: Date): string {
  return new Date(utcDate.getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]
}

function formatDateLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  // Date in local context for weekday computation (all UTC, no TZ issues)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const weekdays = ['日', '月', '火', '水', '木', '金', '土']
  return `${m}月${d}日（${weekdays[dow]}）`
}

function slotBadge(slot: string) {
  const s = slot as keyof typeof SLOT_LABELS
  const info = SLOT_LABELS[s] ?? { emoji: '📅', en: slot, time: '' }
  return `${info.emoji} ${info.time}`
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  draft:   { label: '未予約',   cls: 'bg-yellow-900/50 text-yellow-300' },
  ready:   { label: '予約済み', cls: 'bg-blue-900/50 text-blue-300' },
  posted:  { label: '投稿済み', cls: 'bg-green-900/50 text-green-300' },
  skipped: { label: 'スキップ', cls: 'bg-gray-800 text-gray-400' },
}

// ── ページ本体 ────────────────────────────────────────────────────

export default async function HomePage() {
  const posts = await prisma.post.findMany({
    orderBy: { scheduledAt: 'asc' },
    take: 100,
  })

  // 日付（JST）ごとにグループ化
  const grouped = new Map<string, typeof posts>()
  for (const post of posts) {
    const key = getJSTDateKey(new Date(post.scheduledAt))
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(post)
  }

  // 昇順ソート（直近が上）
  const sortedDates = Array.from(grouped.keys()).sort()

  // 今日のJST日付キー
  const todayKey = getJSTDateKey(new Date())

  return (
    <div className="space-y-4">
      {/* 生成ボタン */}
      <GenerateActions
        generateToday={generateContentAction}
        generateWeek={generateWeekAction}
      />

      {/* 日付別アコーディオン */}
      {sortedDates.length === 0 ? (
        <p className="text-center text-slate-500 py-16 text-sm">
          投稿がありません。<br />
          <span className="text-slate-600">「1週間分を生成」を押してスタートしましょう。</span>
        </p>
      ) : (
        <div className="space-y-2">
          {sortedDates.map((dateKey) => {
            const dayPosts = grouped.get(dateKey)!
            const isToday = dateKey === todayKey
            const isFuture = dateKey >= todayKey

            const readyCount  = dayPosts.filter((p) => p.status === 'ready').length
            const postedCount = dayPosts.filter((p) => p.status === 'posted').length
            const draftCount  = dayPosts.filter((p) => p.status === 'draft').length

            return (
              <details
                key={dateKey}
                open={isToday || (isFuture && readyCount + draftCount > 0 && dateKey === sortedDates.find(k => k >= todayKey))}
                className="group rounded-2xl border border-slate-700/50 bg-slate-900/60 overflow-hidden"
              >
                <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer select-none list-none active:bg-slate-800/60 touch-manipulation">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {/* 今日 / 過去 / 未来バッジ */}
                    {isToday && (
                      <span className="flex-shrink-0 text-xs font-bold text-pink-400 bg-pink-900/30 rounded-full px-2 py-0.5">
                        今日
                      </span>
                    )}
                    <span className="font-semibold text-slate-200 text-sm">
                      {formatDateLabel(dateKey)}
                    </span>
                    {/* サマリーバッジ */}
                    <span className="flex-shrink-0 flex items-center gap-1 text-xs text-slate-500">
                      {postedCount > 0 && <span className="text-green-400">✅{postedCount}</span>}
                      {readyCount  > 0 && <span className="text-blue-400">🕐{readyCount}</span>}
                      {draftCount  > 0 && <span className="text-yellow-400">⚠️{draftCount}</span>}
                    </span>
                  </div>
                  {/* 開閉矢印 */}
                  <span className="flex-shrink-0 text-slate-500 text-xs transition-transform group-open:rotate-180">
                    ▼
                  </span>
                </summary>

                <div className="px-3 pb-3 space-y-2 border-t border-slate-700/40 pt-3">
                  {dayPosts.map((post) => (
                    <PostCard key={post.id} post={post} />
                  ))}
                </div>
              </details>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── PostCard ──────────────────────────────────────────────────────

function PostCard({ post }: { post: Awaited<ReturnType<typeof prisma.post.findMany>>[number] }) {
  const s = STATUS_MAP[post.status] ?? { label: post.status, cls: 'bg-gray-800 text-gray-400' }
  return (
    <Link
      href={`/posts/${post.id}`}
      className="flex items-start gap-3 rounded-xl border border-slate-700/40 bg-slate-800/50 p-3 active:bg-slate-700/60 transition touch-manipulation"
    >
      {/* サムネイル */}
      <div className="w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-slate-700 flex items-center justify-center">
        {post.imagePath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/image/${post.id}`} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-xl opacity-20">🖼</span>
        )}
      </div>

      {/* テキスト */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-xs text-slate-500">{slotBadge(post.slot)}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>
        </div>
        <p className="text-xs font-medium text-slate-400 truncate mb-0.5">{post.themeName}</p>
        <p className="text-sm text-slate-300 line-clamp-2 leading-snug">{post.tweetText}</p>
        {post.japaneseTranslation && (
          <p className="mt-0.5 text-xs text-slate-500 line-clamp-1">
            🇯🇵 {post.japaneseTranslation}
          </p>
        )}
      </div>
    </Link>
  )
}
