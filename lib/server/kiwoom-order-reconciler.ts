import {
  createOrderStatusRequest,
  parseOrderStatus,
  type OrderStatus,
} from '../kiwoom-order-status.ts';
import {
  kiwoomNumber,
  kiwoomText,
  overseasMarketCode,
  requestKiwoom,
  requestKiwoomPages,
} from './kiwoom-client.ts';
import { fetchOpenOrders } from './kiwoom-portfolio.ts';
import type { SellIntent } from './strategy-runtime.ts';

function kstDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}${get('month')}${get('day')}`;
}

function rows(payload: Record<string, unknown>, key: string) {
  return Array.isArray(payload[key])
    ? (payload[key] as Record<string, unknown>[])
    : [];
}

function timeSeconds(value: string) {
  const digits = value.replaceAll(':', '');
  if (!/^\d{6}$/.test(digits)) return undefined;
  return Number(digits.slice(0, 2)) * 3600 + Number(digits.slice(2, 4)) * 60 + Number(digits.slice(4, 6));
}

function createdKstSeconds(timestamp: number) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return get('hour') * 3600 + get('minute') * 60 + get('second');
}

export async function findUnknownSubmittedOrder(intent: SellIntent) {
  const expectedSeconds = createdKstSeconds(intent.createdAt);
  if (intent.environment.startsWith('domestic-')) {
    const historyPages = await requestKiwoomPages(
      intent.environment,
      'kt00007',
      '/api/dostk/acnt',
      {
        ord_dt: kstDate(new Date(intent.createdAt)),
        qry_tp: '1',
        stk_bond_tp: '1',
        sell_tp: '1',
        stk_cd: intent.code,
        fr_ord_no: '',
        dmst_stex_tp: 'KRX',
      },
      'order-status',
    );
    const candidates = historyPages
      .flatMap((page) => rows(page, 'acnt_ord_cntr_prps_dtl'))
      .filter((row) => {
      const seconds = timeSeconds(kiwoomText(row.ord_tm));
      return (
        kiwoomText(row.stk_cd).replace(/^[AJQ]/, '') === intent.code &&
        kiwoomText(row.io_tp_nm).includes('매도') &&
        kiwoomText(row.comm_ord_tp).includes('REST API') &&
        kiwoomNumber(row.ord_qty) === intent.orderedQuantity &&
        seconds !== undefined &&
        Math.abs(seconds - expectedSeconds) <= 300
      );
      });
    return candidates.length === 1 ? kiwoomText(candidates[0].ord_no) : undefined;
  }

  const historyPages = await requestKiwoomPages(
    intent.environment,
    'ust21150',
    '/api/us/acnt',
    {
      ord_dt: kstDate(new Date(intent.createdAt)),
      query_tp: '1',
      slby_tp: '1',
      stex_tp: overseasMarketCode(intent.market),
      stk_cd: intent.code,
      oppo_trde_tp: '%',
      fr_ord_no: '',
    },
    'order-status',
  );
  const rawRows = historyPages.flatMap((page) =>
    Array.isArray(page.result_list)
      ? page.result_list
      : Array.isArray(page.result_lsit)
        ? page.result_lsit
        : [],
  );
  const candidates = (rawRows as Record<string, unknown>[]).filter((row) => {
    const seconds = timeSeconds(kiwoomText(row.ord_time));
    return (
      kiwoomText(row.stk_cd) === intent.code &&
      kiwoomText(row.slby_tp_nm) === '매도' &&
      (kiwoomText(row.inpt_chnl_tp).includes('REST API') ||
        kiwoomText(row.comm_ord_tp_nm).includes('REST API')) &&
      kiwoomNumber(row.ord_qty) === intent.orderedQuantity &&
      seconds !== undefined &&
      Math.abs(seconds - expectedSeconds) <= 300
    );
  });
  return candidates.length === 1 ? kiwoomText(candidates[0].ord_no) : undefined;
}

export async function reconcileBrokerOrder(intent: SellIntent): Promise<OrderStatus> {
  if (!intent.orderNo)
    return { status: 'checking', statusLabel: '주문번호 확인 필요' };
  const tracked = {
    environment: intent.environment,
    side: 'sell' as const,
    code: intent.code,
    market: intent.market,
    orderNo: intent.orderNo,
    orderDate: kstDate(new Date(intent.createdAt)),
  };
  const request = createOrderStatusRequest(tracked, kstDate());
  const { payload } = await requestKiwoom(
    intent.environment,
    request.apiId,
    request.path,
    request.body,
    undefined,
    'order-status',
  );
  const primary = parseOrderStatus(tracked, payload);
  if (primary.status !== 'checking') return primary;

  const open = (await fetchOpenOrders(
    intent.environment,
    intent.market,
    intent.code,
    'order-status',
  )).find(
    (order) => order.orderNo === intent.orderNo,
  );
  if (open)
    return {
      status: open.filledQuantity > 0 ? 'pending' : 'pending',
      statusLabel: open.filledQuantity > 0 ? '부분 체결' : '접수',
      orderedQuantity: open.orderedQuantity,
      filledQuantity: open.filledQuantity,
      remainingQuantity: open.remainingQuantity,
    };

  if (intent.environment.startsWith('domestic-')) {
    const historyPages = await requestKiwoomPages(
      intent.environment,
      'kt00007',
      '/api/dostk/acnt',
      {
        ord_dt: tracked.orderDate,
        qry_tp: '1',
        stk_bond_tp: '1',
        sell_tp: '1',
        stk_cd: intent.code,
        fr_ord_no: '',
        dmst_stex_tp: 'KRX',
      },
      'order-status',
    );
    const row = historyPages
      .flatMap((page) => rows(page, 'acnt_ord_cntr_prps_dtl'))
      .find(
      (item) => kiwoomText(item.ord_no) === intent.orderNo,
    );
    if (!row) return primary;
    const orderedQuantity = kiwoomNumber(row.ord_qty);
    const filledQuantity = kiwoomNumber(row.cntr_qty);
    const remainingQuantity = kiwoomNumber(row.ord_remnq);
    const cancelled = kiwoomText(row.mdfy_cncl).includes('취소');
    return {
      status:
        cancelled
          ? 'cancelled'
          : orderedQuantity > 0 && remainingQuantity === 0 && filledQuantity >= orderedQuantity
            ? 'filled'
            : 'pending',
      statusLabel: cancelled
        ? '취소 완료'
        : remainingQuantity === 0
          ? '체결 완료'
          : '처리 중',
      orderedQuantity,
      filledQuantity,
      remainingQuantity,
      filledPrice: kiwoomNumber(row.cntr_uv),
    };
  }

  const historyPages = await requestKiwoomPages(
    intent.environment,
    'ust21150',
    '/api/us/acnt',
    {
      ord_dt: tracked.orderDate,
      query_tp: '1',
      slby_tp: '1',
      stex_tp: overseasMarketCode(intent.market),
      stk_cd: intent.code,
      oppo_trde_tp: '%',
      fr_ord_no: '',
    },
    'order-status',
  );
  const historyRows = historyPages.flatMap((page) =>
    Array.isArray(page.result_list)
      ? page.result_list
      : Array.isArray(page.result_lsit)
        ? page.result_lsit
        : [],
  );
  const row = (historyRows as Record<string, unknown>[]).find(
    (item) => kiwoomText(item.ord_no) === intent.orderNo,
  );
  if (!row) return primary;
  const statusName = kiwoomText(row.ord_stat_nm);
  return {
    status:
      statusName === '체결완료'
        ? 'filled'
        : statusName === '취소완료'
          ? 'cancelled'
          : statusName === '무효주문'
            ? 'rejected'
            : 'pending',
    statusLabel: statusName || '처리 중',
    orderedQuantity: kiwoomNumber(row.ord_qty),
    filledQuantity: kiwoomNumber(row.cntr_qty),
    remainingQuantity: kiwoomNumber(row.ord_remnq),
    filledPrice: kiwoomNumber(row.cntr_uv),
  };
}
