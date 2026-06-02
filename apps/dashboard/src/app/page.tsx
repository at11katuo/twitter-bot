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

function statusColor(status: string) {
  if (status === 'draft')   return 'bg-yellow-900/50 text-yellow-300'
  if (status === 'ready')   return 'bg-blue-900/50 text-blue-300'
  if (status === 'posted')  return 'bg-green-900/50 text-green-300'
  if (status === 'skipped') return 'bg-gray-800 text-gray-400'
  return 'bg-gray-800 text-gray-400'
}

export default async function HomePage() {
  const posts = await prisma.post.findMany({
    orderBy: { scheduledAt: 'desc' },
    take: 30,
  })

  const draft  = posts.filter((p) => p.status === 'draft')
  const ready  = posts.filter((p) => p.status === 'ready')
  const posted = posts.filter((p) => p.status === 'posted')

  return (
    <div className="space-y-8">
      {/* 操作ボタン */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-pink-100">Post Queue</h2>
        <form action={generateContentAction}>
          <button
            type="submit"
            className="rounded-lg bg-pink-700 hover:bg-pink-600 px-4 py-2 text-sm font-medium text-white transition"
          >
            + Generate Today&apos;s Content
          </button>
        </form>
      </div>

      {/* Ready to post */}
      {ready.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-medium text-blue-400 uppercase tracking-wide">
            Ready to Post ({ready.length})
          </h3>
          <div className="space-y-3">
            {ready.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        </section>
      )}

      {/* Draft — needs image */}
      {draft.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-medium text-yellow-400 uppercase tracking-wide">
            Needs Image ({draft.length})
          </h3>
          <div className="space-y-3">
            {draft.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        </section>
      )}

      {/* Posted */}
      {posted.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-medium text-green-400 uppercase tracking-wide">
            Posted ({posted.length})
          </h3>
          <div className="space-y-3">
            {posted.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        </section>
      )}

      {posts.length === 0 && (
        <p className="text-center text-slate-500 py-12">
          No posts yet. Click &quot;Generate Today&apos;s Content&quot; to get started.
        </p>
      )}
    </div>
  )
}

function PostCard({ post }: { post: Awaited<ReturnType<typeof prisma.post.findMany>>[number] }) {
  return (
    <Link
      href={`/posts/${post.id}`}
      className="block rounded-xl border border-slate-700/50 bg-slate-900/60 p-4 hover:border-pink-700/50 transition"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-slate-400">{slotBadge(post.slot)}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(post.status)}`}>
              {post.status}
            </span>
            <span className="text-xs text-slate-500">{post.themeName}</span>
          </div>
          <p className="text-sm text-slate-300 line-clamp-2">{post.tweetText}</p>
          {post.japaneseTranslation && (
            <p className="mt-1 text-xs text-slate-500 line-clamp-2">🇯🇵 {post.japaneseTranslation}</p>
          )}
          <p className="mt-1 text-xs text-slate-500">
            {new Date(post.scheduledAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
          </p>
        </div>
        {post.imagePath && (
          <div className="w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-slate-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/image/${post.id}`} alt="" className="w-full h-full object-cover" />
          </div>
        )}
      </div>
    </Link>
  )
}
