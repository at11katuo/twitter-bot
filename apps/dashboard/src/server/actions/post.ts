'use server'

import { prisma } from '@hana/db'
import { SLOT_LABELS, THEMES, type Slot } from '@hana/shared'
import Anthropic from '@anthropic-ai/sdk'
import { revalidatePath } from 'next/cache'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const CHARACTER_SYSTEM = `You are Hana (花), a 25-year-old Japanese woman who loves traditional Japanese culture.
You share the beauty of Japan with the world through your own eyes and experiences.

Write in English targeting people outside Japan who are curious about Japanese culture.
Voice: warm, personal, subtly poetic, first person, calm.
Body text 180–260 characters. End with 4–6 hashtags on a new line.
No lists, no rhetorical questions, no travel-brochure language.`

async function generateContent(slot: Slot, usedKeys: string[]) {
  const available = THEMES.filter((t) => !usedKeys.includes(t.key))
  const pool = available.length > 0 ? available : [...THEMES]
  const theme = pool[Math.floor(Math.random() * pool.length)]
  const slotInfo = SLOT_LABELS[slot]

  const moods = {
    morning: 'peaceful, serene, quiet — the stillness before the world wakes up',
    noon:    'engaged, curious, active — exploring, creating, being present',
    evening: 'reflective, atmospheric, beautiful — the day settling into stillness',
  }

  const [tweetRes, promptRes] = await Promise.all([
    claude.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: CHARACTER_SYSTEM,
      messages: [{
        role: 'user',
        content: `Write a tweet for Hana's ${slotInfo.en} post (${slotInfo.time} JST).
Theme: ${theme.name}
Mood: ${moods[slot]}
Output only the tweet text.`,
      }],
    }),
    claude.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `Create a Pollo AI image prompt for:
Character: Beautiful 25-year-old Japanese woman named Hana, long straight black hair, elegant features, wearing traditional Japanese kimono, photorealistic photography style, cinematic lighting
Theme: ${theme.name}
Mood: ${moods[slot]}

Write a single detailed prompt (2–4 sentences). Output only the prompt.`,
      }],
    }),
  ])

  const tweetText = tweetRes.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim()
  const imagePrompt = promptRes.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim()

  return { theme, tweetText, imagePrompt }
}

function getScheduledAt(slot: Slot, dateJST: Date): Date {
  const [h, m] = SLOT_LABELS[slot].time.split(':').map(Number)
  const d = new Date(dateJST)
  d.setHours(h - 9, m, 0, 0)
  return d
}

export async function generateContentAction() {
  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const usedKeys = (await prisma.post.findMany({ take: 9, orderBy: { createdAt: 'desc' }, select: { theme: true } }))
    .map((p) => p.theme)

  const slots: Slot[] = ['morning', 'noon', 'evening']
  for (const slot of slots) {
    try {
      const { theme, tweetText, imagePrompt } = await generateContent(slot, usedKeys)
      usedKeys.push(theme.key)
      await prisma.post.create({
        data: {
          slot,
          scheduledAt: getScheduledAt(slot, nowJST),
          theme: theme.key,
          themeName: theme.name,
          imagePrompt,
          tweetText,
          status: 'draft',
        },
      })
    } catch (e) {
      console.error(`Failed to generate ${slot}:`, e)
    }
  }

  revalidatePath('/')
}
