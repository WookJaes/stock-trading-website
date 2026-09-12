export type NotificationPreferences = {
  login: boolean;
  buyFilled: boolean;
  sellFilled: boolean;
};

export const defaultNotificationPreferences: NotificationPreferences = {
  login: true,
  buyFilled: true,
  sellFilled: true,
};

export const notificationPreferencesCookie = {
  name: 'telegram_notification_preferences',
  maxAge: 365 * 24 * 60 * 60,
  options: {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  },
};

export function parseNotificationPreferences(
  value: string | undefined,
): NotificationPreferences {
  if (!value) return { ...defaultNotificationPreferences };
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Record<
      string,
      unknown
    >;
    return {
      login: typeof parsed.login === 'boolean' ? parsed.login : true,
      buyFilled:
        typeof parsed.buyFilled === 'boolean' ? parsed.buyFilled : true,
      sellFilled:
        typeof parsed.sellFilled === 'boolean' ? parsed.sellFilled : true,
    };
  } catch {
    return { ...defaultNotificationPreferences };
  }
}

export function serializeNotificationPreferences(
  preferences: NotificationPreferences,
) {
  return encodeURIComponent(JSON.stringify(preferences));
}

export function isNotificationPreferences(
  value: unknown,
): value is NotificationPreferences {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.login === 'boolean' &&
    typeof candidate.buyFilled === 'boolean' &&
    typeof candidate.sellFilled === 'boolean'
  );
}
