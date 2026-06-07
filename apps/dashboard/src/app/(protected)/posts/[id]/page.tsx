import { prisma } from '@hana/db'
import { notFound } from 'next/navigation'
import PostDetailClient from './_client'

export const dynamic = 'force-dynamic'

export default async function PostDetailPage({ params }: { params: { id: string } }) {
  const post = await prisma.post.findUnique({ where: { id: params.id } })
  if (!post) notFound()

  return (
    <PostDetailClient
      initialPost={{
        id:                 post.id,
        slot:               post.slot,
        scheduledAt:        post.scheduledAt.toISOString(),
        themeName:          post.themeName,
        imagePrompt:        post.imagePrompt,
        tweetText:          post.tweetText,
        japaneseTranslation: post.japaneseTranslation,
        imagePath:          post.imagePath,
        mediaType:          post.mediaType,
        status:             post.status,
        tweetId:            post.tweetId,
        postedAt:           post.postedAt?.toISOString() ?? null,
      }}
    />
  )
}
