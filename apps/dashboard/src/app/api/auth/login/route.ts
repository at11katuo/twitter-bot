import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME, MAX_AGE, expectedToken } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { user, pass } = body as { user?: string; pass?: string }

  const expectedUser = (process.env.DASHBOARD_BASIC_USER ?? 'admin').trim()
  const expectedPass = (process.env.DASHBOARD_BASIC_PASS ?? 'changeme').trim()

  const inputUser = (user ?? '').trim()
  const inputPass = (pass ?? '').trim()

  if (inputUser !== expectedUser || inputPass !== expectedPass) {
    console.error('[auth] login failed — expected user:', JSON.stringify(expectedUser), 'got:', JSON.stringify(inputUser))
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const token = expectedToken()
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
