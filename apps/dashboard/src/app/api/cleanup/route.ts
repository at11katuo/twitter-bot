import { prisma } from '@hana/db'
import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const AUTO_DELETE_DAYS = 10
const TRASH_EXPIRE_DAYS = 30

export async function POST() {
  const now = new Date()

  // ① 10日以上経過した投稿をソフトデリート
  const cutoff = new Date(now.getTime() - AUTO_DELETE_DAYS * 24 * 60 * 60 * 1000)
  const softDeleted = await prisma.post.updateMany({
    where: { createdAt: { lt: cutoff }, deletedAt: null },
    data: { deletedAt: now },
  })

  // ② ゴミ箱に30日以上入っている投稿を完全削除
  const trashCutoff = new Date(now.getTime() - TRASH_EXPIRE_DAYS * 24 * 60 * 60 * 1000)
  const toHardDelete = await prisma.post.findMany({
    where: { deletedAt: { lt: trashCutoff } },
  })

  const mediaDir = process.env.IMAGE_DIR ?? '/app/data/images'
  for (const post of toHardDelete) {
    if (post.imagePath) {
      try { fs.unlinkSync(path.join(mediaDir, post.imagePath)) } catch { /* ok */ }
    }
  }
  const hardDeleted = await prisma.post.deleteMany({
    where: { deletedAt: { lt: trashCutoff } },
  })

  console.log(`[cleanup] soft-deleted: ${softDeleted.count}, hard-deleted: ${hardDeleted.count}`)
  return NextResponse.json({
    ok: true,
    softDeleted: softDeleted.count,
    hardDeleted: hardDeleted.count,
  })
}
