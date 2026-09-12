import assert from 'node:assert/strict';
import test from 'node:test';
import { createOrderStatusRequest, parseOrderStatus, type TrackedOrder } from '../lib/kiwoom-order-status.ts';

const domesticOrder: TrackedOrder = { environment: 'domestic-mock', side: 'buy', code: '069500', market: 'KRX', orderNo: '0000050' };
const overseasOrder: TrackedOrder = { environment: 'overseas-mock', side: 'sell', code: 'NVDA', market: 'NASDAQ', orderNo: '000000281' };

await test('국내 체결 조회는 kt00009 공식 요청 항목을 사용한다', () => {
  assert.deepEqual(createOrderStatusRequest(domesticOrder, '20260912'), {
    apiId: 'kt00009', path: '/api/dostk/acnt', body: { ord_dt: '20260912', stk_bond_tp: '1', mrkt_tp: '0', sell_tp: '2', qry_tp: '1', stk_cd: '069500', fr_ord_no: '', dmst_stex_tp: 'KRX' },
  });
});

await test('국내 주문의 분할 체결을 합산해 전량 체결을 판정한다', () => {
  const status = parseOrderStatus(domesticOrder, { acnt_ord_cntr_prst_array: [
    { ord_no: '0000050', cntr_no: '0000001', ord_qty: '3', cntr_qty: '1', cntr_uv: '4900' },
    { ord_no: '0000050', cntr_no: '0000002', ord_qty: '3', cntr_qty: '2', cntr_uv: '5000' },
  ] });
  assert.equal(status.status, 'filled');
  assert.equal(status.filledQuantity, 3);
  assert.equal(status.filledPrice, 14900 / 3);
});

await test('미국 체결 조회는 ust21510 공식 요청과 상태 필드를 사용한다', () => {
  assert.deepEqual(createOrderStatusRequest(overseasOrder, '20260912'), { apiId: 'ust21510', path: '/api/us/acnt', body: { slby_tp: '1', stex_tp: 'ND', stk_cd: 'NVDA' } });
  const status = parseOrderStatus(overseasOrder, { result_list: [{ ord_no: '000000281', ord_qty: '5', cntr_qty: '5', ord_remnq: '0', cntr_uv: '120.5000', ord_stat: '체결완료' }] });
  assert.equal(status.status, 'filled');
  assert.equal(status.filledQuantity, 5);
  assert.equal(status.filledPrice, 120.5);
});

await test('미국 공식 예시의 result_lsit 표기도 처리하고 취소를 체결로 보지 않는다', () => {
  const status = parseOrderStatus(overseasOrder, { result_lsit: [{ ord_no: '000000281', ord_qty: '5', cntr_qty: '0', ord_remnq: '0', cntr_uv: '0', ord_stat: '취소완료' }] });
  assert.equal(status.status, 'cancelled');
});
