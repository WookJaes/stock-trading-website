import { NextRequest, NextResponse } from 'next/server';
import { parseStrategySettings } from '@/lib/strategy-settings';
import {
  readStoredStrategySettings,
  StrategySettingsConflictError,
  writeStoredStrategySettings,
} from '@/lib/server/strategy-settings-store';

export async function GET() {
  try {
    return NextResponse.json(await readStoredStrategySettings(), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json(
      { message: '전략 설정 파일을 읽지 못했습니다.' },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { message: '올바른 JSON 요청이 아닙니다.' },
      { status: 400 },
    );
  }
  const revision = Number(body.revision);
  const settings = parseStrategySettings(JSON.stringify(body.settings));
  if (!Number.isSafeInteger(revision) || revision < 0 || !settings)
    return NextResponse.json(
      { message: '전략 설정과 revision을 확인해 주세요.' },
      { status: 400 },
    );
  try {
    return NextResponse.json(
      await writeStoredStrategySettings(settings, revision),
    );
  } catch (error) {
    if (error instanceof StrategySettingsConflictError)
      return NextResponse.json(
        {
          message: '다른 화면에서 설정이 변경되었습니다. 새로고침해 주세요.',
          currentRevision: error.currentRevision,
        },
        { status: 409 },
      );
    return NextResponse.json(
      { message: '전략 설정을 저장하지 못했습니다.' },
      { status: 500 },
    );
  }
}
