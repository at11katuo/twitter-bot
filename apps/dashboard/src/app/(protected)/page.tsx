import { prisma } from '@hana/db'
import GenerateActions from './_components/GenerateActions'
import GenerateRin from './_components/GenerateRin'
import PostCardClient from './_components/PostCardClient'
import TrashSection from './_components/TrashSection'
import { generateContentAction, generateWeekAction } from '@/server/actions/post'

export const dynamic = 'force-dynamic'

function getJSTDateKey(utcDate: Date): string {
  return new Date(utcDate.getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]
}

function formatDateLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const weekdays = ['日', '月', '火', '水', '木', '金', '土']
  return `${m}月${d}日（${weekdays[dow]}）`
}

export default async function HomePage() {
  const [posts, deletedPosts] = await Promise.all([
    prisma.post.findMany({
      where: { deletedAt: null },
      orderBy: { scheduledAt: 'asc' },
      take: 100,
    }),
    prisma.post.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: 'desc' },
      take: 50,
    }),
  ])

  const grouped = new Map<string, typeof posts>()
  for (const post of posts) {
    const key = getJSTDateKey(new Date(post.scheduledAt))
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(post)
  }

  const sortedDates = Array.from(grouped.keys()).sort()
  const todayKey = getJSTDateKey(new Date())

  return (
    <div className="space-y-4">
      {/* 凛 生成パネル */}
      <GenerateRin />

      {/* Hana 生成ボタン（英語ツイート用） */}
      <GenerateActions
        generateToday={generateContentAction}
        generateWeek={generateWeekAction}
      />

      {/* 投稿一覧 */}
      {sortedDates.length === 0 ? (
        <p className="text-center text-slate-500 py-16 text-sm">
          投稿がありません。
        </p>
      ) : (
        <div className="space-y-2">
          {sortedDates.map((dateKey) => {
            const dayPosts = grouped.get(dateKey)!
            const isToday = dateKey === todayKey
            const isFuture = dateKey >= todayKey

            const readyCount  = dayPosts.filter((p) => p.status === 'ready').length
            const postedCount = dayPosts.filter((p) => p.status === 'posted' || p.status === 'done').length
            const draftCount  = dayPosts.filter((p) => p.status === 'draft').length
            const skippedCount = dayPosts.filter((p) => p.status === 'skipped').length

            return (
              <details
                key={dateKey}
                open={isToday || (isFuture && readyCount + draftCount > 0 && dateKey === sortedDates.find(k => k >= todayKey))}
                className="group rounded-2xl border border-slate-700/50 bg-slate-900/60 overflow-hidden"
              >
                <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer select-none list-none active:bg-slate-800/60 touch-manipulation">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {isToday && (
                      <span className="flex-shrink-0 text-xs font-bold text-pink-400 bg-pink-900/30 rounded-full px-2 py-0.5">
                        今日
                      </span>
                    )}
                    <span className="font-semibold text-slate-200 text-sm">
                      {formatDateLabel(dateKey)}
                    </span>
                    <span className="flex-shrink-0 flex items-center gap-1 text-xs text-slate-500">
                      {postedCount  > 0 && <span className="text-green-400">✅{postedCount}</span>}
                      {readyCount   > 0 && <span className="text-blue-400">🕐{readyCount}</span>}
                      {draftCount   > 0 && <span className="text-yellow-400">⚠️{draftCount}</span>}
                      {skippedCount > 0 && <span className="text-slate-500">❌{skippedCount}</span>}
                    </span>
                  </div>
                  <span className="flex-shrink-0 text-slate-500 text-xs transition-transform group-open:rotate-180">
                    ▼
                  </span>
                </summary>

                <div className="px-3 pb-3 space-y-2 border-t border-slate-700/40 pt-3">
                  {dayPosts.map((post) => (
                    <PostCardClient key={post.id} post={post} />
                  ))}
                </div>
              </details>
            )
          })}
        </div>
      )}

      {/* ゴミ箱 */}
      <TrashSection posts={deletedPosts.map((p) => ({
        id: p.id,
        tweetText: p.tweetText,
        themeName: p.themeName,
        deletedAt: p.deletedAt!.toISOString(),
        imagePath: p.imagePath,
      }))} />
    </div>
  )
}
