import { prisma } from '@hana/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const post = await prisma.post.findUnique({ where: { id: params.id } })
  if (!post) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(post)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { tweetText } = await req.json()
  const post = await prisma.post.update({
    where: { id: params.id },
    data: { tweetText },
  })
  return NextResponse.json(post)
}
