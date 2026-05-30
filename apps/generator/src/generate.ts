import Anthropic from '@anthropic-ai/sdk'
import { THEMES, SLOT_LABELS, type Slot, type ThemeKey } from '@hana/shared'
import { CHARACTER, SLOT_MOODS } from './character.js'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// 直近の投稿テーマと重複しないようにテーマを選ぶ
export function pickTheme(usedKeys: string[]): (typeof THEMES)[number] {
  const available = THEMES.filter((t) => !usedKeys.includes(t.key))
  const pool = available.length > 0 ? available : [...THEMES]
  return pool[Math.floor(Math.random() * pool.length)]
}

// ツイート本文を生成
export async function generateTweetText(
  slot: Slot,
  theme: (typeof THEMES)[number],
): Promise<string> {
  const slotInfo = SLOT_LABELS[slot]
  const mood = SLOT_MOODS[slot]

  const userPrompt = `Write a tweet from Hana's perspective for the ${slotInfo.en} slot (${slotInfo.time} JST).

Theme: ${theme.name}
Mood: ${mood}

Requirements:
- 180–260 characters of body text
- Naturally weave Hana's personal connection to the theme
- End with 4–6 relevant hashtags (on a new line, starting with a blank line)
- Include 1–2 emoji naturally within the body

Output only the tweet text. No explanation.`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: CHARACTER.systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()

  return text
}

// Pollo AI用の画像生成プロンプトを生成
export async function generateImagePrompt(
  slot: Slot,
  theme: (typeof THEMES)[number],
): Promise<string> {
  const mood = SLOT_MOODS[slot]

  const userPrompt = `Create a Pollo AI image generation prompt for the following:

Character base: ${CHARACTER.baseImagePrompt}
Theme: ${theme.name}
Mood/atmosphere: ${mood}

Write a single, detailed image generation prompt (2–4 sentences) that:
1. Starts with the character base description
2. Adds the specific scene/setting for this theme
3. Specifies lighting conditions matching the slot mood
4. Adds cinematic/photographic style keywords

Output only the prompt text. No explanation, no markdown.`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    messages: [{ role: 'user', content: userPrompt }],
  })

  return response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()
}

export type GeneratedContent = {
  slot: Slot
  theme: (typeof THEMES)[number]
  tweetText: string
  imagePrompt: string
}

export async function generateForSlot(slot: Slot, usedThemeKeys: string[]): Promise<GeneratedContent> {
  const theme = pickTheme(usedThemeKeys)
  const [tweetText, imagePrompt] = await Promise.all([
    generateTweetText(slot, theme),
    generateImagePrompt(slot, theme),
  ])
  return { slot, theme, tweetText, imagePrompt }
}
