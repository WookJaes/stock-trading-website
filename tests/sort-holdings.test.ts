import assert from 'node:assert/strict';
import test from 'node:test';
import { sortHoldings, type HoldingSortKey } from '../lib/sort-holdings.ts';

const holdings = [
  { name: '현대차', evaluationAmount: 300, profitLoss: -10, profitRate: -2 },
  { name: '삼성전자', evaluationAmount: 100, profitLoss: 20, profitRate: 5 },
  { name: '카카오', evaluationAmount: 200, profitLoss: 0, profitRate: 1 },
];

for (const key of [
  'name',
  'evaluationAmount',
  'profitLoss',
  'profitRate',
] as HoldingSortKey[]) {
  void test(`${key} 오름차순과 내림차순으로 정렬한다`, () => {
    const ascending = sortHoldings(holdings, key, 'asc');
    const descending = sortHoldings(holdings, key, 'desc');

    assert.deepEqual(descending, [...ascending].reverse());
    assert.notStrictEqual(ascending, holdings);
  });
}

void test('값이 같으면 기존 순서를 유지한다', () => {
  const tied = holdings.map((holding) => ({ ...holding, profitRate: 0 }));
  assert.deepEqual(sortHoldings(tied, 'profitRate', 'desc'), tied);
});
