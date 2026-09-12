import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultNotificationPreferences,
  isNotificationPreferences,
  parseNotificationPreferences,
  serializeNotificationPreferences,
} from '../lib/notification-preferences.ts';

await test('알림 설정을 쿠키 값으로 직렬화하고 복원한다', () => {
  const preferences = { login: false, buyFilled: true, sellFilled: false };
  assert.deepEqual(
    parseNotificationPreferences(serializeNotificationPreferences(preferences)),
    preferences,
  );
});

await test('없거나 잘못된 쿠키는 모든 알림이 켜진 기본값을 사용한다', () => {
  assert.deepEqual(
    parseNotificationPreferences(undefined),
    defaultNotificationPreferences,
  );
  assert.deepEqual(
    parseNotificationPreferences('%invalid'),
    defaultNotificationPreferences,
  );
});

await test('세 가지 알림의 boolean 값만 허용한다', () => {
  assert.equal(
    isNotificationPreferences({
      login: true,
      buyFilled: false,
      sellFilled: true,
    }),
    true,
  );
  assert.equal(
    isNotificationPreferences({ login: true, buyFilled: false }),
    false,
  );
  assert.equal(
    isNotificationPreferences({
      login: true,
      buyFilled: 'yes',
      sellFilled: true,
    }),
    false,
  );
});
