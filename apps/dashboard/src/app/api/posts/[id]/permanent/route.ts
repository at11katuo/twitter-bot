import { prisma } from '@hana/db'
import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const post = await prisma.post.findUnique({ where: { id: params.id } })
  if (!post) return NextResponse.json({ error: 'not found' }, { status: 404 })

  if (post.imagePath) {
    const mediaDir = process.env.IMAGE_DIR ?? '/app/data/images'
    try { fs.unlinkSync(path.join(mediaDir, post.imagePath)) } catch { /* ok */ }
  }

  await prisma.post.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
