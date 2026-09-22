import {
  isDomestic,
  type KiwoomEnvironment,
} from '../kiwoom-environment.ts';
import {
  kiwoomNumber,
  kiwoomText,
  overseasMarketCode,
  overseasMarketName,
  requestKiwoom,
  requestKiwoomPages,
  type KiwoomRequestPriority,
} from './kiwoom-client.ts';
import type {
  ChartCandleId,
  StrategyMarket,
} from '../strategy-settings.ts';
import type { CompletedCandle } from '../strategy-engine.ts';

export type BrokerHolding = {
  code: string;
  name: string;
  market: string;
  quantity: number;
  availableQuantity: number;
  averagePrice: number;
  currentPrice: number;
  currency: 'KRW' | 'USD';
};

export type BrokerOpenOrder = {
  orderNo: string;
  code: string;
  market: string;
  side: 'buy' | 'sell';
  orderedQuantity: number;
  filledQuantity: number;
  remainingQuantity: number;
};

const overseasMarketCache = new Map<string, string>();

function rows(payload: Record<string, unknown>, key: string) {
  return Array.isArray(payload[key])
    ? (payload[key] as Record<string, unknown>[])
    : [];
}

export async function fetchHoldings(
  environment: KiwoomEnvironment,
  priority: KiwoomRequestPriority = 'balance',
) {
  if (isDomestic(environment)) {
    const pages = await requestKiwoomPages(
      environment,
      'kt00018',
      '/api/dostk/acnt',
      { qry_tp: '2', dmst_stex_tp: 'KRX' },
      priority,
    );
    return pages.flatMap((page) =>
      rows(page, 'acnt_evlt_remn_indv_tot')
        .map<BrokerHolding>((row) => ({
          code: kiwoomText(row.stk_cd).replace(/^[AJQ]/, ''),
          name: kiwoomText(row.stk_nm),
          market: 'KRX',
          quantity: kiwoomNumber(row.rmnd_qty),
          availableQuantity: kiwoomNumber(row.trde_able_qty),
          averagePrice: kiwoomNumber(row.pur_pric),
          currentPrice: Math.abs(kiwoomNumber(row.cur_prc)),
          currency: 'KRW',
        }))
        .filter((holding) => holding.code && holding.quantity > 0),
    );
  }

  const pages = await requestKiwoomPages(
    environment,
    'ust21070',
    '/api/us/acnt',
    { stex_tp: '', stk_cd: '' },
    priority,
  );
  const holdings = pages.flatMap((page) =>
    rows(page, 'result_list')
      .map<BrokerHolding>((row) => ({
        code: kiwoomText(row.stk_cd),
        name: kiwoomText(row.frgn_stk_nm),
        market: overseasMarketName(row.stex_nm),
        quantity: kiwoomNumber(row.poss_qty),
        availableQuantity: kiwoomNumber(row.sell_alowq),
        averagePrice: kiwoomNumber(row.frgn_stk_book_uv),
        currentPrice: kiwoomNumber(row.now_pric),
        currency: 'USD',
      }))
      .filter((holding) => holding.code && holding.quantity > 0),
  );
  for (const holding of holdings) {
    const cached = overseasMarketCache.get(holding.code);
    if (cached) {
      holding.market = cached;
      continue;
    }
    const { payload } = await requestKiwoom(
      environment,
      'usa10098',
      '/api/us/stkinfo',
      { stk_cd: holding.code },
      undefined,
      priority,
    );
    const row = rows(payload, 'list').find(
      (item) => kiwoomText(item.stk_cd) === holding.code,
    );
    const market = overseasMarketName(row?.stex_tp ?? row?.mkgb);
    holding.market = market;
    if (market !== 'US') overseasMarketCache.set(holding.code, market);
  }
  return holdings;
}

