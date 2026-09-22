export type StrategyMarket = 'domestic' | 'overseas';

export type ExcludedStock = {
  code: string;
  name: string;
  market: string;
  englishName?: string;
};

export type SlTpMarketSettings = {
  enabled: boolean;
  startTime: string;
  endTime: string;
  takeProfitPercent: number;
  stopLossPercent: number;
  excludedStocks: ExcludedStock[];
};

export type TrailingStopMarketSettings = {
  enabled: boolean;
  startTime: string;
  endTime: string;
  activationProfitPercent: number;
  drawdownPercent: number;
  excludedStocks: ExcludedStock[];
};

export type ChartCandleId =
  | 'minute:1'
  | 'minute:3'
  | 'minute:5'
  | 'minute:10'
  | 'minute:15'
  | 'minute:30'
  | 'minute:45'
  | 'minute:60'
  | 'day'
  | 'week'
  | 'month';

export type DeadCrossMarketSettings = {
  enabled: boolean;
  startTime: string;
  endTime: string;
  candle: ChartCandleId;
  shortPeriod: number;
  longPeriod: number;
  excludedStocks: ExcludedStock[];
};

export type StrategySettings = {
  version: 1;
  strategies: {
    slTp: Record<StrategyMarket, SlTpMarketSettings>;
    trailingStop: Record<StrategyMarket, TrailingStopMarketSettings>;
    deadCross: Record<StrategyMarket, DeadCrossMarketSettings>;
    [key: string]: unknown;
  };
};

export const STRATEGY_SETTINGS_STORAGE_KEY =
  'portfolio-desk-strategy-settings-v1';

export const marketSessions = {
  domestic: {
    label: '국내',
    timeZone: 'Asia/Seoul',
    open: '09:00',
    close: '15:30',
  },
  overseas: {
    label: '해외',
    timeZone: 'America/New_York',
    open: '09:30',
    close: '16:00',
  },
} as const;

export const chartCandleOptions: Record<
  StrategyMarket,
  ReadonlyArray<{ value: ChartCandleId; label: string; apiId: string }>
> = {
  domestic: [
    { value: 'minute:1', label: '1분봉', apiId: 'ka10080' },
    { value: 'minute:3', label: '3분봉', apiId: 'ka10080' },
    { value: 'minute:5', label: '5분봉', apiId: 'ka10080' },
    { value: 'minute:10', label: '10분봉', apiId: 'ka10080' },
    { value: 'minute:15', label: '15분봉', apiId: 'ka10080' },
    { value: 'minute:30', label: '30분봉', apiId: 'ka10080' },
    { value: 'minute:45', label: '45분봉', apiId: 'ka10080' },
    { value: 'minute:60', label: '60분봉', apiId: 'ka10080' },
    { value: 'day', label: '일봉', apiId: 'ka10081' },
    { value: 'week', label: '주봉', apiId: 'ka10082' },
    { value: 'month', label: '월봉', apiId: 'ka10083' },
  ],
  overseas: [
    { value: 'minute:1', label: '1분봉', apiId: 'usa06011' },
    { value: 'day', label: '일봉', apiId: 'usa06012' },
    { value: 'week', label: '주봉', apiId: 'usa06013' },
    { value: 'month', label: '월봉', apiId: 'usa06014' },
  ],
};

