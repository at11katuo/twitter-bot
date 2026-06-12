import { prisma } from '@hana/db'
import { NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import fs from 'fs'
import path from 'path'
import kimonoPatterns from '../../../../../../../research/data/kimono_patterns.json'
import imageConfig from '../../../../../../../research/data/image_config.json'

// ── 季節カレンダー（season_calendar.json の内容を定数として埋め込み） ──────────
interface SeasonEntry {
  season_en: string
  allow: string[]
  ban: string[]
  events: string[]
  mood: string
  kimono_hint: string
}

const SEASON_CALENDAR: Record<string, SeasonEntry> = {
  "1": {
    "season_en": "Deep winter / New Year",
    "allow": ["snow", "first sunrise (hatsuhinode)", "kotatsu", "plum buds", "camellia (tsubaki)", "kimono with fur collar"],
    "ban": ["cherry blossoms", "autumn leaves", "fireflies", "summer festival"],
    "events": ["New Year (Oshogatsu, Jan 1)", "Coming of Age Day (Seijin no Hi, 2nd Mon)"],
    "mood": "quiet, fresh-start, cold air, prayerful",
    "kimono_hint": "formal furisode or houmongi in red, white, or gold with pine-bamboo-plum (shochikubai) patterns"
  },
  "2": {
    "season_en": "Late winter, plum season",
    "allow": ["plum blossoms (ume)", "snow remnants", "camellia", "early spring light", "warm tea"],
    "ban": ["cherry blossoms in full bloom", "autumn leaves", "summer"],
    "events": ["Setsubun (Feb 3)", "Risshun / first day of spring"],
    "mood": "anticipation, plum fragrance, thawing",
    "kimono_hint": "camellia or plum blossom patterns on pale pink or ivory ground"
  },
  "3": {
    "season_en": "Early spring, cherry blossom start",
    "allow": ["cherry blossoms beginning to bloom", "plum", "warm breeze", "spring kimono", "peach blossoms"],
    "ban": ["autumn leaves", "snow", "summer festival"],
    "events": ["Hinamatsuri / Doll Festival (Mar 3)", "Vernal Equinox"],
    "mood": "awakening, soft pink, gentle",
    "kimono_hint": "hanami-style furisode with peach or early cherry blossoms, soft pastels"
  },
  "4": {
    "season_en": "Full spring, peak sakura",
    "allow": ["cherry blossoms in full bloom", "hanami picnic", "fresh green buds", "spring rain"],
    "ban": ["autumn leaves", "snow", "fireflies"],
    "events": ["Hanami season", "school/work new-year start"],
    "mood": "celebratory, fleeting beauty (mono no aware), bright",
    "kimono_hint": "sakura-patterned kimono in soft pinks or whites — the classic hanami look"
  },
  "5": {
    "season_en": "Late spring / early summer (fresh green)",
    "allow": ["fresh green leaves (shinryoku)", "wisteria (fuji)", "azalea", "carp streamers (koinobori)", "tea harvest"],
    "ban": ["cherry blossoms", "autumn leaves", "snow"],
    "events": ["Children's Day (May 5)", "Golden Week"],
    "mood": "vivid green, refreshing, lively",
    "kimono_hint": "iris or wisteria patterns in purple and green, informal hitoe (unlined) appropriate"
  },
  "6": {
    "season_en": "Rainy season (tsuyu)",
    "allow": ["hydrangea (ajisai)", "rain", "fireflies (hotaru)", "green maple (aomomiji)", "umbrella", "wet stone garden"],
    "ban": ["cherry blossoms", "autumn leaves", "snow"],
    "events": ["Nagoshi no Harae / summer purification (Jun 30)"],
    "mood": "rain-soft, melancholic-beautiful, glistening, quiet",
    "kimono_hint": "ajisai (hydrangea) patterns in blue-purple on linen or cotton fabric for the humid season"
  },
  "7": {
    "season_en": "Midsummer, festival season begins",
    "allow": ["summer festival (matsuri)", "fireworks (hanabi)", "yukata", "wind chime (furin)", "lotus", "shaved ice (kakigori)"],
    "ban": ["cherry blossoms", "autumn leaves", "snow"],
    "events": ["Tanabata / Star Festival (Jul 7)", "summer festivals"],
    "mood": "festive, warm night, nostalgic, vibrant",
    "kimono_hint": "lightweight yukata in asagao or goldfish patterns for summer festival look"
  },
  "8": {
    "season_en": "Late summer, Obon",
    "allow": ["fireworks", "yukata", "cicada", "sunflower", "lantern (toro nagashi)", "summer night"],
    "ban": ["cherry blossoms", "autumn leaves", "snow"],
    "events": ["Obon (mid-Aug)", "Bon Odori dance"],
    "mood": "humid, ancestral, lantern-lit, bittersweet",
    "kimono_hint": "indigo yukata with bold summer motifs, or fine-woven ro kimono for evening festivals"
  },
  "9": {
    "season_en": "Early autumn",
    "allow": ["full moon (tsukimi)", "susuki grass", "early autumn breeze", "red dragonfly", "cosmos flower"],
    "ban": ["cherry blossoms", "snow", "summer festival"],
    "events": ["Tsukimi / Moon Viewing", "Autumnal Equinox"],
    "mood": "calm, transition, moonlit, reflective",
    "kimono_hint": "autumn-transitional kimono with susuki grass and moon motifs on deep blue or gold ground"
  },
  "10": {
    "season_en": "Autumn, leaves turning",
    "allow": ["autumn leaves beginning (koyo)", "chrysanthemum", "persimmon", "harvest", "warm earthy tones"],
    "ban": ["cherry blossoms", "snow", "fireflies"],
    "events": ["autumn festivals", "chrysanthemum viewing"],
    "mood": "warm, golden, harvest, cozy",
    "kimono_hint": "chrysanthemum or maple patterns on deep crimson or amber, lined kimono for cooler weather"
  },
  "11": {
    "season_en": "Peak autumn foliage",
    "allow": ["autumn leaves in full color (momiji)", "ginkgo gold", "tea ceremony", "warm kimono", "hot spring with leaves"],
    "ban": ["cherry blossoms", "summer festival", "fireflies"],
    "events": ["Shichi-Go-San (Nov 15)", "peak koyo"],
    "mood": "rich red-gold, contemplative, crisp",
    "kimono_hint": "rich autumn weave with momiji patterns in scarlet and gold — most photogenic season for kimono"
  },
  "12": {
    "season_en": "Early winter / year end",
    "allow": ["first snow", "winter illumination", "year-end (toshikoshi)", "camellia", "warm sake", "hot spring steam"],
    "ban": ["cherry blossoms", "autumn leaves at peak", "fireflies"],
    "events": ["Year-end (Omisoka, Dec 31)", "winter solstice (Toji)"],
    "mood": "cold, intimate, reflective, glowing-warm-indoors",
    "kimono_hint": "elegant lined kimono or haori in deep navy or black with camellia or snow motifs"
  }
}

// ── ハッシュタグプール ────────────────────────────────────────────────────────
const HASHTAG_POOL = [
  '#Japan', '#JapaneseCulture', '#Kimono', '#JapanTravel',
  '#WabiSabi', '#Sakura', '#TraditionalJapan', '#JapaneseBeauty',
  '#Washoku', '#Onsen', '#JapanLife', '#VisitJapan',
  '#JapaneseFashion', '#Zen', '#KimonoStyle',
]

// ── システムプロンプト ────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are the content generator for the Twitter account "凛（Rin）", a beautiful 20-year-old Japanese woman in seasonal kimono who warmly shares Japanese culture with international followers.

【Character: 凛（Rin）】
- Embodies traditional Japanese beauty and grace
- Speaks warmly, elegantly, and personally — like a friend sharing a private moment
- ※ Visual appearance is fixed by reference image. Do NOT describe face, age, or appearance.

【SCENE_PROMPT Rules】
Write in English. Describe ONLY: background/location, pose/action, expression, lighting.
Do NOT mention kimono color or pattern — it is specified separately and will be appended automatically.

Required elements:
- Setting (e.g., "in a bamboo forest at dawn", "beside a koi pond", "under cherry blossoms at dusk")
- Pose/action (e.g., "holding a paper umbrella", "arranging ikebana flowers", "sipping matcha")
- Expression (e.g., "gentle smile", "serene gaze into the distance")
- Lighting (e.g., "soft morning light", "golden hour glow", "soft bokeh background")

Good example: "standing in a misty bamboo forest at dawn, holding a paper umbrella, serene expression, soft diffused light"

Refined settings ONLY: traditional tea house interior, moss garden, machiya (townhouse) corridor, temple stone passage, ryokan engawa (veranda). Do NOT use busy streets, modern buildings, crowded spaces, clutter, or contemporary environments.

【TWEET Rules】
Theme: Japanese kimono, seasons, washoku (traditional food), famous sights, tea ceremony, ikebana, or festivals.
Tone: 凛 warmly addresses international followers, elegantly sharing a piece of Japan.

Write the tweet in EXACTLY this 3-line structure (no extra lines):
Line 1 [English]: MUST use first person "I" — describe Rin's own emotion, action, or experience in the moment. Max 100 chars, 1-2 emoji.
Line 2 [Romaji]: The same sentiment in romanized Japanese (max 70 chars)
Line 3 [Japanese]: Japanese text (max 50 chars, 1 emoji)

【Output Format (STRICT — follow exactly, no additions)】
SCENE_PROMPT: {English scene description (1 line)}
TWEET: {Line 1 English — must include "I", describing Rin's feeling or action, 1-2 emoji}
{Line 2 Romaji}
{Line 3 Japanese with 1 emoji}

Do NOT add hashtags. Do NOT add any extra lines. Output ends after Line 3.`

// ── ユーティリティ ────────────────────────────────────────────────────────────
function getSeasonalContext(): string {
  const jstMonth = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCMonth() + 1
  const entry = SEASON_CALENDAR[String(jstMonth)]
  if (!entry) return ''
  return [
    `=== SEASONAL CONTEXT (Month ${jstMonth}) ===`,
    `Season: ${entry.season_en}`,
    `Mood: ${entry.mood}`,
    `Allowed motifs: ${entry.allow.join(', ')}`,
    `Forbidden: ${entry.ban.join(', ')}`,
    `Events: ${entry.events.join(', ')}`,
    `Kimono hint: ${entry.kimono_hint}`,
    `===`,
  ].join('\n')
}

function pickKimonoHint(month: number): string {
  const useClassic = Math.random() < kimonoPatterns.classic_ratio
  const key = String(month) as keyof typeof kimonoPatterns.seasonal
  const pool = useClassic
    ? kimonoPatterns.classic
    : (kimonoPatterns.seasonal[key] ?? kimonoPatterns.classic)
  const pattern = pool[Math.floor(Math.random() * pool.length)]
  const colorKey = key as keyof typeof kimonoPatterns.seasonal_colors
  const colorPool = kimonoPatterns.seasonal_colors[colorKey] ?? kimonoPatterns.colors
  const color = colorPool[Math.floor(Math.random() * colorPool.length)]
  const obi = kimonoPatterns.obi[Math.floor(Math.random() * kimonoPatterns.obi.length)]
  return `she is wearing a traditional Japanese kimono (着物), ${color} colored with wide kimono sleeves and formal Japanese draping, ${pattern}, paired with ${obi} obi sash, NOT western clothes`
}

function pickHashtags(n: number): string[] {
  const pool = [...HASHTAG_POOL]
  const result: string[] = []
  for (let i = 0; i < n && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length)
    result.push(pool.splice(idx, 1)[0])
  }
  return result
}

// ── エクスポート ──────────────────────────────────────────────────────────────
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST() {
  const geminiKey = process.env.GEMINI_API_KEY
  const falKey = process.env.FAL_KEY
  const referenceUrl = process.env.REFERENCE_IMAGE_URL

  if (!geminiKey)    return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 })
  if (!falKey)       return NextResponse.json({ error: 'FAL_KEY not set' }, { status: 500 })
  if (!referenceUrl) return NextResponse.json({ error: 'REFERENCE_IMAGE_URL not set' }, { status: 500 })

  // ① 季節コンテキストを先頭に付加したシステムプロンプトを構築
  const jstMonth = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCMonth() + 1
  const seasonalContext = getSeasonalContext()
  const fullSystemPrompt = seasonalContext
    ? `${seasonalContext}\n\n${SYSTEM_PROMPT}`
    : SYSTEM_PROMPT

  // ② Gemini 1.5 Flash でシーン＋ツイート文生成
  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: fullSystemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: 'Generate one post for Rin based on the current season.' }] }],
        generationConfig: { maxOutputTokens: 2048 },
      }),
    }
  )

  if (!geminiRes.ok) {
    const errBody = await geminiRes.text()
    console.error('[generate/rin] Gemini API error:', errBody)
    return NextResponse.json({ error: 'Gemini API error', detail: errBody }, { status: 500 })
  }

  const geminiData = await geminiRes.json() as {
    candidates: Array<{
      content: { parts: Array<{ text?: string; thought?: boolean }> }
      finishReason?: string
    }>
  }

  // 思考パーツ（thought: true）を除外し、残りのテキストを結合
  const parts = geminiData.candidates?.[0]?.content?.parts ?? []
  const rawText = parts
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text!)
    .join('')
    .trim()

  const finishReason = geminiData.candidates?.[0]?.finishReason
  console.log('[generate/rin] finishReason=%s rawLen=%d rawText=%j', finishReason, rawText.length, rawText.slice(0, 300))
  if (finishReason === 'MAX_TOKENS') {
    console.error('[generate/rin] output truncated by MAX_TOKENS — increase maxOutputTokens')
    return NextResponse.json({ error: 'AI output truncated (MAX_TOKENS)', raw: rawText }, { status: 500 })
  }

  // マークダウンのコードブロックを除去
  const cleanText = rawText
    .replace(/^```[^\n]*\n?/m, '')
    .replace(/\n?```\s*$/m, '')
    .trim()

  // ③ 出力パース（複数行の SCENE_PROMPT も許容するため .+ を [^\n]+ に）
  const sceneMatch = cleanText.match(/SCENE_PROMPT:\s*([^\n]+)/)
  const tweetMatch = cleanText.match(/TWEET:\s*([\s\S]+)/)

  if (!sceneMatch || !tweetMatch) {
    console.error('[generate/rin] parse failed. cleanText=%j', cleanText)
    return NextResponse.json({ error: 'AI output format error', raw: cleanText }, { status: 500 })
  }

  const scenePrompt = sceneMatch[1].trim()

  // # で始まる行を除去し、ハッシュタグをランダムに4個付加
  const tweetBodyLines = tweetMatch[1]
    .trim()
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
  const tweetBody = tweetBodyLines.join('\n').trim()
  const hashtags = pickHashtags(4).join('\n')
  const tweetText = `${tweetBody}\n${hashtags}`

  // ④ DB に下書き作成
  const post = await prisma.post.create({
    data: {
      tweetText,
      imagePrompt: scenePrompt,
      slot: 'evening',
      theme: 'rin-daily',
      themeName: 'Daily Post',
      scheduledAt: new Date(),
      status: 'draft',
      japaneseTranslation: '',
    },
  })

  // ⑤ fal.ai で画像生成（120秒タイムアウト付き）
  fal.config({ credentials: falKey })
  const kimonoHint    = pickKimonoHint(jstMonth)
  const eleganceBlock = (imageConfig as Record<string, string>).elegance_block ?? ''
  const promptParts   = [kimonoHint, eleganceBlock, scenePrompt].filter(s => s !== '')
  const basePrompt    = promptParts.join(', ')
  const falPrompt     = imageConfig.quality_suffix
    ? `${basePrompt}, ${imageConfig.quality_suffix}`
    : basePrompt
  let falResult: { data: { images: { url: string }[] } }
  try {
    console.log('[generate/rin] 参照画像 referenceUrl=%s', referenceUrl.split('/').pop())
    console.log('[generate/rin] kimonoHint=%s', kimonoHint)
    console.log('[generate/rin] fal.ai 開始 prompt=%j', falPrompt)
    falResult = await Promise.race([
      fal.subscribe('fal-ai/instant-character', {
        input: {
          image_url: referenceUrl,
          prompt: falPrompt,
          ...(imageConfig.negative_prompt ? { negative_prompt: imageConfig.negative_prompt } : {}),
          num_images: 1,
          output_format: 'png',
        },
        pollInterval: 3000,
        onQueueUpdate(update) {
          console.log('[generate/rin] fal.ai queue status=%s', (update as { status: string }).status)
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('fal.ai timeout after 180s')), 180_000)
      ),
    ]) as { data: { images: { url: string }[] } }
    console.log('[generate/rin] fal.ai 完了 imageUrl=%s', falResult?.data?.images?.[0]?.url?.slice(0, 80))
  } catch (falErr) {
    console.error('[generate/rin] fal.ai エラー:', falErr)
    return NextResponse.json({ error: 'fal.ai image generation failed', detail: String(falErr), id: post.id }, { status: 500 })
  }

  const imageUrl = falResult.data.images[0].url

  // ⑥ 画像をダウンロードして保存
  let imgBuf: Buffer
  try {
    const imgRes = await fetch(imageUrl)
    imgBuf = Buffer.from(await imgRes.arrayBuffer())
  } catch (dlErr) {
    console.error('[generate/rin] 画像DLエラー:', dlErr)
    return NextResponse.json({ error: 'image download failed', detail: String(dlErr), id: post.id }, { status: 500 })
  }

  // ⑦ フィルムグレード（research-api 経由）
  const filmPreset  = process.env.FILM_PRESET ?? 'subtle'
  const researchApi = process.env.RESEARCH_API_URL ?? 'http://research-api:8787'
  try {
    const filmRes = await fetch(`${researchApi}/film-grade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_b64: imgBuf.toString('base64'), preset: filmPreset }),
      signal: AbortSignal.timeout(30_000),
    })
    if (filmRes.ok) {
      const filmData = await filmRes.json() as { ok: boolean; image_b64?: string; preset?: string }
      if (filmData.ok && filmData.image_b64) {
        imgBuf = Buffer.from(filmData.image_b64, 'base64')
        console.log('[generate/rin] film grade applied preset=%s', filmData.preset)
      }
    }
  } catch (filmErr) {
    console.warn('[generate/rin] film grade skipped:', filmErr)
  }

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
