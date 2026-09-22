import assert from 'node:assert/strict';
import test from 'node:test';
import { filterCompletedChartCandles } from '../lib/server/kiwoom-portfolio.ts';

void test('주봉은 현재 진행 중인 주만 제외하고 지난주 완료 봉은 유지한다', () => {
  const candles = [
    { key: '20260914', close: 100 },
    { key: '20260921', close: 90 },
  ];
  assert.deepEqual(
    filterCompletedChartCandles(
      candles,
      'overseas',
      'week',
      new Date('2026-09-22T12:00:00-04:00'),
    ),
    [{ key: '20260914', close: 100 }],
  );
  assert.deepEqual(
    filterCompletedChartCandles(
      [{ key: '20260921', close: 90 }],
      'overseas',
      'week',
      new Date('2026-09-28T08:00:00-04:00'),
    ),
    [{ key: '20260921', close: 90 }],
  );
});

void test('월봉과 일봉은 현재 진행 중인 기간을 계산에서 제외한다', () => {
  assert.deepEqual(
    filterCompletedChartCandles(
      [
        { key: '20260803', close: 100 },
        { key: '20260901', close: 90 },
      ],
      'domestic',
      'month',
      new Date('2026-09-22T12:00:00+09:00'),
    ),
    [{ key: '20260803', close: 100 }],
  );
  assert.deepEqual(
    filterCompletedChartCandles(
      [
        { key: '20260921', close: 100 },
        { key: '20260922', close: 90 },
      ],
      'domestic',
      'day',
      new Date('2026-09-22T12:00:00+09:00'),
    ),
    [{ key: '20260921', close: 100 }],
  );
});
