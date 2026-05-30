import { NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const user = process.env.DASHBOARD_BASIC_USER ?? 'admin'
  const pass = process.env.DASHBOARD_BASIC_PASS ?? 'changeme'
  const expected = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64')

  if (auth !== expected) {
    return new NextResponse('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Hana Dashboard"' },
    })
  }
  return NextResponse.next()
}

export const config = { matcher: ['/((?!_next|favicon.ico).*)'] }
