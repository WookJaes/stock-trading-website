import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseKiwoomRealtimeMessage,
  RealtimeEventDeduplicator,
  SharedSubscriptionRegistry,
} from '../lib/server/kiwoom-realtime.ts';

void test('국내 시세·주문·잔고·장상태 실시간 필드를 정규화한다', () => {
  const events = parseKiwoomRealtimeMessage({
    trnm: 'REAL',
    data: [
      { type: '0B', item: '005930', values: { 10: '-70000', 20: '101500' } },
      {
        type: '00',
        item: 'A005930',
        values: { 9203: '0000001', 907: '1', 913: '체결', 900: '3', 902: '2', 909: '10', 910: '70000', 911: '1' },
      },
      { type: '04', item: 'A005930', values: { 930: '2', 931: '69000', 933: '2' } },
      { type: '0s', item: '', values: { 215: '3', 20: '090000' } },
    ],
  });
  assert.equal(events.length, 4);
  assert.deepEqual(events[0], {
    kind: 'price',
    market: 'domestic',
    code: '005930',
    price: 70_000,
    occurredAt: '101500',
  });
  assert.equal(events[1]?.kind, 'order');
  assert.equal(events[2]?.kind, 'balance');
  assert.equal(events[3]?.kind, 'market-state');
});

void test('미국 FE/F5 세션과 체결을 처리하고 중복 체결번호를 제거한다', () => {
  const events = parseKiwoomRealtimeMessage({
    trnm: 'REAL',
    data: [
      { type: 'FE', item: 'AAPL', values: { 10: '200.5', 290: '0', 51020: '101500' } },
      { type: 'F5', item: 'AAPL', values: { 9203: '000000001', 907: '01', 913: '체결완료', 900: '1', 902: '0', 909: 'E1', 910: '200.5', 911: '1', 930: '0', 931: '0' } },
    ],
  });
  assert.equal(events[0]?.kind, 'price');
  assert.equal(events[0]?.kind === 'price' && events[0].regularSession, true);
  const order = events.find((event) => event.kind === 'order')!;
  const dedupe = new RealtimeEventDeduplicator();
  assert.equal(dedupe.accept(order), true);
  assert.equal(dedupe.accept(order), false);
});

void test('공유 구독은 전략별 참조가 남아 있는 종목을 해제하지 않는다', () => {
  const registry = new SharedSubscriptionRegistry();
  registry.subscribe('sl-tp', ['005930', '000660']);
  registry.subscribe('trailing', ['005930']);
  registry.unsubscribe('sl-tp');
  assert.deepEqual(registry.keys(), ['005930']);
});

void test('가격 역순 이벤트는 막되 다음 거래일의 시간 초기화는 허용한다', () => {
  let now = new Date('2026-09-21T19:00:00-04:00');
  const dedupe = new RealtimeEventDeduplicator(() => now);
  const price = (occurredAt: string) => ({
    kind: 'price' as const,
    market: 'overseas' as const,
    code: 'NVDA',
    price: 200,
    occurredAt,
    regularSession: true,
  });
  assert.equal(dedupe.accept(price('155900')), true);
  assert.equal(dedupe.accept(price('155800')), false);
  now = new Date('2026-09-22T09:30:00-04:00');
  assert.equal(dedupe.accept(price('093000')), true);
});
