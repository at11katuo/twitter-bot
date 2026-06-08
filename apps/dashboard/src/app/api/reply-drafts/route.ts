import { NextResponse } from 'next/server'

const RESEARCH_API_URL = process.env.RESEARCH_API_URL ?? 'http://research-api:8787'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const res = await fetch(`${RESEARCH_API_URL}/reply-drafts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json(
      { ok: false, error: 'research-api に接続できません', drafts: [] },
      { status: 502 }
    )
  }
}
