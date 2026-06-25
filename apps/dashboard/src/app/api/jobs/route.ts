import { prisma } from '@hana/db'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const jobs = await prisma.generationJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
  })
  return NextResponse.json(jobs)
}

export async function DELETE() {
  const result = await prisma.generationJob.updateMany({
    where: { status: { in: ['pending', 'generating'] } },
    data: { status: 'failed', errorMessage: 'Cleared manually' },
  })
  return NextResponse.json({ ok: true, cleared: result.count })
}
