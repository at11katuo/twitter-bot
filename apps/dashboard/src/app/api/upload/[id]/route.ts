import { prisma } from '@hana/db'
import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const formData = await req.formData()
  const file = formData.get('image') as File | null
  if (!file) return NextResponse.json({ error: 'no file' }, { status: 400 })

  const imageDir = process.env.IMAGE_DIR ?? '/app/data/images'
  fs.mkdirSync(imageDir, { recursive: true })

  const ext = file.name.split('.').pop() ?? 'jpg'
  const filename = `${params.id}.${ext}`
  const dest = path.join(imageDir, filename)

  const arrayBuffer = await file.arrayBuffer()
  fs.writeFileSync(dest, Buffer.from(arrayBuffer))

  await prisma.post.update({
    where: { id: params.id },
    data: { imagePath: filename, status: 'ready' },
  })

  return NextResponse.json({ ok: true, filename })
}
