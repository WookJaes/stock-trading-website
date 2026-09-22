import { NextRequest, NextResponse } from 'next/server';
import {
  isNotificationPreferences,
  notificationPreferencesCookie,
  parseNotificationPreferences,
  serializeNotificationPreferences,
} from '@/lib/notification-preferences';
import {
  readStoredNotificationPreferences,
  writeStoredNotificationPreferences,
} from '@/lib/server/notification-preferences-store';

export async function GET(request: NextRequest) {
  const stored = await readStoredNotificationPreferences();
  const legacy = request.cookies.get(notificationPreferencesCookie.name)?.value;
  const preferences = legacy ? parseNotificationPreferences(legacy) : stored;
  if (legacy) await writeStoredNotificationPreferences(preferences);
  return NextResponse.json({
    preferences,
    configured: Boolean(
      process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID,
    ),
  });
}

export async function PUT(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: '올바른 요청이 아닙니다.' },
      { status: 400 },
    );
  }
  if (!isNotificationPreferences(body)) {
    return NextResponse.json(
      { message: '알림 설정을 다시 확인해 주세요.' },
      { status: 400 },
    );
  }

  await writeStoredNotificationPreferences(body);

  const response = NextResponse.json({ preferences: body, success: true });
  response.cookies.set(
    notificationPreferencesCookie.name,
    serializeNotificationPreferences(body),
    {
      ...notificationPreferencesCookie.options,
      maxAge: notificationPreferencesCookie.maxAge,
    },
  );
  return response;
}
