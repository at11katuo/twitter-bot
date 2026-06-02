import { NextRequest, NextResponse } from 'next/server'

const COOKIE_NAME = 'hana_auth'

function expectedToken(): string {
  const user = (process.env.DASHBOARD_BASIC_USER ?? 'admin').trim()
  const pass = (process.env.DASHBOARD_BASIC_PASS ?? 'changeme').trim()
  return Buffer.from(`${user}:${pass}`).toString('base64')
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (pathname === '/login' || pathname.startsWith('/api/auth/')) {
    return NextResponse.next()
  }

  const token = req.cookies.get(COOKIE_NAME)?.value
  if (token === expectedToken()) {
    return NextResponse.next()
  }

  const loginUrl = req.nextUrl.clone()
  loginUrl.pathname = '/login'
  loginUrl.search = ''
  return NextResponse.redirect(loginUrl)
}

export const config = { matcher: ['/((?!_next|favicon.ico|icons).*)'] }
