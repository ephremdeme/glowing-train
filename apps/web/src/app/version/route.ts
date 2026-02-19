import { NextResponse } from 'next/server';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    service: 'web',
    releaseId: process.env.RELEASE_ID ?? 'dev',
    gitSha: process.env.GIT_SHA ?? 'local',
    deployColor: process.env.DEPLOY_COLOR ?? 'local',
    environment: process.env.ENVIRONMENT ?? process.env.NODE_ENV ?? 'development'
  });
}
