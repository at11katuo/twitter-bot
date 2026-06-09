import { NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import fs from 'fs'
import path from 'path'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const falKey = process.env.FAL_KEY
  const referenceUrl = process.env.REFERENCE_IMAGE_URL

  if (!falKey)       return NextResponse.json({ ok: false, error: 'FAL_KEY not set' }, { status: 500 })
  if (!referenceUrl) return NextResponse.json({ ok: false, error: 'REFERENCE_IMAGE_URL not set' }, { status: 500 })

  const body = await req.json() as { imagePrompt?: string }
  const imagePrompt = body.imagePrompt?.trim()
  if (!imagePrompt) return NextResponse.json({ ok: false, error: 'imagePrompt is required' }, { status: 400 })

  // image_prompt には reply_drafter が kimono hint を既に埋め込み済みなので追加しない
  fal.config({ credentials: falKey })
  let falImageUrl: string
  try {
    console.log('[generate/reply-image] fal.ai 開始 prompt=%j', imagePrompt.slice(0, 160))
    const falResult = await Promise.race([
      fal.subscribe('fal-ai/instant-character', {
        input: {
          image_url: referenceUrl,
          prompt: imagePrompt,
          num_images: 1,
          output_format: 'png',
        },
        pollInterval: 3000,
        onQueueUpdate(update) {
          console.log('[generate/reply-image] fal.ai queue status=%s', (update as { status: string }).status)
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('fal.ai timeout after 180s')), 180_000)
      ),
    ]) as { data: { images: { url: string }[] } }

    falImageUrl = falResult.data.images[0].url
    console.log('[generate/reply-image] fal.ai 完了 imageUrl=%s', falImageUrl.slice(0, 80))
  } catch (err) {
    console.error('[generate/reply-image] fal.ai エラー:', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }

  // ローカルに保存
  const mediaDir = process.env.IMAGE_DIR ?? '/app/data/images'
  const repliesDir = path.join(mediaDir, 'replies')
  fs.mkdirSync(repliesDir, { recursive: true })

  const filename = `reply-${Date.now()}.png`
  try {
    const imgRes = await fetch(falImageUrl)
    const imgBuf = Buffer.from(await imgRes.arrayBuffer())
    fs.writeFileSync(path.join(repliesDir, filename), imgBuf)
    console.log('[generate/reply-image] 保存完了 filename=%s', filename)
  } catch (err) {
    console.error('[generate/reply-image] 保存エラー:', err)
    // 保存失敗でも fal.ai URL を返す（一時的に表示できる）
    return NextResponse.json({ ok: true, imageUrl: falImageUrl, saved: false })
  }

  return NextResponse.json({ ok: true, imageUrl: `/api/reply-image/${filename}`, saved: true })
}
