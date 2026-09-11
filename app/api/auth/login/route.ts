import { NextRequest, NextResponse } from 'next/server';
import { authCookie, createSession, verifyPassword } from '@/lib/auth';
import { clearLoginFailures, loginLimit, recordLoginFailure } from '@/lib/login-rate-limit';

function clientKey(request: NextRequest) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}

export async function POST(request: NextRequest) {
  const key = clientKey(request);
  const limit = loginLimit(key);
  if (limit.blocked) {
    return NextResponse.json({ message: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
  }

  if (!process.env.PASSWORD) return NextResponse.json({ message: '서버 인증 설정이 완료되지 않았습니다.' }, { status: 503 });

  let password = '';
  try {
    const body = await request.json() as { password?: unknown };
    password = typeof body.password === 'string' ? body.password : '';
  } catch {
    return NextResponse.json({ message: '올바른 요청이 아닙니다.' }, { status: 400 });
  }

  if (!await verifyPassword(password)) {
    const nextLimit = recordLoginFailure(key);
    return NextResponse.json(
      { message: nextLimit.blocked ? '로그인 시도가 너무 많습니다. 15분 후 다시 시도해 주세요.' : '비밀번호가 올바르지 않습니다.' },
      { status: nextLimit.blocked ? 429 : 401, headers: nextLimit.blocked ? { 'Retry-After': String(nextLimit.retryAfterSeconds) } : undefined },
    );
  }

  clearLoginFailures(key);
  const response = NextResponse.json({ success: true });
  response.cookies.set(authCookie.name, await createSession(), { ...authCookie.options, maxAge: authCookie.maxAge });
  return response;
}