export async function fetchHolding(
  environment: KiwoomEnvironment,
  market: string,
  code: string,
  priority: KiwoomRequestPriority = 'balance',
) {
  if (isDomestic(environment)) {
    return (await fetchHoldings(environment, priority)).find(
      (holding) => holding.code === code,
    );
  }
  const stexTp = overseasMarketCode(market);
  if (!stexTp) return undefined;
  const pages = await requestKiwoomPages(
    environment,
    'ust21070',
    '/api/us/acnt',
    { stex_tp: stexTp, stk_cd: code },
    priority,
  );
  return pages
    .flatMap((page) => rows(page, 'result_list'))
    .map<BrokerHolding>((row) => ({
      code: kiwoomText(row.stk_cd),
      name: kiwoomText(row.frgn_stk_nm),
      market,
      quantity: kiwoomNumber(row.poss_qty),
      availableQuantity: kiwoomNumber(row.sell_alowq),
      averagePrice: kiwoomNumber(row.frgn_stk_book_uv),
      currentPrice: kiwoomNumber(row.now_pric),
      currency: 'USD',
    }))
    .find((holding) => holding.code === code);
}

export async function fetchOpenOrders(
  environment: KiwoomEnvironment,
  market = '',
  code = '',
  priority: KiwoomRequestPriority = 'balance',
) {
  if (isDomestic(environment)) {
    const pages = await requestKiwoomPages(
      environment,
      'ka10075',
      '/api/dostk/acnt',
      {
        all_stk_tp: code ? '1' : '0',
        trde_tp: '1',
        stk_cd: code,
        stex_tp: '0',
      },
      priority,
    );
    return pages.flatMap((page) =>
      rows(page, 'oso')
        .filter((row) => kiwoomText(row.io_tp_nm).includes('매도'))
        .map<BrokerOpenOrder>((row) => ({
          orderNo: kiwoomText(row.ord_no),
          code: kiwoomText(row.stk_cd).replace(/^[AJQ]/, ''),
          market: kiwoomText(row.stex_tp_txt) || 'KRX',
          side: 'sell',
          orderedQuantity: kiwoomNumber(row.ord_qty),
          filledQuantity: kiwoomNumber(row.cntr_qty),
          remainingQuantity: kiwoomNumber(row.oso_qty),
        })),
    );
  }

  const stexTp = market ? overseasMarketCode(market) : '';
  const pages = await requestKiwoomPages(
    environment,
    'ust21050',
    '/api/us/acnt',
    { ord_dt: '', slby_tp: '1', stex_tp: stexTp, stk_cd: code },
    priority,
  );
  return pages.flatMap((page) =>
    rows(page, 'result_list').map<BrokerOpenOrder>((row) => ({
      orderNo: kiwoomText(row.ord_no),
      code: kiwoomText(row.stk_cd),
      market: market || overseasMarketName(row.stex_nm),
      side: 'sell',
      orderedQuantity: kiwoomNumber(row.ord_qty),
      filledQuantity: kiwoomNumber(row.cntr_qty),
      remainingQuantity: kiwoomNumber(row.ord_remnq),
    })),
  );
}

export async function fetchCurrentPrice(
  environment: KiwoomEnvironment,
  market: string,
  code: string,
) {
  if (isDomestic(environment)) {
    const { payload } = await requestKiwoom(
      environment,
      'ka10001',
      '/api/dostk/stkinfo',
      { stk_cd: code },
      undefined,
      'balance',
    );
    return Math.abs(kiwoomNumber(payload.cur_prc));
  }
  const stexTp = overseasMarketCode(market);
  if (!stexTp) return 0;
  const { payload } = await requestKiwoom(
    environment,
    'usa20100',
    '/api/us/mrkcond',
    { stex_tp: stexTp, stk_cd: code },
    undefined,
    'balance',
  );
  return Math.abs(kiwoomNumber(payload.cur_prc));
}

