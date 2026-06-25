import { prisma } from '@hana/db'
import { NextResponse } from 'next/server'
import { fal, ApiError } from '@fal-ai/client'
import fs from 'fs'
import path from 'path'
import { withRetry, TransientApiError } from '@/lib/retry'
import kimonoPatterns from '../../../../../../../research/data/kimono_patterns.json'
import imageConfig from '../../../../../../../research/data/image_config.json'
import genSettings from '../../../../../../../research/data/generation_settings.json'

// ── 型定義 ───────────────────────────────────────────────────────────────────
type SituationEntry = { id: string; label: string; en_prompt: string | null; poses: string[] }
type ColorEntry     = { id: string; light_en: string | null; dark_en: string | null }
type PatternEntry   = { id: string; en: string | null }
type ExprEntry      = { id: string; en: string | null }
type WeatherEntry   = { id: string; en: string | null }

type GenBody = {
  situation?: string; color?: string; shade?: string
  pattern?: string; expression?: string; weather?: string; freeText?: string
}
type GenEnv = {
  geminiKey: string; falKey: string; referenceUrl: string
  filmPreset: string; researchApiUrl: string; mediaDir: string
}

// ── 季節カレンダー ────────────────────────────────────────────────────────────
interface SeasonEntry {
  season_en: string; allow: string[]; ban: string[]
  events: string[]; mood: string; kimono_hint: string
}

const SEASON_CALENDAR: Record<string, SeasonEntry> = {
  "1":  { season_en: "Deep winter / New Year", allow: ["snow", "first sunrise (hatsuhinode)", "kotatsu", "plum buds", "camellia (tsubaki)"], ban: ["cherry blossoms", "autumn leaves", "fireflies", "summer festival"], events: ["New Year (Oshogatsu, Jan 1)", "Coming of Age Day (2nd Mon)"], mood: "quiet, fresh-start, cold air, prayerful", kimono_hint: "formal furisode or houmongi in red, white, or gold with pine-bamboo-plum patterns" },
  "2":  { season_en: "Late winter, plum season", allow: ["plum blossoms (ume)", "snow remnants", "camellia", "early spring light"], ban: ["cherry blossoms in full bloom", "autumn leaves", "summer"], events: ["Setsubun (Feb 3)", "Risshun / first day of spring"], mood: "anticipation, plum fragrance, thawing", kimono_hint: "camellia or plum blossom patterns on pale pink or ivory ground" },
  "3":  { season_en: "Early spring, cherry blossom start", allow: ["cherry blossoms beginning to bloom", "plum", "warm breeze", "peach blossoms"], ban: ["autumn leaves", "snow", "summer festival"], events: ["Hinamatsuri (Mar 3)", "Vernal Equinox"], mood: "awakening, soft pink, gentle", kimono_hint: "hanami-style furisode with peach or early cherry blossoms, soft pastels" },
  "4":  { season_en: "Full spring, peak sakura", allow: ["cherry blossoms in full bloom", "hanami picnic", "fresh green buds", "spring rain"], ban: ["autumn leaves", "snow", "fireflies"], events: ["Hanami season", "school/work new-year start"], mood: "celebratory, fleeting beauty, bright", kimono_hint: "sakura-patterned kimono in soft pinks or whites" },
  "5":  { season_en: "Late spring / early summer", allow: ["fresh green leaves", "wisteria (fuji)", "azalea", "carp streamers (koinobori)"], ban: ["cherry blossoms", "autumn leaves", "snow"], events: ["Children's Day (May 5)", "Golden Week"], mood: "vivid green, refreshing, lively", kimono_hint: "iris or wisteria patterns in purple and green" },
  "6":  { season_en: "Rainy season (tsuyu)", allow: ["hydrangea (ajisai)", "rain", "fireflies (hotaru)", "green maple", "umbrella"], ban: ["cherry blossoms", "autumn leaves", "snow"], events: ["Nagoshi no Harae (Jun 30)"], mood: "rain-soft, melancholic-beautiful, glistening", kimono_hint: "ajisai patterns in blue-purple on linen or cotton fabric" },
  "7":  { season_en: "Midsummer, festival season", allow: ["summer festival (matsuri)", "fireworks (hanabi)", "yukata", "wind chime (furin)", "lotus"], ban: ["cherry blossoms", "autumn leaves", "snow"], events: ["Tanabata (Jul 7)", "summer festivals"], mood: "festive, warm night, nostalgic, vibrant", kimono_hint: "lightweight yukata in asagao or goldfish patterns" },
  "8":  { season_en: "Late summer, Obon", allow: ["fireworks", "yukata", "cicada", "sunflower", "lantern (toro nagashi)"], ban: ["cherry blossoms", "autumn leaves", "snow"], events: ["Obon (mid-Aug)", "Bon Odori dance"], mood: "humid, ancestral, lantern-lit, bittersweet", kimono_hint: "indigo yukata with bold summer motifs" },
  "9":  { season_en: "Early autumn", allow: ["full moon (tsukimi)", "susuki grass", "early autumn breeze", "red dragonfly", "cosmos flower"], ban: ["cherry blossoms", "snow", "summer festival"], events: ["Tsukimi / Moon Viewing", "Autumnal Equinox"], mood: "calm, transition, moonlit, reflective", kimono_hint: "autumn kimono with susuki grass and moon motifs on deep blue or gold" },
  "10": { season_en: "Autumn, leaves turning", allow: ["autumn leaves (koyo)", "chrysanthemum", "persimmon", "harvest"], ban: ["cherry blossoms", "snow", "fireflies"], events: ["autumn festivals", "chrysanthemum viewing"], mood: "warm, golden, harvest, cozy", kimono_hint: "chrysanthemum or maple patterns on deep crimson or amber" },
  "11": { season_en: "Peak autumn foliage", allow: ["autumn leaves in full color (momiji)", "ginkgo gold", "tea ceremony", "warm kimono"], ban: ["cherry blossoms", "summer festival", "fireflies"], events: ["Shichi-Go-San (Nov 15)", "peak koyo"], mood: "rich red-gold, contemplative, crisp", kimono_hint: "rich autumn weave with momiji patterns in scarlet and gold" },
  "12": { season_en: "Early winter / year end", allow: ["first snow", "winter illumination", "year-end", "camellia", "warm sake"], ban: ["cherry blossoms", "autumn leaves at peak", "fireflies"], events: ["Year-end (Omisoka, Dec 31)", "winter solstice (Toji)"], mood: "cold, intimate, reflective, glowing-warm-indoors", kimono_hint: "elegant lined kimono in deep navy or black with camellia or snow motifs" },
}

