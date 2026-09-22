import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultStrategySettings,
  parseStrategySettings,
  readStrategySettings,
  serializeStrategySettings,
  STRATEGY_SETTINGS_STORAGE_KEY,
  validateMarketTimeRange,
  writeStrategySettings,
} from '../lib/strategy-settings.ts';

await test('국내와 해외 정규장 범위 안의 시작·종료시간만 허용한다', () => {
  assert.equal(validateMarketTimeRange('domestic', '09:00', '15:30'), true);
  assert.equal(validateMarketTimeRange('domestic', '08:59', '15:30'), false);
  assert.equal(validateMarketTimeRange('domestic', '09:00', '15:31'), false);
  assert.equal(validateMarketTimeRange('overseas', '09:30', '16:00'), true);
  assert.equal(validateMarketTimeRange('overseas', '09:29', '16:00'), false);
  assert.equal(validateMarketTimeRange('overseas', '15:00', '10:00'), false);
});

await test('전체 전략 설정을 JSON 텍스트로 내보내고 다시 가져온다', () => {
  const settings = structuredClone(defaultStrategySettings);
  settings.strategies.futureStrategy = { enabled: true };
  settings.strategies.slTp.domestic.enabled = true;
  settings.strategies.slTp.domestic.excludedStocks.push({
    code: '005930',
    name: '삼성전자',
    market: 'KOSPI',
  });
  settings.strategies.trailingStop.overseas.enabled = true;
  settings.strategies.trailingStop.overseas.activationProfitPercent = 7.5;
  assert.deepEqual(
    parseStrategySettings(serializeStrategySettings(settings)),
    settings,
  );
});

await test('기존 SL / TP 설정에는 트레일링 스탑 기본값을 추가한다', () => {
  const previousSettings = structuredClone(defaultStrategySettings);
  Reflect.deleteProperty(previousSettings.strategies, 'trailingStop');
  const parsed = parseStrategySettings(JSON.stringify(previousSettings));
  assert.deepEqual(
    parsed?.strategies.trailingStop,
    defaultStrategySettings.strategies.trailingStop,
  );
});

await test('유효하지 않은 전략 설정 JSON은 거부한다', () => {
  assert.equal(parseStrategySettings('{invalid'), null);
  assert.equal(
    parseStrategySettings(
      JSON.stringify({
        ...defaultStrategySettings,
        strategies: {
          slTp: {
            ...defaultStrategySettings.strategies.slTp,
            domestic: {
              ...defaultStrategySettings.strategies.slTp.domestic,
              startTime: '08:30',
            },
          },
        },
      }),
    ),
    null,
  );
  assert.equal(
    parseStrategySettings(
      JSON.stringify({
        ...defaultStrategySettings,
        strategies: {
          ...defaultStrategySettings.strategies,
          trailingStop: {
            ...defaultStrategySettings.strategies.trailingStop,
            overseas: {
              ...defaultStrategySettings.strategies.trailingStop.overseas,
              drawdownPercent: 0,
            },
          },
        },
      }),
    ),
    null,
  );
});

await test('브라우저 저장소에 전략 설정을 저장하고 복원한다', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
  writeStrategySettings(storage, defaultStrategySettings);
  assert.equal(values.has(STRATEGY_SETTINGS_STORAGE_KEY), true);
  assert.deepEqual(readStrategySettings(storage), defaultStrategySettings);
});
