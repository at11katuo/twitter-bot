import { prisma } from '@hana/db'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const post = await prisma.post.findUnique({ where: { id: params.id } })
  if (!post) return NextResponse.json({ error: 'not found' }, { status: 404, headers: NO_CACHE })
  console.log('[GET /api/posts/:id] id=%s tweetText=%j', params.id, post.tweetText?.slice(0, 40))
  return NextResponse.json(post, { headers: NO_CACHE })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params
  try {
    const body = await req.json()
    console.log('[PATCH /api/posts/:id] id=%s body=%j', id, body)

    const data: { tweetText?: string; status?: string } = {}
    if (typeof body.tweetText === 'string') data.tweetText = body.tweetText
    if (typeof body.status   === 'string') data.status    = body.status

    if (Object.keys(data).length === 0) {
      console.warn('[PATCH /api/posts/:id] no fields to update')
      return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
    }

    const post = await prisma.post.update({ where: { id }, data })
    console.log('[PATCH /api/posts/:id] updated ok, tweetText=%j', post.tweetText?.slice(0, 40))
    return NextResponse.json(post, { headers: NO_CACHE })
  } catch (e) {
    console.error('[PATCH /api/posts/:id] id=%s error=%s', id, String(e))
    return NextResponse.json({ error: 'update failed' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const post = await prisma.post.findUnique({ where: { id: params.id } })
  if (!post) return NextResponse.json({ error: 'not found' }, { status: 404 })
  // Soft delete — keeps the record so it can be restored
  await prisma.post.update({ where: { id: params.id }, data: { deletedAt: new Date() } })
  return NextResponse.json({ ok: true })
}
