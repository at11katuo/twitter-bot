import { prisma } from '@hana/db'
import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const post = await prisma.post.findUnique({ where: { id: params.id }, select: { imagePath: true } })
  if (!post?.imagePath) return new NextResponse('not found', { status: 404 })

  const imageDir = process.env.IMAGE_DIR ?? '/app/data/images'
  const filePath = path.join(imageDir, post.imagePath)
  if (!fs.existsSync(filePath)) return new NextResponse('not found', { status: 404 })

  const buffer = fs.readFileSync(filePath)
  const ext = path.extname(post.imagePath).slice(1)
  const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg'

  return new NextResponse(buffer, {
    headers: { 'Content-Type': mimeType, 'Cache-Control': 'public, max-age=86400' },
  })
}
