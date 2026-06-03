import { prisma } from '@hana/db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'invalid json' }, { status: 400 })

  const { tweetText, imagePrompt, slot, theme, themeName, scheduledAt } = body as {
    tweetText: string
    imagePrompt?: string
    slot?: string
    theme?: string
    themeName?: string
    scheduledAt?: string
  }

  if (!tweetText) return NextResponse.json({ error: 'tweetText required' }, { status: 400 })

  const post = await prisma.post.create({
    data: {
      tweetText,
      imagePrompt: imagePrompt ?? '',
      slot: slot ?? 'evening',
      theme: theme ?? 'hana-daily',
      themeName: themeName ?? 'Daily Post',
      scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(),
      status: 'draft',
    },
  })

  return NextResponse.json({ ok: true, id: post.id })
}
