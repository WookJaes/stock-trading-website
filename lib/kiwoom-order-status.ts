import { isDomestic, type KiwoomEnvironment as Environment } from './kiwoom-environment.ts';

export type TrackedOrder = {
  environment: Environment;
  side: 'buy' | 'sell';
  code: string;
  market: string;
  orderNo: string;
  orderDate?: string;
};

export type OrderStatus = {
  status: 'checking' | 'pending' | 'filled' | 'cancelled' | 'rejected';
  statusLabel: string;
  orderedQuantity?: number;
  filledQuantity?: number;
  remainingQuantity?: number;
  filledPrice?: number;
};

export type OrderStatusRequest = {
  apiId: 'kt00009' | 'ust21510';
  path: '/api/dostk/acnt' | '/api/us/acnt';
  body: Record<string, string>;
};

function text(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function number(value: unknown) {
  const parsed = Number(text(value).replaceAll(',', ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function marketCode(market: string) {
  return market === 'NASDAQ' ? 'ND' : market === 'NYSE' ? 'NY' : market === 'AMEX' ? 'NA' : '';
}

export function createOrderStatusRequest(order: TrackedOrder, orderDate: string): OrderStatusRequest {
  if (isDomestic(order.environment)) {
    return {
      apiId: 'kt00009',
      path: '/api/dostk/acnt',
      body: {
        ord_dt: order.orderDate ?? orderDate,
        stk_bond_tp: '1',
        mrkt_tp: '0',
        sell_tp: order.side === 'sell' ? '1' : '2',
        qry_tp: '1',
        stk_cd: order.code,
        fr_ord_no: '',
        dmst_stex_tp: 'KRX',
      },
    };
  }

  return {
    apiId: 'ust21510',
    path: '/api/us/acnt',
    body: {
      slby_tp: order.side === 'sell' ? '1' : '2',
      stex_tp: marketCode(order.market),
      stk_cd: order.code,
    },
  };
}

export function parseOrderStatus(order: TrackedOrder, data: Record<string, unknown>): OrderStatus {
  if (isDomestic(order.environment)) {
    const rows = Array.isArray(data.acnt_ord_cntr_prst_array) ? data.acnt_ord_cntr_prst_array as Record<string, unknown>[] : [];
    const executions = rows.filter((row) => text(row.ord_no) === order.orderNo && number(row.cntr_qty) > 0);
    if (executions.length === 0) return { status: 'checking', statusLabel: '체결 확인 중' };

    const uniqueExecutions = [...new Map(executions.map((row, index) => [text(row.cntr_no) || String(index), row])).values()];
    const orderedQuantity = Math.max(...uniqueExecutions.map((row) => number(row.ord_qty)));
    const filledQuantity = uniqueExecutions.reduce((sum, row) => sum + number(row.cntr_qty), 0);
    const filledAmount = uniqueExecutions.reduce((sum, row) => sum + number(row.cntr_qty) * number(row.cntr_uv), 0);
    const remainingQuantity = Math.max(orderedQuantity - filledQuantity, 0);
    const filledPrice = filledQuantity > 0 ? filledAmount / filledQuantity : 0;
    const status = orderedQuantity > 0 && filledQuantity >= orderedQuantity ? 'filled' : 'pending';
    return { status, statusLabel: status === 'filled' ? '체결 완료' : '부분 체결', orderedQuantity, filledQuantity, remainingQuantity, filledPrice };
  }

  // ust21510 명세의 응답 필드는 result_list이며, 공식 예시는 result_lsit로 표기되어 두 표기를 모두 처리한다.
  const rawRows = Array.isArray(data.result_list) ? data.result_list : Array.isArray(data.result_lsit) ? data.result_lsit : [];
  const rows = rawRows as Record<string, unknown>[];
  const row = rows.find((item) => text(item.ord_no) === order.orderNo);
  if (!row) return { status: 'checking', statusLabel: '체결 확인 중' };

  const orderedQuantity = number(row.ord_qty);
  const filledQuantity = number(row.cntr_qty);
  const remainingQuantity = number(row.ord_remnq);
  const statusName = text(row.ord_stat);
  const status = statusName === '체결완료' && orderedQuantity > 0 && remainingQuantity === 0 && filledQuantity >= orderedQuantity
    ? 'filled'
    : statusName === '취소완료'
      ? 'cancelled'
      : statusName === '무효주문'
        ? 'rejected'
        : 'pending';
  return { status, statusLabel: statusName || '체결 확인 중', orderedQuantity, filledQuantity, remainingQuantity, filledPrice: number(row.cntr_uv) };
}
