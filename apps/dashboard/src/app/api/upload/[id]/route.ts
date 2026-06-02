import { prisma } from '@hana/db'
import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'

const VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'])

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const formData = await req.formData()
  const file = formData.get('image') as File | null
  if (!file) return NextResponse.json({ error: 'no file' }, { status: 400 })

  const isVideo = VIDEO_MIME_TYPES.has(file.type) || file.type.startsWith('video/')
  const mediaType = isVideo ? 'video' : 'image'

  const mediaDir = process.env.IMAGE_DIR ?? '/app/data/images'
  fs.mkdirSync(mediaDir, { recursive: true })

  // ファイル名は既存ファイルを上書きできるよう id ベースで固定
  const ext = file.name.split('.').pop()?.toLowerCase() ?? (isVideo ? 'mp4' : 'jpg')
  const filename = `${params.id}.${ext}`
  const dest = path.join(mediaDir, filename)

  const arrayBuffer = await file.arrayBuffer()
  fs.writeFileSync(dest, Buffer.from(arrayBuffer))

  await prisma.post.update({
    where: { id: params.id },
    data: { imagePath: filename, mediaType },
  })

  return NextResponse.json({ ok: true, filename, mediaType })
}
