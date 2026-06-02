import { prisma } from '@hana/db'
import { TwitterApi } from 'twitter-api-v2'
import path from 'path'
import fs from 'fs'

function buildClient(): TwitterApi {
  return new TwitterApi({
    appKey:       process.env.TWITTER_API_KEY!,
    appSecret:    process.env.TWITTER_API_SECRET!,
    accessToken:  process.env.TWITTER_ACCESS_TOKEN!,
    accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET!,
  })
}

async function postDuePosts(): Promise<void> {
  const now = new Date()
  const duePosts = await prisma.post.findMany({
    where: { status: 'ready', scheduledAt: { lte: now } },
    orderBy: { scheduledAt: 'asc' },
  })

  if (duePosts.length === 0) return

  console.log(`[poster] ${duePosts.length} post(s) due. Posting now...`)
  const client = buildClient()
  const imageDir = process.env.IMAGE_DIR ?? '/app/data/images'

  for (const post of duePosts) {
    if (!post.imagePath) {
      console.warn(`[poster] Skip ${post.id}: no image attached`)
      continue
    }

    try {
      const imagePath = path.join(imageDir, post.imagePath)
      const imageBuffer = fs.readFileSync(imagePath)

      const ext = post.imagePath.split('.').pop()?.toLowerCase() ?? 'jpeg'
      const mimeType = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg'

      const mediaId = await client.readWrite.v1.uploadMedia(imageBuffer, { mimeType })
      const tweet = await client.readWrite.v2.tweet({
        text: post.tweetText,
        media: { media_ids: [mediaId] },
      })

      await prisma.post.update({
        where: { id: post.id },
        data: { status: 'posted', tweetId: tweet.data.id, postedAt: new Date() },
      })

      console.log(`[poster] ✓ ${post.slot} "${post.themeName}" → tweet ${tweet.data.id}`)
    } catch (err) {
      console.error(`[poster] ✗ Failed to post ${post.id} (${post.slot}):`, err)
    }
  }
}

export function startPostingCron(): void {
  console.log('[poster] Cron started — checking every 60s for scheduled posts.')

  // 起動直後も一度チェック
  postDuePosts().catch((err) => console.error('[poster] Initial check failed:', err))

  setInterval(() => {
    postDuePosts().catch((err) => console.error('[poster] Cron tick failed:', err))
  }, 60_000)
}
