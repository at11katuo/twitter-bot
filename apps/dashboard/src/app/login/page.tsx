'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, pass }),
      })
      if (res.ok) {
        router.replace('/')
        router.refresh()
      } else {
        setError('ユーザー名またはパスワードが違います')
      }
    } catch {
      setError('ネットワークエラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-indigo-950 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-5xl">🌸</span>
          <h1 className="mt-3 text-xl font-bold text-pink-200">Hana 花</h1>
          <p className="text-sm text-slate-400 mt-1">Twitter Dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">ユーザー名</label>
            <input
              type="text"
              autoComplete="username"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              required
              className="w-full rounded-xl bg-slate-800 border border-slate-600 text-slate-100 px-4 py-3 text-base focus:outline-none focus:border-pink-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">パスワード</label>
            <input
              type="password"
              autoComplete="current-password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              required
              className="w-full rounded-xl bg-slate-800 border border-slate-600 text-slate-100 px-4 py-3 text-base focus:outline-none focus:border-pink-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl bg-pink-600 text-white font-semibold text-base active:bg-pink-700 disabled:opacity-50 touch-manipulation"
          >
            {loading ? '認証中...' : 'ログイン'}
          </button>
        </form>
      </div>
    </div>
  )
}