const HASHTAG_POOL = [
  '#Japan', '#JapaneseCulture', '#Kimono', '#JapanTravel',
  '#WabiSabi', '#Sakura', '#TraditionalJapan', '#JapaneseBeauty',
  '#Washoku', '#Onsen', '#JapanLife', '#VisitJapan',
  '#JapaneseFashion', '#Zen', '#KimonoStyle',
]

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
function jstMonth(): number {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCMonth() + 1
}

function getSeasonalContext(): string {
  const m = jstMonth()
  const entry = SEASON_CALENDAR[String(m)]
  if (!entry) return ''
  return [
    `=== SEASONAL CONTEXT (Month ${m}) ===`,
    `Season: ${entry.season_en}`, `Mood: ${entry.mood}`,
    `Allowed motifs: ${entry.allow.join(', ')}`,
    `Forbidden: ${entry.ban.join(', ')}`,
    `Events: ${entry.events.join(', ')}`,
    `Kimono hint: ${entry.kimono_hint}`, `===`,
  ].join('\n')
}

function pickRandomComponents(month: number) {
  const useClassic = Math.random() < kimonoPatterns.classic_ratio
  const key = String(month) as keyof typeof kimonoPatterns.seasonal
  const patternPool = useClassic ? kimonoPatterns.classic : (kimonoPatterns.seasonal[key] ?? kimonoPatterns.classic)
  const pattern = patternPool[Math.floor(Math.random() * patternPool.length)]
  const colorPool = kimonoPatterns.seasonal_colors[key as keyof typeof kimonoPatterns.seasonal_colors] ?? kimonoPatterns.colors
  const color = colorPool[Math.floor(Math.random() * colorPool.length)]
  const obi = kimonoPatterns.obi[Math.floor(Math.random() * kimonoPatterns.obi.length)]
  return { color, pattern, obi }
}