export const defaultStrategySettings: StrategySettings = {
  version: 1,
  strategies: {
    slTp: {
      domestic: {
        enabled: false,
        startTime: marketSessions.domestic.open,
        endTime: marketSessions.domestic.close,
        takeProfitPercent: 5,
        stopLossPercent: 3,
        excludedStocks: [],
      },
      overseas: {
        enabled: false,
        startTime: marketSessions.overseas.open,
        endTime: marketSessions.overseas.close,
        takeProfitPercent: 5,
        stopLossPercent: 3,
        excludedStocks: [],
      },
    },
    trailingStop: {
      domestic: {
        enabled: false,
        startTime: marketSessions.domestic.open,
        endTime: marketSessions.domestic.close,
        activationProfitPercent: 5,
        drawdownPercent: 2,
        excludedStocks: [],
      },
      overseas: {
        enabled: false,
        startTime: marketSessions.overseas.open,
        endTime: marketSessions.overseas.close,
        activationProfitPercent: 5,
        drawdownPercent: 2,
        excludedStocks: [],
      },
    },
    deadCross: {
      domestic: {
        enabled: false,
        startTime: marketSessions.domestic.open,
        endTime: marketSessions.domestic.close,
        candle: 'minute:5',
        shortPeriod: 5,
        longPeriod: 20,
        excludedStocks: [],
      },
      overseas: {
        enabled: false,
        startTime: marketSessions.overseas.open,
        endTime: marketSessions.overseas.close,
        candle: 'minute:1',
        shortPeriod: 5,
        longPeriod: 20,
        excludedStocks: [],
      },
    },
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function minutes(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

export function validateMarketTimeRange(
  market: StrategyMarket,
  startTime: string,
  endTime: string,
) {
  const session = marketSessions[market];
  if (!isTime(startTime) || !isTime(endTime)) return false;
  return (
    minutes(startTime) >= minutes(session.open) &&
    minutes(endTime) <= minutes(session.close) &&
    minutes(startTime) < minutes(endTime)
  );
}

export function isSupportedChartCandle(
  market: StrategyMarket,
  value: unknown,
): value is ChartCandleId {
  return (
    typeof value === 'string' &&
    chartCandleOptions[market].some((option) => option.value === value)
  );
}

export function validateMovingAveragePeriods(
  shortPeriod: number,
  longPeriod: number,
) {
  return (
    Number.isSafeInteger(shortPeriod) &&
    Number.isSafeInteger(longPeriod) &&
    shortPeriod >= 1 &&
    longPeriod >= 2 &&
    shortPeriod < longPeriod
  );
}

function parseExcludedStocks(value: unknown): ExcludedStock[] | null {
  if (!Array.isArray(value)) return null;
  const stocks: ExcludedStock[] = [];
  const keys = new Set<string>();
  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item.code !== 'string' ||
      typeof item.name !== 'string' ||
      typeof item.market !== 'string'
    )
      return null;
    const key = `${item.market}:${item.code}`;
    if (keys.has(key)) continue;
    keys.add(key);
    stocks.push({
      code: item.code,
      name: item.name,
      market: item.market,
      ...(typeof item.englishName === 'string'
        ? { englishName: item.englishName }
        : {}),
    });
  }
  return stocks;
}

function parseMarketSettings(
  market: StrategyMarket,
  value: unknown,
): SlTpMarketSettings | null {
  if (!isRecord(value)) return null;
  const excludedStocks = parseExcludedStocks(value.excludedStocks);
  if (
    typeof value.enabled !== 'boolean' ||
    !isTime(value.startTime) ||
    !isTime(value.endTime) ||
    typeof value.takeProfitPercent !== 'number' ||
    !Number.isFinite(value.takeProfitPercent) ||
    value.takeProfitPercent <= 0 ||
    typeof value.stopLossPercent !== 'number' ||
    !Number.isFinite(value.stopLossPercent) ||
    value.stopLossPercent <= 0 ||
    !excludedStocks ||
    !validateMarketTimeRange(market, value.startTime, value.endTime)
  )
    return null;
  return {
    enabled: value.enabled,
    startTime: value.startTime,
    endTime: value.endTime,
    takeProfitPercent: value.takeProfitPercent,
    stopLossPercent: value.stopLossPercent,
    excludedStocks,
  };
}

function parseTrailingStopMarketSettings(
  market: StrategyMarket,
  value: unknown,
): TrailingStopMarketSettings | null {
  if (!isRecord(value)) return null;
  const excludedStocks = parseExcludedStocks(value.excludedStocks);
  if (
    typeof value.enabled !== 'boolean' ||
    !isTime(value.startTime) ||
    !isTime(value.endTime) ||
    typeof value.activationProfitPercent !== 'number' ||
    !Number.isFinite(value.activationProfitPercent) ||
    value.activationProfitPercent <= 0 ||
    typeof value.drawdownPercent !== 'number' ||
    !Number.isFinite(value.drawdownPercent) ||
    value.drawdownPercent <= 0 ||
    !excludedStocks ||
    !validateMarketTimeRange(market, value.startTime, value.endTime)
  )
    return null;
  return {
    enabled: value.enabled,
    startTime: value.startTime,
    endTime: value.endTime,
    activationProfitPercent: value.activationProfitPercent,
    drawdownPercent: value.drawdownPercent,
    excludedStocks,
  };
}

function parseDeadCrossMarketSettings(
  market: StrategyMarket,
  value: unknown,
): DeadCrossMarketSettings | null {
  if (!isRecord(value)) return null;
  const excludedStocks = parseExcludedStocks(value.excludedStocks);
  if (
    typeof value.enabled !== 'boolean' ||
    !isTime(value.startTime) ||
    !isTime(value.endTime) ||
    !isSupportedChartCandle(market, value.candle) ||
    typeof value.shortPeriod !== 'number' ||
    typeof value.longPeriod !== 'number' ||
    !validateMovingAveragePeriods(value.shortPeriod, value.longPeriod) ||
    !excludedStocks ||
    !validateMarketTimeRange(market, value.startTime, value.endTime)
  )
    return null;
  return {
    enabled: value.enabled,
    startTime: value.startTime,
    endTime: value.endTime,
    candle: value.candle,
    shortPeriod: value.shortPeriod,
    longPeriod: value.longPeriod,
    excludedStocks,
  };
}

export function parseStrategySettings(text: string): StrategySettings | null {
  try {
    const value = JSON.parse(text) as unknown;
    if (!isRecord(value) || value.version !== 1 || !isRecord(value.strategies))
      return null;
    const slTp = value.strategies.slTp;
    if (!isRecord(slTp)) return null;
    const domestic = parseMarketSettings('domestic', slTp.domestic);
    const overseas = parseMarketSettings('overseas', slTp.overseas);
    if (!domestic || !overseas) return null;
    const trailingStop = value.strategies.trailingStop;
    const trailingDomestic = trailingStop
      ? isRecord(trailingStop)
        ? parseTrailingStopMarketSettings('domestic', trailingStop.domestic)
        : null
      : defaultStrategySettings.strategies.trailingStop.domestic;
    const trailingOverseas = trailingStop
      ? isRecord(trailingStop)
        ? parseTrailingStopMarketSettings('overseas', trailingStop.overseas)
        : null
      : defaultStrategySettings.strategies.trailingStop.overseas;
    if (!trailingDomestic || !trailingOverseas) return null;
    const deadCross = value.strategies.deadCross;
    const deadCrossDomestic = deadCross
      ? isRecord(deadCross)
        ? parseDeadCrossMarketSettings('domestic', deadCross.domestic)
        : null
      : defaultStrategySettings.strategies.deadCross.domestic;
    const deadCrossOverseas = deadCross
      ? isRecord(deadCross)
        ? parseDeadCrossMarketSettings('overseas', deadCross.overseas)
        : null
      : defaultStrategySettings.strategies.deadCross.overseas;
    if (!deadCrossDomestic || !deadCrossOverseas) return null;
    return {
      version: 1,
      strategies: {
        ...value.strategies,
        slTp: { domestic, overseas },
        trailingStop: {
          domestic: trailingDomestic,
          overseas: trailingOverseas,
        },
        deadCross: {
          domestic: deadCrossDomestic,
          overseas: deadCrossOverseas,
        },
      },
    };
  } catch {
    return null;
  }
}

export function serializeStrategySettings(settings: StrategySettings) {
  return JSON.stringify(settings, null, 2);
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function readStrategySettings(storage: StorageLike): StrategySettings {
  const value = storage.getItem(STRATEGY_SETTINGS_STORAGE_KEY);
  return value
    ? (parseStrategySettings(value) ?? defaultStrategySettings)
    : defaultStrategySettings;
}

export function writeStrategySettings(
  storage: StorageLike,
  settings: StrategySettings,
) {
  storage.setItem(
    STRATEGY_SETTINGS_STORAGE_KEY,
    serializeStrategySettings(settings),
  );
}
