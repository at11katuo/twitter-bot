import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'

export async function GET(_req: NextRequest, { params }: { params: { filename: string } }) {
  const filename = params.filename
  // ディレクトリトラバーサル防止
  if (filename.includes('..') || filename.includes('/')) {
    return new NextResponse('bad request', { status: 400 })
  }

  const mediaDir = process.env.IMAGE_DIR ?? '/app/data/images'
  const filePath = path.join(mediaDir, 'replies', filename)

  if (!fs.existsSync(filePath)) return new NextResponse('not found', { status: 404 })

  const buffer = fs.readFileSync(filePath)
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