function buildKimonoHint(colorId: string | undefined, shadeId: string | undefined, patternId: string | undefined, month: number): string {
  const rand = pickRandomComponents(month)
  let colorEn: string
  if (!colorId || colorId === 'random') {
    colorEn = rand.color
  } else {
    const cfg = (genSettings.colors as ColorEntry[]).find(c => c.id === colorId)
    if (!cfg?.light_en) { colorEn = rand.color } else {
      const shade = (!shadeId || shadeId === 'random') ? (Math.random() < 0.5 ? 'light' : 'dark') : shadeId
      colorEn = shade === 'light' ? (cfg.light_en ?? rand.color) : (cfg.dark_en ?? rand.color)
    }
  }
  let patternEn: string
  if (!patternId || patternId === 'random') {
    patternEn = rand.pattern
  } else {
    const cfg = (genSettings.patterns as PatternEntry[]).find(p => p.id === patternId)
    patternEn = cfg?.en ?? rand.pattern
  }
  return `she is wearing a traditional Japanese kimono (着物), entirely ${colorEn} kimono with single color scheme throughout, wide kimono sleeves and formal Japanese draping, ${patternEn}, paired with ${rand.obi} obi sash, NOT western clothes`
}

function buildSceneFromSettings(situationId: string | undefined, expressionId: string | undefined, weatherId: string | undefined, freeText: string | undefined): string | null {
  if (!situationId || situationId === 'random') return null
  const sit = (genSettings.situations as SituationEntry[]).find(s => s.id === situationId)
  if (!sit?.en_prompt) return null
  const pose = freeText?.trim() || sit.poses[Math.floor(Math.random() * sit.poses.length)]
  const expEn = (expressionId && expressionId !== 'random') ? ((genSettings.expressions as ExprEntry[]).find(e => e.id === expressionId)?.en ?? null) : null
  const wxEn  = (weatherId && weatherId !== 'random') ? ((genSettings.weather as WeatherEntry[]).find(w => w.id === weatherId)?.en ?? null) : null
  return [sit.en_prompt, pose, expEn, wxEn].filter(Boolean).join(', ')
}

function pickHashtags(n: number): string[] {
  const pool = [...HASHTAG_POOL]
  const result: string[] = []
  for (let i = 0; i < n && pool.length > 0; i++) result.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
  return result
}

// ── Gemini 呼び出し（強化リトライ + フォールバックモデル） ─────────────────────
type GeminiData = { candidates: Array<{ content: { parts: Array<{ text?: string; thought?: boolean }> }; finishReason?: string }> }

