import type { NotificationPreferences } from '@/lib/notification-preferences';

export type TelegramNotification =
  | { type: 'login'; occurredAt?: Date }
  | {
      type: 'buyFilled' | 'sellFilled';
      environment: string;
      code: string;
      market: string;
      orderNo: string;
      quantity: number;
      price: number;
      occurredAt?: Date;
    };

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date);
}

function environmentLabel(environment: string) {
  return environment === 'domestic-mock'
    ? '국내 모의투자'
    : environment === 'overseas-mock'
      ? '해외 모의투자'
      : environment === 'domestic-live'
        ? '국내 실투자'
        : environment === 'overseas-live'
          ? '해외 실투자'
          : environment;
}

export function formatTelegramNotification(notification: TelegramNotification) {
  const occurredAt = formatDate(notification.occurredAt ?? new Date());
  if (notification.type === 'login') {
    return `🔐 Portfolio Desk 로그인\n시간: ${occurredAt}`;
  }

  const side = notification.type === 'buyFilled' ? '매수' : '매도';
  const currency = notification.environment.startsWith('overseas-')
    ? 'USD'
    : 'KRW';
  return [
    `${notification.type === 'buyFilled' ? '🔴' : '🔵'} ${side} 체결 완료`,
    `환경: ${environmentLabel(notification.environment)}`,
    `종목: ${notification.code} · ${notification.market}`,
    `체결수량: ${notification.quantity}주`,
    `체결가: ${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: currency === 'USD' ? 4 : 0 }).format(notification.price)} ${currency}`,
    `주문번호: ${notification.orderNo}`,
    `시간: ${occurredAt}`,
  ].join('\n');
}

export function notificationEnabled(
  preferences: NotificationPreferences,
  type: TelegramNotification['type'],
) {
  return preferences[type];
}

export async function sendTelegramNotification(
  notification: TelegramNotification,
  preferences: NotificationPreferences,
  fetcher: typeof fetch = fetch,
) {
  if (!notificationEnabled(preferences, notification.type))
    return { sent: false, reason: 'disabled' as const };
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId)
    return { sent: false, reason: 'not-configured' as const };

  try {
    const response = await fetcher(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: formatTelegramNotification(notification),
        }),
        cache: 'no-store',
      },
    );
    if (!response.ok) return { sent: false, reason: 'request-failed' as const };
    const body = (await response.json()) as { ok?: boolean };
    return body.ok
      ? { sent: true as const }
      : { sent: false, reason: 'request-failed' as const };
  } catch {
    return { sent: false, reason: 'request-failed' as const };
  }
}
