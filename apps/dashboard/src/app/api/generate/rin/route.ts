import { prisma } from '@hana/db'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { fal } from '@fal-ai/client'
import fs from 'fs'
import path from 'path'

const SYSTEM_PROMPT = `あなたは日本の伝統美とAIアートを発信するTwitterアカウント「凛（Rin）」のコンテンツジェネレーターです。

【キャラクター：凛（Rin）】
- 20歳の日本女性。四季折々の着物を纏い、日本の伝統美を体現する。
- ※キャラクターのビジュアルはリファレンス画像で固定済み。プロンプトに顔・年齢・人物描写は不要。

【SCENE_PROMPT 生成ルール（厳守）】
英語で「シーン・背景・表情・ポーズ・光」のみを描写する。

必ず含める要素：
- 着物の柄・色（例: wearing a deep indigo kimono with golden chrysanthemum patterns）
- 背景・場所（例: in a bamboo forest, beside a koi pond, under cherry blossoms at dusk）
- ポーズ・動作（例: holding a delicate teacup, arranging ikebana flowers）
- 表情・光（例: gentle smile, golden hour glow, soft bokeh）

【ツイート文生成ルール】
- 日本語50〜120文字。凛（Rin）の一人称で詩的に書く。
- 末尾に必ず「#AI美女 #着物女子 #和装 #AIモデル #japanesekimono」を含める。
- 絵文字1〜3個使用。

【出力形式（厳守）】
SCENE_PROMPT: {英語シーン描写（1行）}
TWEET: {ツイート本文（日本語）}`

export const maxDuration = 60

export async function POST() {
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const falKey = process.env.FAL_KEY
  const referenceUrl = process.env.REFERENCE_IMAGE_URL

  if (!anthropicKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })
  if (!falKey)       return NextResponse.json({ error: 'FAL_KEY not set' }, { status: 500 })
  if (!referenceUrl) return NextResponse.json({ error: 'REFERENCE_IMAGE_URL not set — run generator.py once first' }, { status: 500 })

  // ① Gemini の代わりに Claude でシーン＋ツイート文生成
  const anthropic = new Anthropic({ apiKey: anthropicKey })
  const aiRes = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: '今日の季節感や情景を自由に想像して、凛（Rin）らしい投稿を1件生成してください。' }],
  })

  const text = aiRes.content[0].type === 'text' ? aiRes.content[0].text.trim() : ''
  const sceneMatch = text.match(/SCENE_PROMPT:\s*(.+)/)
  const tweetMatch = text.match(/TWEET:\s*([\s\S]+)/)
  if (!sceneMatch || !tweetMatch) {
    return NextResponse.json({ error: 'AI output format error', raw: text }, { status: 500 })
  }
  const scenePrompt = sceneMatch[1].trim()
  const tweetText   = tweetMatch[1].trim()

  // ② DB に下書き作成
  const post = await prisma.post.create({
    data: {
      tweetText,
      imagePrompt: scenePrompt,
      slot: 'evening',
      theme: 'hana-daily',
      themeName: 'Daily Post',
      scheduledAt: new Date(),
      status: 'draft',
    },
  })

  // ③ fal.ai で画像生成
  fal.config({ credentials: falKey })
  const falResult = await fal.subscribe('fal-ai/instant-character', {
    input: {
      image_url: referenceUrl,
      prompt: scenePrompt,
      num_images: 1,
      output_format: 'png',
    },
  }) as { data: { images: { url: string }[] } }

  const imageUrl = falResult.data.images[0].url

  // ④ 画像をダウンロードして保存
  const imgRes = await fetch(imageUrl)
  const imgBuf = Buffer.from(await imgRes.arrayBuffer())
  const mediaDir = process.env.IMAGE_DIR ?? '/app/data/images'
  fs.mkdirSync(mediaDir, { recursive: true })
  const filename = `${post.id}.png`
  fs.writeFileSync(path.join(mediaDir, filename), imgBuf)

  await prisma.post.update({
    where: { id: post.id },
    data: { imagePath: filename, mediaType: 'image' },
  })

  return NextResponse.json({ ok: true, id: post.id })
}
