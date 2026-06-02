import { prisma } from '@hana/db'
import { NextRequest, NextResponse } from 'next/server'
import { TwitterApi, EUploadMimeType } from 'twitter-api-v2'
import path from 'path'
import fs from 'fs'

function buildTwitterClient() {
  return new TwitterApi({
    appKey:       process.env.TWITTER_API_KEY!,
    appSecret:    process.env.TWITTER_API_SECRET!,
    accessToken:  process.env.TWITTER_ACCESS_TOKEN!,
    accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET!,
  })
}

function extToMime(ext: string): EUploadMimeType {
  switch (ext) {
    case 'mp4':  return EUploadMimeType.Mp4
    case 'gif':  return EUploadMimeType.Gif
    case 'png':  return EUploadMimeType.Png
    case 'webp': return EUploadMimeType.Webp
    default:     return EUploadMimeType.Jpeg
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { tweetText, textOnly = false } = await req.json()

  const post = await prisma.post.findUnique({ where: { id: params.id } })
  if (!post) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
  if (post.status === 'posted') return NextResponse.json({ ok: false, error: 'already posted' })
  if (!textOnly && !post.imagePath) return NextResponse.json({ ok: false, error: 'no image' })

  try {
    const client = buildTwitterClient()

    let tweetPayload: Parameters<typeof client.readWrite.v2.tweet>[0]

    if (!textOnly && post.imagePath) {
      const filePath   = path.join(process.env.IMAGE_DIR ?? '/app/data/images', post.imagePath)
      const fileBuffer = fs.readFileSync(filePath)
      const ext        = post.imagePath.split('.').pop()?.toLowerCase() ?? 'jpg'
      const mimeType   = extToMime(ext)

      const mediaId = await client.readWrite.v1.uploadMedia(fileBuffer, { mimeType })
      tweetPayload = { text: tweetText, media: { media_ids: [mediaId] } }
    } else {
      tweetPayload = { text: tweetText }
    }

    const tweet   = await client.readWrite.v2.tweet(tweetPayload)
    const tweetId = tweet.data.id

    await prisma.post.update({
      where: { id: params.id },
      data:  { status: 'posted', tweetId, postedAt: new Date(), tweetText },
    })

    return NextResponse.json({ ok: true, tweetId })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
