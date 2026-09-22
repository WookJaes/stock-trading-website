import type {
  DeadCrossMarketSettings,
  ExcludedStock,
  SlTpMarketSettings,
  StrategyMarket,
  TrailingStopMarketSettings,
} from './strategy-settings.ts';
import { marketSessions } from './strategy-settings.ts';

export type StrategyReason =
  | 'stop-loss'
  | 'take-profit'
  | 'trailing-stop'
  | 'dead-cross';

export type CompletedCandle = {
  key: string;
  close: number;
};

export type TrailingEvaluation = {
  active: boolean;
  highWaterPrice?: number;
  reason?: 'trailing-stop';
};

function minuteOfDay(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '0';
  return Number(value('hour')) * 60 + Number(value('minute'));
}

function timeMinutes(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

export function inStrategyWindow(
  market: StrategyMarket,
  startTime: string,
  endTime: string,
  date = new Date(),
) {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: marketSessions[market].timeZone,
    weekday: 'short',
  }).format(date);
  if (weekday === 'Sat' || weekday === 'Sun') return false;
  const current = minuteOfDay(date, marketSessions[market].timeZone);
  return current >= timeMinutes(startTime) && current < timeMinutes(endTime);
}

export function isExcludedStock(
  excludedStocks: ExcludedStock[],
  code: string,
  market: string,
) {
  return excludedStocks.some(
    (stock) => stock.code === code && stock.market === market,
  );
}

export function profitPercent(currentPrice: number, averagePrice: number) {
  if (currentPrice <= 0 || averagePrice <= 0) return undefined;
  return ((currentPrice - averagePrice) / averagePrice) * 100;
}

export function evaluateSlTp(
  settings: SlTpMarketSettings,
  averagePrice: number,
  currentPrice: number,
): StrategyReason | undefined {
  if (!settings.enabled) return undefined;
  const profit = profitPercent(currentPrice, averagePrice);
  if (profit === undefined) return undefined;
  if (profit <= -settings.stopLossPercent) return 'stop-loss';
  if (profit >= settings.takeProfitPercent) return 'take-profit';
  return undefined;
}

export function evaluateTrailingStop(
  settings: TrailingStopMarketSettings,
  averagePrice: number,
  currentPrice: number,
  state: { active: boolean; highWaterPrice?: number },
): TrailingEvaluation {
  if (!settings.enabled || averagePrice <= 0 || currentPrice <= 0) return state;
  const profit = profitPercent(currentPrice, averagePrice)!;
  const active = state.active || profit >= settings.activationProfitPercent;
  if (!active) return { active: false };
  const highWaterPrice = Math.max(state.highWaterPrice ?? currentPrice, currentPrice);
  const drawdown = ((highWaterPrice - currentPrice) / highWaterPrice) * 100;
  return {
    active: true,
    highWaterPrice,
    ...(drawdown >= settings.drawdownPercent
      ? { reason: 'trailing-stop' as const }
      : {}),
  };
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function evaluateDeadCross(
  settings: DeadCrossMarketSettings,
  candles: CompletedCandle[],
) {
  if (!settings.enabled || candles.length < settings.longPeriod + 1)
    return undefined;
  const closes = candles.map((candle) => candle.close);
  if (closes.some((close) => !Number.isFinite(close) || close <= 0))
    return undefined;
  const previous = closes.slice(0, -1);
  const previousShort = average(previous.slice(-settings.shortPeriod));
  const previousLong = average(previous.slice(-settings.longPeriod));
  const currentShort = average(closes.slice(-settings.shortPeriod));
  const currentLong = average(closes.slice(-settings.longPeriod));
  return previousShort >= previousLong && currentShort < currentLong
    ? ('dead-cross' as const)
    : undefined;
}
