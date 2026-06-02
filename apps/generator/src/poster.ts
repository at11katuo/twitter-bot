import { prisma } from '@hana/db'
import { TwitterApi, EUploadMimeType } from 'twitter-api-v2'
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

function extToMimeType(ext: string): EUploadMimeType {
  switch (ext) {
    case 'mp4':  return EUploadMimeType.Mp4
    case 'gif':  return EUploadMimeType.Gif
    case 'png':  return EUploadMimeType.Png
    case 'webp': return EUploadMimeType.Webp
    default:     return EUploadMimeType.Jpeg
  }
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
  const mediaDir = process.env.IMAGE_DIR ?? '/app/data/images'

  for (const post of duePosts) {
    if (!post.imagePath) {
      console.warn(`[poster] Skip ${post.id}: no media attached`)
      continue
    }

    try {
      const filePath  = path.join(mediaDir, post.imagePath)
      const fileBuffer = fs.readFileSync(filePath)
      const ext       = post.imagePath.split('.').pop()?.toLowerCase() ?? 'jpg'
      const mimeType  = extToMimeType(ext)
      const isVideo   = post.mediaType === 'video'

      console.log(`[poster] Uploading ${isVideo ? 'video' : 'image'} (${Math.round(fileBuffer.length / 1024)}KB) for post ${post.id}...`)

      // twitter-api-v2 の uploadMedia は:
      //  - 動画(mp4): INIT→APPEND(5MB チャンク)→FINALIZE→STATUS ポーリング を自動処理
      //  - 画像: シンプルアップロード
      // media_category は mimeType から自動判定 (mp4 → tweet_video)
      const mediaId = await client.readWrite.v1.uploadMedia(fileBuffer, { mimeType })

      const tweet = await client.readWrite.v2.tweet({
        text:  post.tweetText,
        media: { media_ids: [mediaId] },
      })

      await prisma.post.update({
        where: { id: post.id },
        data:  { status: 'posted', tweetId: tweet.data.id, postedAt: new Date() },
      })

      console.log(`[poster] ✓ ${post.slot} "${post.themeName}" → tweet ${tweet.data.id}`)
    } catch (err) {
      console.error(`[poster] ✗ Failed to post ${post.id} (${post.slot}):`, err)
    }
  }
}

export function startPostingCron(): void {
  console.log('[poster] Cron started — checking every 60s for scheduled posts.')

  postDuePosts().catch((err) => console.error('[poster] Initial check failed:', err))

  setInterval(() => {
    postDuePosts().catch((err) => console.error('[poster] Cron tick failed:', err))
  }, 60_000)
}
