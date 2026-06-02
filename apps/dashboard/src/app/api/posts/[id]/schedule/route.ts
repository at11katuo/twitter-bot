import { prisma } from '@hana/db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { tweetText } = await req.json()

  const post = await prisma.post.findUnique({ where: { id: params.id } })
  if (!post) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
  if (!post.imagePath) return NextResponse.json({ ok: false, error: 'no image' }, { status: 400 })
  if (post.status === 'posted') return NextResponse.json({ ok: false, error: 'already posted' })

  await prisma.post.update({
    where: { id: params.id },
    data: { status: 'ready', tweetText },
  })

  return NextResponse.json({ ok: true })
}
