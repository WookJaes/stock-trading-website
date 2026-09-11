import assert from 'node:assert/strict';
import test from 'node:test';
import { quantityForBudget } from '../lib/order-quantity.ts';

await test('예산과 주문단가로 살 수 있는 정수 수량을 계산한다', () => {
  assert.equal(quantityForBudget(100_000, 73_000), 1);
  assert.equal(quantityForBudget(500_000, 73_000), 6);
  assert.equal(quantityForBudget(1_000_000, 73_000), 13);
});

await test('USD 예산도 환율 변환 없이 입력값을 그대로 사용한다', () => {
  assert.equal(quantityForBudget(1_000, 187.5), 5);
});

await test('유효하지 않거나 1주 미만인 예산은 0을 반환한다', () => {
  assert.equal(quantityForBudget(99, 100), 0);
  assert.equal(quantityForBudget(100, 0), 0);
  assert.equal(quantityForBudget(Number.NaN, 100), 0);
});
