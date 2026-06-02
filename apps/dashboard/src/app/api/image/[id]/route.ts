import { prisma } from '@hana/db'
import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'

function extToMime(ext: string): string {
  switch (ext) {
    case 'mp4':  return 'video/mp4'
    case 'mov':  return 'video/quicktime'
    case 'webm': return 'video/webm'
    case 'png':  return 'image/png'
    case 'gif':  return 'image/gif'
    case 'webp': return 'image/webp'
    default:     return 'image/jpeg'
  }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const post = await prisma.post.findUnique({
    where: { id: params.id },
    select: { imagePath: true, mediaType: true },
  })
  if (!post?.imagePath) return new NextResponse('not found', { status: 404 })

  const mediaDir = process.env.IMAGE_DIR ?? '/app/data/images'
  const filePath = path.join(mediaDir, post.imagePath)
  if (!fs.existsSync(filePath)) return new NextResponse('not found', { status: 404 })

  const ext  = path.extname(post.imagePath).slice(1).toLowerCase()
  const mime = extToMime(ext)
  const stat = fs.statSync(filePath)
  const fileSize = stat.size

  // 動画はレンジリクエスト対応（ブラウザのシーク再生に必要）
  if (post.mediaType === 'video') {
    const rangeHeader = req.headers.get('range')
    if (rangeHeader) {
      const [startStr, endStr] = rangeHeader.replace(/bytes=/, '').split('-')
      const start = parseInt(startStr, 10)
      const end   = endStr ? parseInt(endStr, 10) : fileSize - 1
      const chunkSize = end - start + 1

      const fd  = fs.openSync(filePath, 'r')
      const buf = Buffer.alloc(chunkSize)
      fs.readSync(fd, buf, 0, chunkSize, start)
      fs.closeSync(fd)

      return new NextResponse(buf, {
        status: 206,
        headers: {
          'Content-Type':  mime,
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(chunkSize),
        },
      })
    }

    // レンジなし: ファイル全体を返しつつ Accept-Ranges を宣言
    const buffer = fs.readFileSync(filePath)
    return new NextResponse(buffer, {
      headers: {
        'Content-Type':   mime,
        'Accept-Ranges':  'bytes',
        'Content-Length': String(fileSize),
        'Cache-Control':  'public, max-age=3600',
      },
    })
  }

  // 画像
  const buffer = fs.readFileSync(filePath)
  return new NextResponse(buffer, {
    headers: {
      'Content-Type':  mime,
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
