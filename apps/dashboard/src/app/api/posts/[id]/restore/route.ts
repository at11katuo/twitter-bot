import { prisma } from '@hana/db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const post = await prisma.post.update({
    where: { id: params.id },
    data: { deletedAt: null },
  })
  return NextResponse.json({ ok: true, id: post.id })
}
