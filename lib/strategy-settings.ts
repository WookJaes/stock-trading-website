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

export type StrategySettings = {
  version: 1;
  strategies: {
    slTp: Record<StrategyMarket, SlTpMarketSettings>;
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
    return {
      version: 1,
      strategies: {
        ...value.strategies,
        slTp: { domestic, overseas },
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
