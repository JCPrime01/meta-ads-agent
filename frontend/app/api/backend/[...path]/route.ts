import { NextRequest, NextResponse } from 'next/server';

const BACKEND = (process.env.BACKEND_URL || 'http://localhost:3002').replace(/\/$/, '');
const SECRET = process.env.API_SECRET ?? '';

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' };
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  const url = `${BACKEND}/${path.join('/')}${req.nextUrl.search}`;
  const r = await fetch(url, { headers: authHeaders(), cache: 'no-store' });
  const data = await r.json();
  return NextResponse.json(data, { status: r.status });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  const url = `${BACKEND}/${path.join('/')}`;
  const body = await req.text();
  const r = await fetch(url, { method: 'POST', headers: authHeaders(), body });
  const data = await r.json();
  return NextResponse.json(data, { status: r.status });
}
