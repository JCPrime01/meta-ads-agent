import { NextRequest, NextResponse } from 'next/server';

const BACKEND = (process.env.BACKEND_URL || 'http://localhost:3002').replace(/\/$/, '');

type Ctx = { params: Promise<{ path: string[] }> };

function forwardAuth(req: NextRequest): HeadersInit {
  const auth = req.headers.get('authorization') ?? '';
  return { Authorization: auth, 'Content-Type': 'application/json' };
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  const url = `${BACKEND}/${path.join('/')}${req.nextUrl.search}`;
  const r = await fetch(url, { headers: forwardAuth(req), cache: 'no-store' });
  const data = await r.json();
  return NextResponse.json(data, { status: r.status });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  const url = `${BACKEND}/${path.join('/')}`;
  const body = await req.text();
  const r = await fetch(url, { method: 'POST', headers: forwardAuth(req), body });
  const data = await r.json();
  return NextResponse.json(data, { status: r.status });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  const url = `${BACKEND}/${path.join('/')}${req.nextUrl.search}`;
  const body = await req.text();
  const r = await fetch(url, { method: 'PATCH', headers: forwardAuth(req), body });
  const data = await r.json();
  return NextResponse.json(data, { status: r.status });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  const url = `${BACKEND}/${path.join('/')}${req.nextUrl.search}`;
  const r = await fetch(url, { method: 'DELETE', headers: forwardAuth(req) });
  const data = await r.json();
  return NextResponse.json(data, { status: r.status });
}
