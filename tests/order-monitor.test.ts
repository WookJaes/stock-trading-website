import assert from 'node:assert/strict';
import test from 'node:test';
import { ORDER_MONITOR_DURATION_MS, ORDER_MONITOR_INTERVAL_MS, startOrderMonitor, stopOrderMonitor } from '../lib/order-monitor.ts';
import type { TrackedOrder } from '../lib/kiwoom-order-status.ts';

const order: TrackedOrder = { environment: 'domestic-mock', side: 'buy', code: '069500', market: 'KRX', orderNo: '0000123' };

await test('기본 감시 주기는 5초이고 최대 감시 시간은 24시간이다', () => {
  assert.equal(ORDER_MONITOR_INTERVAL_MS, 5_000);
  assert.equal(ORDER_MONITOR_DURATION_MS, 24 * 60 * 60_000);
});

await test('서버 감시기는 전량 체결 알림을 한 번만 실행한다', async () => {
  let checks = 0;
  let notifications = 0;
  startOrderMonitor(order, async () => {
    checks += 1;
    return checks < 2 ? { status: 'pending', statusLabel: '미체결' } : { status: 'filled', statusLabel: '체결 완료', orderedQuantity: 1, filledQuantity: 1, remainingQuantity: 0, filledPrice: 4900 };
  }, async () => { notifications += 1; }, { intervalMs: 5, durationMs: 100 });
  assert.equal(startOrderMonitor(order, async () => ({ status: 'filled', statusLabel: '체결 완료' }), async () => { notifications += 1; }, { intervalMs: 1, durationMs: 100 }), false);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(checks, 2);
  assert.equal(notifications, 1);
  stopOrderMonitor(order);
});
