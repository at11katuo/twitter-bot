import { prisma } from '@hana/db'
import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const post = await prisma.post.findUnique({ where: { id: params.id } })
  if (!post) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(post)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const data: { tweetText?: string; status?: string } = {}
  if (typeof body.tweetText === 'string') data.tweetText = body.tweetText
  if (typeof body.status   === 'string') data.status    = body.status
  const post = await prisma.post.update({ where: { id: params.id }, data })
  return NextResponse.json(post)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const post = await prisma.post.findUnique({ where: { id: params.id } })
  if (!post) return NextResponse.json({ error: 'not found' }, { status: 404 })
  // Soft delete — keeps the record so it can be restored
  await prisma.post.update({ where: { id: params.id }, data: { deletedAt: new Date() } })
  return NextResponse.json({ ok: true })
}
