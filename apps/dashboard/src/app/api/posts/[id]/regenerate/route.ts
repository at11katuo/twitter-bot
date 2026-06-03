import { prisma } from '@hana/db'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `あなたは日本の伝統美とAIアートを発信するTwitterアカウント「凛（Rin）」のツイート文ライターです。

【キャラクター：凛（Rin）】
- 20歳の日本女性。四季折々の着物を纏い、日本の伝統美・侘び寂びを体現する。
- 凛とした美しさの中に、優しさと品格を持つ。

【ツイート文生成ルール】
- 日本語で50〜120文字。
- 凛（Rin）の一人称視点で、その日の風景・心情・着物の描写を詩的に書く。
- 末尾に必ず「#AI美女 #着物女子 #和装 #AIモデル #japanesekimono」を含める。
- 絵文字を1〜3個使い、余韻を残す文体にする。
- ツイート本文のみを出力し、前置きや説明は不要。`

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const post = await prisma.post.findUnique({ where: { id: params.id } })
  if (!post) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })

  const client = new Anthropic({ apiKey })

  const userMessage = post.imagePrompt
    ? `以下のシーンに合ったツイート文を1件生成してください。\nシーン: ${post.imagePrompt}`
    : `凛（Rin）らしい今日のツイート文を1件生成してください。`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  })

  const newText = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
  if (!newText) return NextResponse.json({ error: 'generation failed' }, { status: 500 })

  const updated = await prisma.post.update({
    where: { id: params.id },
    data: { tweetText: newText },
  })

  return NextResponse.json({ ok: true, tweetText: updated.tweetText })
}
