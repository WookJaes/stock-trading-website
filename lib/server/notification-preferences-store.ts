import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  defaultNotificationPreferences,
  isNotificationPreferences,
  type NotificationPreferences,
} from '../notification-preferences.ts';
import { strategyDataPath } from './data-path.ts';

const filePath = () => strategyDataPath('notification-preferences.json');
let queue = Promise.resolve();

export async function readStoredNotificationPreferences(): Promise<NotificationPreferences> {
  try {
    const parsed = JSON.parse(await readFile(filePath(), 'utf8')) as unknown;
    return isNotificationPreferences(parsed)
      ? parsed
      : { ...defaultNotificationPreferences };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return { ...defaultNotificationPreferences };
    return { ...defaultNotificationPreferences };
  }
}

export async function writeStoredNotificationPreferences(
  preferences: NotificationPreferences,
) {
  if (!isNotificationPreferences(preferences))
    throw new Error('INVALID_NOTIFICATION_PREFERENCES');
  queue = queue.then(async () => {
    const path = filePath();
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(preferences, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(temporary, path);
  });
  await queue;
  return preferences;
}
