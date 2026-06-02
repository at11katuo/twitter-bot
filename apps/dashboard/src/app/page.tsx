import { prisma } from '@hana/db'
import { SLOT_LABELS } from '@hana/shared'
import Link from 'next/link'
import { generateContentAction } from '@/server/actions/post'

export const dynamic = 'force-dynamic'

function slotBadge(slot: string) {
  const s = slot as keyof typeof SLOT_LABELS
  const info = SLOT_LABELS[s] ?? { emoji: '📅', en: slot, time: '' }
  return `${info.emoji} ${info.en} ${info.time}`
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  draft:   { label: '未予約',   cls: 'bg-yellow-900/50 text-yellow-300' },
  ready:   { label: '予約済み', cls: 'bg-blue-900/50 text-blue-300' },
  posted:  { label: '投稿済み', cls: 'bg-green-900/50 text-green-300' },
  skipped: { label: 'スキップ', cls: 'bg-gray-800 text-gray-400' },
}

function statusBadge(status: string) {
  return STATUS_MAP[status] ?? { label: status, cls: 'bg-gray-800 text-gray-400' }
}

export default async function HomePage() {
  const posts = await prisma.post.findMany({
    orderBy: { scheduledAt: 'desc' },
    take: 30,
  })

  const draft    = posts.filter((p) => p.status === 'draft')
  const ready    = posts.filter((p) => p.status === 'ready')
  const posted   = posts.filter((p) => p.status === 'posted')

  return (
    <div className="space-y-6">
      {/* ヘッダー操作エリア */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-pink-100">Post Queue</h2>
        <form action={generateContentAction}>
          <button
            type="submit"
            className="rounded-xl bg-pink-700 active:bg-pink-800 px-4 py-3 text-sm font-semibold text-white transition touch-manipulation"
          >
            + Generate
          </button>
        </form>
      </div>

      {/* 予約済み */}
      {ready.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold text-blue-400 uppercase tracking-wider">
            予約済み — 自動投稿待ち ({ready.length})
          </h3>
          <div className="space-y-2">
            {ready.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        </section>
      )}

      {/* 未予約 */}
      {draft.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold text-yellow-400 uppercase tracking-wider">
            未予約 — 画像をアップして予約してください ({draft.length})
          </h3>
          <div className="space-y-2">
            {draft.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        </section>
      )}

      {/* 投稿済み */}
      {posted.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold text-green-400 uppercase tracking-wider">
            投稿済み ({posted.length})
          </h3>
          <div className="space-y-2">
            {posted.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        </section>
      )}

      {posts.length === 0 && (
        <p className="text-center text-slate-500 py-16 text-sm">
          No posts yet.{' '}
          <span className="block mt-1 text-slate-600">Tap &quot;+ Generate&quot; to get started.</span>
        </p>
      )}
    </div>
  )
}

function PostCard({ post }: { post: Awaited<ReturnType<typeof prisma.post.findMany>>[number] }) {
  return (
    <Link
      href={`/posts/${post.id}`}
      className="block rounded-2xl border border-slate-700/50 bg-slate-900/60 p-3 active:bg-slate-800/80 transition"
    >
      <div className="flex items-start gap-3">
        {/* サムネイル */}
        <div className="w-14 h-14 flex-shrink-0 rounded-xl overflow-hidden bg-slate-800 flex items-center justify-center">
          {post.imagePath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/image/${post.id}`} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-2xl opacity-30">🖼</span>
          )}
        </div>

        {/* テキスト */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <span className="text-xs text-slate-400">{slotBadge(post.slot)}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(post.status).cls}`}>
              {statusBadge(post.status).label}
            </span>
          </div>
          <p className="text-xs font-medium text-slate-400 mb-0.5 truncate">{post.themeName}</p>
          <p className="text-sm text-slate-300 line-clamp-2 leading-snug">{post.tweetText}</p>
          {post.japaneseTranslation && (
            <p className="mt-1 text-xs text-slate-500 line-clamp-2 leading-snug">
              🇯🇵 {post.japaneseTranslation}
            </p>
          )}
          <p className="mt-1 text-xs text-slate-600">
            {new Date(post.scheduledAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
          </p>
        </div>
      </div>
    </Link>
  )
}
