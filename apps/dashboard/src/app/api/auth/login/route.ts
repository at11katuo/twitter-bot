import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME, MAX_AGE, expectedToken } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { user, pass } = body as { user?: string; pass?: string }

  const token = Buffer.from(`${user ?? ''}:${pass ?? ''}`).toString('base64')
  if (token !== expectedToken()) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MAX_AGE,
    path: '/',
  })
  return res
}
