import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatTelegramNotification,
  notificationEnabled,
} from '../lib/telegram.ts';

await test('로그인 알림에는 비밀번호나 인증정보 없이 로그인 시간만 포함한다', () => {
  const message = formatTelegramNotification({
    type: 'login',
    occurredAt: new Date('2026-09-12T00:00:00Z'),
  });
  assert.match(message, /Portfolio Desk 로그인/);
  assert.doesNotMatch(message, /password|token|secret/i);
});

await test('체결 알림에 주문 정보를 표시한다', () => {
  const message = formatTelegramNotification({
    type: 'buyFilled',
    environment: 'overseas-mock',
    code: 'AAPL',
    market: 'NASDAQ',
    orderNo: '123',
    quantity: 2,
    price: 220.5,
    occurredAt: new Date('2026-09-12T00:00:00Z'),
  });
  assert.match(message, /매수 체결 완료/);
  assert.match(message, /AAPL · NASDAQ/);
  assert.match(message, /2주/);
  assert.match(message, /220.5 USD/);
});

await test('종류별 알림 설정을 적용한다', () => {
  const preferences = { login: false, buyFilled: true, sellFilled: false };
  assert.equal(notificationEnabled(preferences, 'login'), false);
  assert.equal(notificationEnabled(preferences, 'buyFilled'), true);
  assert.equal(notificationEnabled(preferences, 'sellFilled'), false);
});