function dateKey(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}${get('month')}${get('day')}`;
}

function chartSpec(market: StrategyMarket, candle: ChartCandleId) {
  if (market === 'domestic') {
    if (candle.startsWith('minute:'))
      return {
        apiId: 'ka10080',
        resultKey: 'stk_min_pole_chart_qry',
        dateField: 'cntr_tm',
      };
    return candle === 'day'
      ? { apiId: 'ka10081', resultKey: 'stk_dt_pole_chart_qry', dateField: 'dt' }
      : candle === 'week'
        ? { apiId: 'ka10082', resultKey: 'stk_stk_pole_chart_qry', dateField: 'dt' }
        : { apiId: 'ka10083', resultKey: 'stk_mth_pole_chart_qry', dateField: 'dt' };
  }
  if (candle === 'minute:1')
    return { apiId: 'usa06011', resultKey: 'result_list', dateField: 'cntr_tm' };
  return candle === 'day'
    ? { apiId: 'usa06012', resultKey: 'result_list', dateField: 'dt' }
    : candle === 'week'
      ? { apiId: 'usa06013', resultKey: 'result_list', dateField: 'dt' }
      : { apiId: 'usa06014', resultKey: 'result_list', dateField: 'dt' };
}

export function filterCompletedChartCandles(
  candles: CompletedCandle[],
  market: StrategyMarket,
  candle: ChartCandleId,
  now: Date,
) {
  const ordered = [...new Map(candles.map((item) => [item.key, item])).values()].sort(
    (left, right) => left.key.localeCompare(right.key),
  );
  if (ordered.length === 0) return ordered;
  const today = dateKey(
    now,
    market === 'domestic' ? 'Asia/Seoul' : 'America/New_York',
  );
  if (candle === 'day')
    return ordered.filter((item) => item.key.slice(0, 8) < today);
  if (candle === 'week') {
    const weekKey = (value: string) => {
      const year = Number(value.slice(0, 4));
      const month = Number(value.slice(4, 6)) - 1;
      const day = Number(value.slice(6, 8));
      const date = new Date(Date.UTC(year, month, day));
      const mondayOffset = (date.getUTCDay() + 6) % 7;
      date.setUTCDate(date.getUTCDate() - mondayOffset);
      return date.toISOString().slice(0, 10);
    };
    const currentWeek = weekKey(today);
    return ordered.filter((item) => weekKey(item.key) !== currentWeek);
  }
  if (candle === 'month')
    return ordered.filter((item) => item.key.slice(0, 6) !== today.slice(0, 6));
  // 분봉은 가장 최근 봉이 진행 중일 수 있으므로 최신 봉 하나를 제외한다.
  return ordered.slice(0, -1);
}

export async function fetchCompletedChartCandles(input: {
  environment: KiwoomEnvironment;
  market: string;
  strategyMarket: StrategyMarket;
  code: string;
  candle: ChartCandleId;
  required: number;
  now?: Date;
}) {
  const spec = chartSpec(input.strategyMarket, input.candle);
  const timeZone =
    input.strategyMarket === 'domestic' ? 'Asia/Seoul' : 'America/New_York';
  const baseDate = dateKey(input.now ?? new Date(), timeZone);
  const stexTp = overseasMarketCode(input.market);
  const body =
    input.strategyMarket === 'domestic'
      ? {
          stk_cd: input.code,
          ...(input.candle.startsWith('minute:')
            ? { tic_scope: input.candle.split(':')[1] }
            : {}),
          base_dt: baseDate,
          upd_stkpc_tp: '1',
        }
      : {
          stex_tp: stexTp,
          stk_cd: input.code,
          strt_dt: baseDate,
          ...(input.candle === 'minute:1' ? { tic_scope: '1' } : {}),
          upd_stkpc_tp: '1',
          exrt_appl_tp: '0',
        };
  if (input.strategyMarket === 'overseas' && !stexTp) return [];
  const collected: CompletedCandle[] = [];
  let continuation: { contYn: string; nextKey: string } | undefined;
  const seenContinuationKeys = new Set<string>();
  while (true) {
    const response = await requestKiwoom(
      input.environment,
      spec.apiId,
      input.strategyMarket === 'domestic'
        ? '/api/dostk/chart'
        : '/api/us/chart',
      body,
      continuation,
      'chart',
    );
    for (const row of rows(response.payload, spec.resultKey)) {
      const key = kiwoomText(row[spec.dateField]);
      const close = Math.abs(kiwoomNumber(row.cur_prc));
      const validKey = input.candle.startsWith('minute:')
        ? /^\d{14}$/.test(key)
        : /^\d{8}$/.test(key);
      if (validKey && close > 0) collected.push({ key, close });
    }
    const complete = filterCompletedChartCandles(
      collected,
      input.strategyMarket,
      input.candle,
      input.now ?? new Date(),
    );
    if (complete.length >= input.required) return complete.slice(-input.required);
    if (
      response.continuation.contYn.toUpperCase() !== 'Y' ||
      !response.continuation.nextKey
    )
      return complete;
    if (seenContinuationKeys.has(response.continuation.nextKey)) return complete;
    seenContinuationKeys.add(response.continuation.nextKey);
    continuation = response.continuation;
  }
}
