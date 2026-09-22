import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chartCandleOptions,
  defaultStrategySettings,
  isSupportedChartCandle,
  parseStrategySettings,
  readStrategySettings,
  serializeStrategySettings,
  STRATEGY_SETTINGS_STORAGE_KEY,
  validateMarketTimeRange,
  validateMovingAveragePeriods,
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

await test('차트 명세에 있는 시장별 봉 주기만 허용한다', () => {
  assert.deepEqual(
    chartCandleOptions.domestic.map((option) => option.value),
    [
      'minute:1',
      'minute:3',
      'minute:5',
      'minute:10',
      'minute:15',
      'minute:30',
      'minute:45',
      'minute:60',
      'day',
      'week',
      'month',
    ],
  );
  assert.deepEqual(
    chartCandleOptions.overseas.map((option) => option.value),
    ['minute:1', 'day', 'week', 'month'],
  );
  assert.equal(isSupportedChartCandle('domestic', 'minute:45'), true);
  assert.equal(isSupportedChartCandle('overseas', 'minute:45'), false);
});

await test('이동평균 기간은 양의 정수이며 단기가 장기보다 작아야 한다', () => {
  assert.equal(validateMovingAveragePeriods(5, 20), true);
  assert.equal(validateMovingAveragePeriods(20, 20), false);
  assert.equal(validateMovingAveragePeriods(21, 20), false);
  assert.equal(validateMovingAveragePeriods(0, 20), false);
  assert.equal(validateMovingAveragePeriods(5.5, 20), false);
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
  settings.strategies.deadCross.domestic.candle = 'minute:15';
  settings.strategies.deadCross.domestic.shortPeriod = 10;
  settings.strategies.deadCross.domestic.longPeriod = 30;
  assert.deepEqual(
    parseStrategySettings(serializeStrategySettings(settings)),
    settings,
  );
});

await test('기존 전략 설정에는 새 전략의 기본값을 추가한다', () => {
  const previousSettings = structuredClone(defaultStrategySettings);
  Reflect.deleteProperty(previousSettings.strategies, 'trailingStop');
  Reflect.deleteProperty(previousSettings.strategies, 'deadCross');
  const parsed = parseStrategySettings(JSON.stringify(previousSettings));
  assert.deepEqual(
    parsed?.strategies.trailingStop,
    defaultStrategySettings.strategies.trailingStop,
  );
  assert.deepEqual(
    parsed?.strategies.deadCross,
    defaultStrategySettings.strategies.deadCross,
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
  assert.equal(
    parseStrategySettings(
      JSON.stringify({
        ...defaultStrategySettings,
        strategies: {
          ...defaultStrategySettings.strategies,
          deadCross: {
            ...defaultStrategySettings.strategies.deadCross,
            overseas: {
              ...defaultStrategySettings.strategies.deadCross.overseas,
              candle: 'minute:5',
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
