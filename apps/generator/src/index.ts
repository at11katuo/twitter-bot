import { prisma } from '@hana/db'
import { SLOT_LABELS, type Slot } from '@hana/shared'
import { generateForSlot } from './generate.js'
import { startPostingCron } from './poster.js'

const SLOTS: Slot[] = ['morning', 'evening']

// JST での次の投稿日の各スロット日時を返す
function getScheduledAt(slot: Slot, targetDateJST: Date): Date {
  const [h, m] = SLOT_LABELS[slot].time.split(':').map(Number)
  const d = new Date(targetDateJST)
  d.setHours(h - 9, m, 0, 0) // JST → UTC (-9h)
  return d
}

// 対象日に既にコンテンツが生成済みか確認
async function hasPostsForDate(dateJST: Date): Promise<boolean> {
  const start = new Date(dateJST)
  start.setHours(0 - 9, 0, 0, 0)
  const end = new Date(dateJST)
  end.setHours(23 - 9, 59, 59, 999)
  const count = await prisma.post.count({
    where: { scheduledAt: { gte: start, lte: end } },
  })
  return count >= 2
}

// 直近 N 件の使用テーマキーを取得（重複回避）
async function getRecentThemeKeys(n = 9): Promise<string[]> {
  const posts = await prisma.post.findMany({
    orderBy: { createdAt: 'desc' },
    take: n,
    select: { theme: true },
  })
  return posts.map((p) => p.theme)
}

async function generateDailyContent(targetDateJST: Date): Promise<void> {
  console.log(`[generator] Generating content for ${targetDateJST.toDateString()} JST...`)

  if (await hasPostsForDate(targetDateJST)) {
    console.log('[generator] Content already exists for this date. Skipping.')
    return
  }

  const usedThemeKeys = await getRecentThemeKeys()

  for (const slot of SLOTS) {
    try {
      console.log(`[generator] Generating ${slot} post...`)
      const content = await generateForSlot(slot, usedThemeKeys)
      usedThemeKeys.push(content.theme.key) // 同日内での重複も防ぐ

      await prisma.post.create({
        data: {
          slot,
          scheduledAt: getScheduledAt(slot, targetDateJST),
          theme: content.theme.key,
          themeName: content.theme.name,
          imagePrompt: content.imagePrompt,
          tweetText: content.tweetText,
          japaneseTranslation: content.japaneseTranslation,
          status: 'draft',
        },
      })
      console.log(`[generator] ✓ ${slot} (${content.theme.name})`)
    } catch (err) {
      console.error(`[generator] ✗ Failed to generate ${slot} post:`, err)
    }
  }

  console.log('[generator] Done.')
}

async function runLoop(): Promise<void> {
  console.log('[generator] Started. Will generate content daily at 06:00 JST.')

  // 自動投稿 cron を起動
  startPostingCron()

  // 初回起動時に今日分がなければ生成
  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000)
  await generateDailyContent(nowJST)

  // 毎日 06:00 JST (21:00 UTC 前日) にチェック
  const CHECK_INTERVAL_MS = 60 * 60 * 1000 // 1時間ごとにチェック

  setInterval(async () => {
    const now = new Date(Date.now() + 9 * 60 * 60 * 1000) // JST
    if (now.getHours() === 6 && now.getMinutes() < 5) {
      // 翌日分を生成
      const tomorrow = new Date(now)
      tomorrow.setDate(tomorrow.getDate() + 1)
      await generateDailyContent(tomorrow)
    }
  }, CHECK_INTERVAL_MS)
}

runLoop().catch((e) => {
  console.error('[generator] Fatal error:', e)
  process.exit(1)
})
