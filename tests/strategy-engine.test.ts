import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateDeadCross,
  evaluateSlTp,
  evaluateTrailingStop,
  inStrategyWindow,
  isExcludedStock,
} from '../lib/strategy-engine.ts';
import { defaultStrategySettings } from '../lib/strategy-settings.ts';

void test('SL/TP는 평균매입가 대비 손절과 익절 경계에서 한 번의 신호를 만든다', () => {
  const settings = { ...defaultStrategySettings.strategies.slTp.domestic, enabled: true };
  assert.equal(evaluateSlTp(settings, 100, 97), 'stop-loss');
  assert.equal(evaluateSlTp(settings, 100, 105), 'take-profit');
  assert.equal(evaluateSlTp(settings, 100, 101), undefined);
  assert.equal(evaluateSlTp(settings, 0, 105), undefined);
});

void test('트레일링 스탑은 활성화 후 고점을 보존하고 설정 하락률에서 신호를 만든다', () => {
  const settings = {
    ...defaultStrategySettings.strategies.trailingStop.domestic,
    enabled: true,
    activationProfitPercent: 5,
    drawdownPercent: 2,
  };
  const activated = evaluateTrailingStop(settings, 100, 106, { active: false });
  assert.deepEqual(activated, { active: true, highWaterPrice: 106 });
  const raised = evaluateTrailingStop(settings, 100, 110, activated);
  assert.deepEqual(raised, { active: true, highWaterPrice: 110 });
  assert.equal(
    evaluateTrailingStop(settings, 100, 107, raised).reason,
    'trailing-stop',
  );
});

void test('데드크로스는 완료 봉에서 단기선이 장기선을 실제 하향 돌파할 때만 발생한다', () => {
  const settings = {
    ...defaultStrategySettings.strategies.deadCross.domestic,
    enabled: true,
    shortPeriod: 2,
    longPeriod: 3,
  };
  assert.equal(
    evaluateDeadCross(settings, [
      { key: '1', close: 10 },
      { key: '2', close: 10 },
      { key: '3', close: 10 },
      { key: '4', close: 8 },
    ]),
    'dead-cross',
  );
  assert.equal(
    evaluateDeadCross(settings, [
      { key: '1', close: 10 },
      { key: '2', close: 9 },
      { key: '3', close: 8 },
      { key: '4', close: 7 },
    ]),
    undefined,
  );
});

void test('시장 시간과 제외종목을 공통 규칙으로 검사한다', () => {
  assert.equal(
    inStrategyWindow('domestic', '09:00', '15:30', new Date('2026-09-22T00:00:00Z')),
    true,
  );
  assert.equal(
    inStrategyWindow('domestic', '09:00', '15:30', new Date('2026-09-20T00:00:00Z')),
    false,
  );
  assert.equal(
    isExcludedStock(
      [{ code: '005930', name: '삼성전자', market: 'KRX' }],
      '005930',
      'KRX',
    ),
    true,
  );
});
