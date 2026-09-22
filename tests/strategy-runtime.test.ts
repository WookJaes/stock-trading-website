import assert from 'node:assert/strict';
import test from 'node:test';
import { StrategyRuntimeStore } from '../lib/server/strategy-runtime.ts';

function position(store: StrategyRuntimeStore, code = '005930') {
  return store.upsertPosition({
    environment: 'domestic-mock',
    market: 'KRX',
    code,
    quantity: 10,
    availableQuantity: 10,
    averagePrice: 70_000,
    trailingActive: false,
  });
}

void test('세 전략이 동시에 신호를 보내도 종목별 매도 의도는 하나만 생성한다', () => {
  const store = new StrategyRuntimeStore(':memory:');
  const current = position(store);
  const first = store.claimSellIntent({
    positionKey: current.positionKey,
    environment: current.environment,
    market: current.market,
    code: current.code,
    generation: current.generation,
    source: 'strategy',
    reasons: ['stop-loss'],
  });
  const second = store.claimSellIntent({
    positionKey: current.positionKey,
    environment: current.environment,
    market: current.market,
    code: current.code,
    generation: current.generation,
    source: 'strategy',
    reasons: ['trailing-stop', 'dead-cross'],
  });
  assert.equal(first.claimed, true);
  assert.equal(second.claimed, false);
  assert.equal(first.intent.id, second.intent.id);
  assert.deepEqual(store.getIntent(first.intent.id)?.reasons.sort(), [
    'dead-cross',
    'stop-loss',
    'trailing-stop',
  ]);
  store.close();
});

void test('부분체결과 안전정지는 다른 주문을 막고 사용자 재가동 후에만 해제된다', () => {
  const store = new StrategyRuntimeStore(':memory:');
  const current = position(store);
  const claim = store.claimSellIntent({
    positionKey: current.positionKey,
    environment: current.environment,
    market: current.market,
    code: current.code,
    generation: current.generation,
    source: 'manual',
    reasons: ['manual-sell'],
  });
  assert.equal(claim.claimed, true);
  store.updateIntent(claim.intent.id, {
    state: 'partial',
    orderNo: '0000001',
    orderedQuantity: 10,
    filledQuantity: 4,
    remainingQuantity: 6,
  });
  assert.equal(
    store.hasBlockingIntentForSymbol('domestic-mock', 'KRX', '005930'),
    true,
  );
  store.updateIntent(claim.intent.id, {
    state: 'needs_review',
    lastError: 'ORDER_CANCELLED',
  });
  assert.equal(store.resumeIntent(claim.intent.id), true);
  assert.equal(
    store.hasBlockingIntentForSymbol('domestic-mock', 'KRX', '005930'),
    false,
  );
  store.close();
});

void test('워커 리더 임대는 한 소유자만 획득하고 만료 뒤 인계된다', () => {
  const store = new StrategyRuntimeStore(':memory:');
  assert.equal(store.acquireLease('worker', 'one', 1000, 100), true);
  assert.equal(store.acquireLease('worker', 'two', 1000, 200), false);
  assert.equal(store.acquireLease('worker', 'two', 1000, 1200), true);
  store.close();
});

void test('체결번호 중복과 텔레그램 outbox 중복을 한 번만 저장한다', () => {
  const store = new StrategyRuntimeStore(':memory:');
  const fill = {
    environment: 'domestic-mock' as const,
    orderNo: '0000001',
    executionNo: '10',
    quantity: 1,
    price: 70_000,
  };
  assert.equal(store.recordFill(fill), true);
  assert.equal(store.recordFill(fill), false);
  assert.equal(store.enqueueNotification('sell-filled:1', { type: 'sellFilled' }), true);
  assert.equal(store.enqueueNotification('sell-filled:1', { type: 'sellFilled' }), false);
  store.close();
});

void test('서버 재시작과 무관한 영구 idempotency 키로 같은 매도 요청을 식별한다', () => {
  const store = new StrategyRuntimeStore(':memory:');
  const current = position(store);
  const first = store.claimSellIntent({
    positionKey: current.positionKey,
    environment: current.environment,
    market: current.market,
    code: current.code,
    generation: current.generation,
    source: 'manual',
    idempotencyKey: 'same-request',
    reasons: ['manual-sell'],
  });
  const second = store.claimSellIntent({
    positionKey: current.positionKey,
    environment: current.environment,
    market: current.market,
    code: current.code,
    generation: current.generation,
    source: 'manual',
    idempotencyKey: 'same-request',
    reasons: ['manual-sell'],
  });
  assert.equal(first.claimed, true);
  assert.equal(second.claimed, false);
  assert.equal(second.intent.id, first.intent.id);
  store.close();
});

void test('추가 매수로 포지션 세대가 바뀌어도 기존 종목 주문이 새 매도를 막는다', () => {
  const store = new StrategyRuntimeStore(':memory:');
  const original = position(store);
  const first = store.claimSellIntent({
    positionKey: original.positionKey,
    environment: original.environment,
    market: original.market,
    code: original.code,
    generation: original.generation,
    source: 'strategy',
    reasons: ['stop-loss'],
  });
  assert.equal(first.claimed, true);
  const increased = store.upsertPosition({
    environment: original.environment,
    market: original.market,
    code: original.code,
    quantity: 12,
    availableQuantity: 2,
    averagePrice: 69_000,
    trailingActive: false,
  });
  assert.notEqual(increased.positionKey, original.positionKey);
  const second = store.claimSellIntent({
    positionKey: increased.positionKey,
    environment: increased.environment,
    market: increased.market,
    code: increased.code,
    generation: increased.generation,
    source: 'strategy',
    reasons: ['trailing-stop'],
  });
  assert.equal(second.claimed, false);
  assert.equal(second.intent.id, first.intent.id);
  store.close();
});

void test('잔고 목록에서 사라진 외부 전량매도 종목을 찾을 수 있다', () => {
  const store = new StrategyRuntimeStore(':memory:');
  const open = position(store);
  assert.deepEqual(
    store.listLatestOpenPositions('domestic-mock').map((item) => item.positionKey),
    [open.positionKey],
  );
  store.upsertPosition({
    environment: open.environment,
    market: open.market,
    code: open.code,
    quantity: 0,
    availableQuantity: 0,
    averagePrice: open.averagePrice,
    trailingActive: false,
  });
  assert.deepEqual(store.listLatestOpenPositions('domestic-mock'), []);
  store.close();
});