async function callGemini(geminiKey: string, systemPrompt: string, userMessage: string): Promise<GeminiData> {
  const body = JSON.stringify({
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    generationConfig: { maxOutputTokens: 2048 },
  })

  // gemini-2.5-flash-lite を maxRetries=5, baseDelayMs=10s で試行
  async function tryModel(model: string): Promise<GeminiData> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`
    return withRetry(async () => {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
      if (!res.ok) {
        const errText = await res.text()
        const msg = `Gemini ${model} error (${res.status}): ${errText.slice(0, 300)}`
        if (res.status === 503 || res.status === 429) throw new TransientApiError(msg, res.status)
        throw new Error(msg)
      }
      return res.json() as Promise<GeminiData>
    }, { label: `gemini/${model}`, maxRetries: 5, baseDelayMs: 10_000 })
  }

  try {
    return await tryModel('gemini-2.5-flash-lite')
  } catch (err) {
    // 全リトライ失敗 & 一時エラーなら gemini-2.5-flash にフォールバック
    const isTransient = err instanceof TransientApiError || (typeof (err as {status?:unknown})?.status === 'number' && [503,429].includes((err as {status:number}).status))
    if (isTransient) {
      console.warn('[generate/rin] gemini-2.5-flash-lite 全リトライ失敗→ gemini-2.5-flash にフォールバック')
      return await tryModel('gemini-2.5-flash')
    }
    throw err
  }
}

// ── バックグラウンド生成本体 ──────────────────────────────────────────────────
async function runGeneration(jobId: string, body: GenBody, env: GenEnv): Promise<void> {
  const { geminiKey, falKey, referenceUrl, filmPreset, researchApiUrl, mediaDir } = env
  const { situation, color, shade, pattern, expression, weather, freeText } = body

  try {
    await prisma.generationJob.update({ where: { id: jobId }, data: { status: 'generating' } })

    const month = jstMonth()
    const sitConfig = (situation && situation !== 'random')
      ? ((genSettings.situations as SituationEntry[]).find(s => s.id === situation) ?? null)
      : null

    // Gemini: シーン＋ツイート生成
    const seasonalContext = getSeasonalContext()
    const fullSystemPrompt = seasonalContext ? `${seasonalContext}\n\n${SYSTEM_PROMPT}` : SYSTEM_PROMPT
    const userMessage = sitConfig
      ? `Generate a post for Rin. She is at a ${sitConfig.label}. Write the tweet to reflect this traditional Japanese setting, matching the current season's mood.`
      : 'Generate one post for Rin based on the current season.'

    const geminiData = await callGemini(geminiKey, fullSystemPrompt, userMessage)

    // パース（最大2回試行）
    let geminiScenePrompt = ''
    let tweetText = ''
    for (let attempt = 0; attempt < 2; attempt++) {
      const parts = geminiData.candidates?.[0]?.content?.parts ?? []
      const rawText = parts.filter(p => !p.thought && typeof p.text === 'string').map(p => p.text!).join('').trim()
      const finishReason = geminiData.candidates?.[0]?.finishReason
      if (finishReason === 'MAX_TOKENS') throw new Error('AI output truncated (MAX_TOKENS)')

      const clean = rawText.replace(/^```[^\n]*\n?/m, '').replace(/\n?```\s*$/m, '').trim()
      const sceneMatch = clean.match(/SCENE_PROMPT:\s*([^\n]+)/)
      const tweetMatch = clean.match(/TWEET:\s*([\s\S]+)/)
      if (!sceneMatch || !tweetMatch) {
        if (attempt === 0) { console.warn('[generate/rin] Gemini parse fail, retry parse...'); continue }
        throw new Error(`AI output format error: ${clean.slice(0, 200)}`)
      }
      geminiScenePrompt = sceneMatch[1].trim()
      const tweetBody = tweetMatch[1].trim().split('\n').filter(l => !l.trimStart().startsWith('#')).join('\n').trim()
      tweetText = `${tweetBody}\n${pickHashtags(4).join('\n')}`
      break
    }

    // プロンプト構築
    const kimonoHint = buildKimonoHint(color, shade, pattern, month)
    const builtScene  = buildSceneFromSettings(situation, expression, weather, freeText)
    const sceneToUse  = builtScene ?? geminiScenePrompt

    // DB に下書き作成
    const post = await prisma.post.create({
      data: {
        tweetText, imagePrompt: sceneToUse,
        slot: 'evening', theme: 'rin-daily', themeName: 'Daily Post',
        scheduledAt: new Date(), status: 'draft', japaneseTranslation: '',
      },
    })

    // fal.ai 画像生成
    fal.config({ credentials: falKey })
    const eleganceBlock = (imageConfig as Record<string, string>).elegance_block ?? ''
    const promptParts   = [kimonoHint, eleganceBlock, sceneToUse].filter(s => s !== '')
    const falPrompt     = imageConfig.quality_suffix ? `${promptParts.join(', ')}, ${imageConfig.quality_suffix}` : promptParts.join(', ')
    const falInput = {
      image_url: referenceUrl, prompt: falPrompt,
      ...(imageConfig.negative_prompt ? { negative_prompt: imageConfig.negative_prompt } : {}),
      num_images: 1, output_format: 'png' as const,
    }

    console.log('[generate/rin bg] situation=%s color=%s pattern=%s falPromptLen=%d', situation ?? 'random', color ?? 'random', pattern ?? 'random', falPrompt.length)

    const falResult = await withRetry(
      () => Promise.race([
        fal.subscribe('fal-ai/instant-character', {
          input: falInput, pollInterval: 3000,
          onQueueUpdate(u) { console.log('[generate/rin bg] fal status=%s', (u as {status:string}).status) },
        }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new TransientApiError('fal.ai timeout after 200s')), 200_000)),
      ]) as Promise<{ data: { images: { url: string }[] } }>,
      { label: 'fal.ai', maxRetries: 3, baseDelayMs: 5_000 },
    )

    const imageUrl = falResult.data.images[0].url

    // 画像ダウンロード
    const imgRes = await fetch(imageUrl)
    let imgBuf = Buffer.from(await imgRes.arrayBuffer())

    // フィルムグレード
    try {
      const filmRes = await fetch(`${researchApiUrl}/film-grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_b64: imgBuf.toString('base64'), preset: filmPreset }),
        signal: AbortSignal.timeout(30_000),
      })
      if (filmRes.ok) {
        const fd = await filmRes.json() as { ok: boolean; image_b64?: string }
        if (fd.ok && fd.image_b64) { imgBuf = Buffer.from(fd.image_b64, 'base64'); console.log('[generate/rin bg] film grade OK') }
      }
    } catch { console.warn('[generate/rin bg] film grade skipped') }

    // 画像保存
    fs.mkdirSync(mediaDir, { recursive: true })
    const filename = `${post.id}.png`
    fs.writeFileSync(path.join(mediaDir, filename), imgBuf)

    // 生成条件を記録
    const conditionsJson = (situation || color || shade || pattern || expression || weather || freeText)
      ? JSON.stringify({ situation, color, shade, pattern, expression, weather, freeText: freeText || undefined })
      : null

    await prisma.post.update({
      where: { id: post.id },
      data: {
        imagePath: filename, mediaType: 'image',
        ...(conditionsJson ? { generationConditions: conditionsJson } : {}),
      },
    })

    await prisma.generationJob.update({ where: { id: jobId }, data: { status: 'done', postId: post.id } })
    console.log('[generate/rin bg] 完了 postId=%s', post.id)

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[generate/rin bg] 失敗 jobId=%s:', jobId, err)
    await prisma.generationJob.update({
      where: { id: jobId },
      data: { status: 'failed', errorMessage: msg.slice(0, 500) },
    }).catch(() => { /* DB更新失敗は握りつぶす */ })
  }
}

// ── エクスポート ──────────────────────────────────────────────────────────────
export const maxDuration = 30  // ジョブ登録のみなので30秒で十分
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const geminiKey    = process.env.GEMINI_API_KEY
  const falKey       = process.env.FAL_KEY
  const referenceUrl = process.env.REFERENCE_IMAGE_URL

  if (!geminiKey)    return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 })
  if (!falKey)       return NextResponse.json({ error: 'FAL_KEY not set' }, { status: 500 })
  if (!referenceUrl) return NextResponse.json({ error: 'REFERENCE_IMAGE_URL not set' }, { status: 500 })

  // オプショナルなリクエストボディ（bot.py や旧UIからはbodyなし）
  let reqBody: GenBody = {}
  try {
    const ct = req.headers.get('content-type') ?? ''
    if (ct.includes('application/json')) reqBody = await req.json()
  } catch { /* no body = all random */ }

  // ジョブをDBに登録
  const job = await prisma.generationJob.create({ data: {} })

  // バックグラウンドで生成を開始（await しないので即座に返る）
  const env: GenEnv = {
    geminiKey, falKey, referenceUrl,
    filmPreset: process.env.FILM_PRESET ?? 'subtle',
    researchApiUrl: process.env.RESEARCH_API_URL ?? 'http://research-api:8787',
    mediaDir: process.env.IMAGE_DIR ?? '/app/data/images',
  }

  runGeneration(job.id, reqBody, env).catch(err => {
    console.error('[generate/rin] Background generation unhandled error:', err)
  })

  // jobId を即座に返す（生成完了を待たない）
  return NextResponse.json({ ok: true, jobId: job.id })
}
