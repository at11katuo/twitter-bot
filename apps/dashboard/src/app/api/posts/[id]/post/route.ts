import { prisma } from '@hana/db'
import { NextRequest, NextResponse } from 'next/server'
import { TwitterApi } from 'twitter-api-v2'
import path from 'path'
import fs from 'fs'

function buildTwitterClient() {
  return new TwitterApi({
    appKey:    process.env.TWITTER_API_KEY!,
    appSecret: process.env.TWITTER_API_SECRET!,
    accessToken:       process.env.TWITTER_ACCESS_TOKEN!,
    accessSecret:      process.env.TWITTER_ACCESS_TOKEN_SECRET!,
  })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { tweetText } = await req.json()

  const post = await prisma.post.findUnique({ where: { id: params.id } })
  if (!post) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
  if (post.status === 'posted') return NextResponse.json({ ok: false, error: 'already posted' })
  if (!post.imagePath) return NextResponse.json({ ok: false, error: 'no image' })

  try {
    const client = buildTwitterClient()
    const rwClient = client.readWrite

    const imagePath = path.join(process.env.IMAGE_DIR ?? '/app/data/images', post.imagePath)
    const imageBuffer = fs.readFileSync(imagePath)
    const mediaId = await rwClient.v1.uploadMedia(imageBuffer, { mimeType: 'image/jpeg' })

    const tweet = await rwClient.v2.tweet({ text: tweetText, media: { media_ids: [mediaId] } })
    const tweetId = tweet.data.id

    await prisma.post.update({
      where: { id: params.id },
      data: { status: 'posted', tweetId, postedAt: new Date(), tweetText },
    })

    return NextResponse.json({ ok: true, tweetId })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
