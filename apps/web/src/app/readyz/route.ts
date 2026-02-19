import { NextResponse } from 'next/server';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    ok: true,
    status: 'healthy',
    service: 'web',
    checks: [],
    timestamp: new Date().toISOString()
  });
}
