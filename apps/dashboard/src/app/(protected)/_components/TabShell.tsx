'use client'
import { useState } from 'react'
import ReplyDraftPanel from './ReplyDraftPanel'

type Tab = 'posts' | 'reply'

const TABS: [Tab, string][] = [
  ['posts', '📋 投稿管理'],
  ['reply', '💬 リプライ下書き'],
]

export default function TabShell({ postsPanel }: { postsPanel: React.ReactNode }) {
  const [tab, setTab] = useState<Tab>('posts')

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-xl bg-slate-800/60 p-1">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              tab === id
                ? 'bg-pink-900/60 text-pink-200'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'posts' ? postsPanel : <ReplyDraftPanel />}
    </div>
  )
}
