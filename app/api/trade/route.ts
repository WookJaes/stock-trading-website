import { NextRequest, NextResponse } from 'next/server';
import { isDomestic, isKiwoomEnvironment, isLive, kiwoomCredentials, kiwoomDomain, type KiwoomEnvironment as Environment } from '@/lib/kiwoom-environment';
import { notificationPreferencesCookie, parseNotificationPreferences } from '@/lib/notification-preferences';
import { sendTelegramNotification } from '@/lib/telegram';

type KiwoomResponse = Record<string, unknown> & { return_code?: number; token?: string; return_msg?: string };
const tokenCache = new Map<Environment, { value: string; expiresAt: number }>();
const orders = new Map<string, { response: unknown; expiresAt: number }>();
const notifiedFills = new Map<string, number>();

function text(value: unknown) { return typeof value === 'string' || typeof value === 'number' ? String(value) : ''; }
function number(value: unknown) { const parsed = Number(text(value).replaceAll(',', '')); return Number.isFinite(parsed) ? parsed : 0; }
async function getToken(environment: Environment) {
  const cached = tokenCache.get(environment);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const { appKey, appSecret } = kiwoomCredentials(environment);
  const response = await fetch(`${kiwoomDomain(environment)}/oauth2/token`, { method: 'POST', headers: { 'Content-Type': 'application/json;charset=UTF-8' }, body: JSON.stringify({ grant_type: 'client_credentials', appkey: appKey, secretkey: appSecret }), cache: 'no-store' });
  const data = await response.json() as KiwoomResponse;
  if (!response.ok || data.return_code !== 0 || !data.token) throw new Error('AUTHENTICATION_FAILED');
  tokenCache.set(environment, { value: data.token, expiresAt: Date.now() + 23 * 60 * 60 * 1000 });
  return data.token;
}
async function call(environment: Environment, token: string, apiId: string, path: string, body: Record<string, string>) {
  const response = await fetch(`${kiwoomDomain(environment)}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json;charset=UTF-8', 'api-id': apiId, authorization: `Bearer ${token}` }, body: JSON.stringify(body), cache: 'no-store' });
  const data = await response.json() as KiwoomResponse;
  if (!response.ok || data.return_code !== 0) throw new Error(text(data.return_msg) || 'UPSTREAM_FAILED');
  return data;
}
function environment(value: string | null): Environment | null { return isKiwoomEnvironment(value) ? value : null; }
function kstDate() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}${get('month')}${get('day')}`;
}
function marketCode(market: string) { return market === 'NASDAQ' ? 'ND' : market === 'NYSE' ? 'NY' : market === 'AMEX' ? 'NA' : ''; }
async function notifyFilled(request: NextRequest, details: { environment: Environment; side: 'buy' | 'sell'; code: string; market: string; orderNo: string; quantity: number; price: number }) {
  const key = `${details.environment}:${details.side}:${details.orderNo}`;
  const now = Date.now();
  for (const [storedKey, expiresAt] of notifiedFills) if (expiresAt <= now) notifiedFills.delete(storedKey);
  if (notifiedFills.has(key)) return;
  notifiedFills.set(key, now + 24 * 60 * 60_000);
  const result = await sendTelegramNotification({ type: details.side === 'buy' ? 'buyFilled' : 'sellFilled', environment: details.environment, code: details.code, market: details.market, orderNo: details.orderNo, quantity: details.quantity, price: details.price }, parseNotificationPreferences(request.cookies.get(notificationPreferencesCookie.name)?.value));
  if (!result.sent && result.reason !== 'disabled') notifiedFills.delete(key);
}

export async function GET(request: NextRequest) {
  const env = environment(request.nextUrl.searchParams.get('environment'));
  const action = request.nextUrl.searchParams.get('action');
  const code = request.nextUrl.searchParams.get('code')?.trim() ?? '';
  const market = request.nextUrl.searchParams.get('market')?.trim() ?? '';
  if (!env || !code) return NextResponse.json({ message: '잘못된 요청입니다.' }, { status: 400 });
  if (action === 'status' && isLive(env)) return NextResponse.json({ message: '실투자 주문 조회는 비활성화되어 있습니다.' }, { status: 403 });
  try {
    const token = await getToken(env);
    if (action === 'detail') {
      if (isDomestic(env)) {
        const data = await call(env, token, 'ka10001', '/api/dostk/stkinfo', { stk_cd: code });
        const tradable = !isLive(env) && market !== 'NXT';
        return NextResponse.json({ code: text(data.stk_cd), name: text(data.stk_nm), market, currency: 'KRW', currentPrice: Math.abs(number(data.cur_prc)), change: number(data.pred_pre), changeRate: number(data.flu_rt), volume: number(data.trde_qty), high52: Math.abs(number(data['250hgst'])), low52: Math.abs(number(data['250lwst'])), status: text(data.state), warning: text(data.auditInfo), tradable, unavailableReason: isLive(env) ? '실투자 매수·매도는 안전을 위해 비활성화되어 있습니다.' : market === 'NXT' ? '국내 모의투자는 NXT 주문을 지원하지 않습니다.' : undefined });
      }
      const stex_tp = marketCode(market);
      if (!stex_tp) return NextResponse.json({ message: '해외 모의투자가 지원하지 않는 거래소입니다.' }, { status: 400 });
      const data = await call(env, token, 'usa20100', '/api/us/mrkcond', { stex_tp, stk_cd: code });
      return NextResponse.json({ code: text(data.stk_cd), name: text(data.stk_nm), englishName: text(data.stk_enm), market, currency: 'USD', currentPrice: Math.abs(number(data.cur_prc)), change: number(data.pred_pre), changeRate: number(data.flu_rt), volume: number(data.acc_trde_qty), high52: Math.abs(number(data['52wk_hgst_pric'])), low52: Math.abs(number(data['52wk_lwst_pric'])), tradable: !isLive(env), unavailableReason: isLive(env) ? '실투자 매수·매도는 안전을 위해 비활성화되어 있습니다.' : undefined });
    }
    if (action === 'status') {
      const orderNo = request.nextUrl.searchParams.get('orderNo')?.trim() ?? '';
      const side = request.nextUrl.searchParams.get('side') === 'sell' ? 'sell' : 'buy';
      if (!orderNo) return NextResponse.json({ message: '주문번호가 필요합니다.' }, { status: 400 });
      if (isDomestic(env)) {
        const data = await call(env, token, 'kt00007', '/api/dostk/acnt', { ord_dt: kstDate(), qry_tp: '1', stk_bond_tp: '1', sell_tp: side === 'sell' ? '1' : '2', stk_cd: code, fr_ord_no: '', dmst_stex_tp: 'KRX' });
        const rows = Array.isArray(data.acnt_ord_cntr_prps_dtl) ? data.acnt_ord_cntr_prps_dtl as Record<string, unknown>[] : [];
        const row = rows.find((item) => text(item.ord_no) === orderNo);
        if (!row) return NextResponse.json({ status: 'checking', statusLabel: '체결 확인 중' });
        const orderedQuantity = number(row.ord_qty);
        const filledQuantity = number(row.cntr_qty);
        const remainingQuantity = number(row.ord_remnq);
        const status = orderedQuantity > 0 && remainingQuantity === 0 && filledQuantity >= orderedQuantity ? 'filled' : 'pending';
        const result = { status, statusLabel: status === 'filled' ? '체결 완료' : '미체결', orderedQuantity, filledQuantity, remainingQuantity, filledPrice: number(row.cntr_uv) };
        if (status === 'filled') await notifyFilled(request, { environment: env, side, code, market, orderNo, quantity: result.filledQuantity, price: result.filledPrice });
        return NextResponse.json(result);
      }
      const stex_tp = marketCode(market);
      const data = await call(env, token, 'ust21150', '/api/us/acnt', { ord_dt: '', query_tp: '1', slby_tp: side === 'sell' ? '1' : '2', stex_tp, stk_cd: code, oppo_trde_tp: '0', fr_ord_no: '' });
      const rows = Array.isArray(data.result_list) ? data.result_list as Record<string, unknown>[] : [];
      const row = rows.find((item) => text(item.ord_no) === orderNo);
      if (!row) return NextResponse.json({ status: 'checking', statusLabel: '체결 확인 중' });
      const orderedQuantity = number(row.ord_qty);
      const filledQuantity = number(row.cntr_qty);
      const remainingQuantity = number(row.ord_remnq);
      const status = text(row.ord_stat_nm) === '체결완료' && orderedQuantity > 0 && remainingQuantity === 0 && filledQuantity >= orderedQuantity ? 'filled' : 'pending';
      const result = { status, statusLabel: text(row.ord_stat_nm), orderedQuantity, filledQuantity, remainingQuantity, filledPrice: number(row.cntr_uv), rejectedReason: text(row.text1) };
      if (status === 'filled') await notifyFilled(request, { environment: env, side, code, market, orderNo, quantity: result.filledQuantity, price: result.filledPrice });
      return NextResponse.json(result);
    }
    return NextResponse.json({ message: '지원하지 않는 요청입니다.' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error && !['AUTHENTICATION_FAILED', 'MISSING_CREDENTIALS'].includes(error.message) ? error.message : '키움 API 요청에 실패했습니다.' }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json() as Record<string, unknown>;
  const env = environment(text(body.environment));
  const code = text(body.code).trim();
  const market = text(body.market).trim();
  const orderType = text(body.orderType);
  const side = text(body.side) === 'sell' ? 'sell' : 'buy';
  const quantity = number(body.quantity);
  const price = number(body.price);
  const idempotencyKey = text(body.idempotencyKey);
  if (env && isLive(env)) return NextResponse.json({ message: '실투자 매수·매도 주문은 비활성화되어 있습니다.' }, { status: 403 });
  if (!env || !code || !idempotencyKey || !Number.isInteger(quantity) || quantity < 1 || !['market', 'limit'].includes(orderType) || (orderType === 'limit' && price <= 0)) return NextResponse.json({ message: '주문 항목을 다시 확인해 주세요.' }, { status: 400 });
  const existing = orders.get(idempotencyKey);
  if (existing && existing.expiresAt > Date.now()) return NextResponse.json(existing.response);
  try {
    const token = await getToken(env);
    let result: KiwoomResponse;
    if (isDomestic(env)) {
      if (market === 'NXT') return NextResponse.json({ message: '국내 모의투자는 NXT 주문을 지원하지 않습니다.' }, { status: 400 });
      if (side === 'sell') {
        const balance = await call(env, token, 'kt00018', '/api/dostk/acnt', { qry_tp: '2', dmst_stex_tp: 'KRX' });
        const rows = Array.isArray(balance.acnt_evlt_remn_indv_tot) ? balance.acnt_evlt_remn_indv_tot as Record<string, unknown>[] : [];
        const holding = rows.find((row) => text(row.stk_cd).replace(/^[AJQ]/, '') === code);
        const availableQuantity = number(holding?.trde_able_qty);
        if (quantity > availableQuantity) return NextResponse.json({ message: `주문 직전 매도 가능 수량은 ${availableQuantity}주입니다.`, availableQuantity }, { status: 409 });
      }
      result = await call(env, token, side === 'sell' ? 'kt10001' : 'kt10000', '/api/dostk/ordr', { dmst_stex_tp: 'KRX', stk_cd: code, ord_qty: String(quantity), ord_uv: orderType === 'limit' ? String(price) : '', trde_tp: orderType === 'limit' ? '0' : '3', cond_uv: '' });
    } else {
      const stex_tp = marketCode(market);
      if (!stex_tp) return NextResponse.json({ message: '해외 모의투자가 지원하지 않는 거래소입니다.' }, { status: 400 });
      if (side === 'sell') {
        const balance = await call(env, token, 'ust21070', '/api/us/acnt', { stex_tp, stk_cd: code });
        const rows = Array.isArray(balance.result_list) ? balance.result_list as Record<string, unknown>[] : [];
        const holding = rows.find((row) => text(row.stk_cd) === code);
        const availableQuantity = number(holding?.sell_alowq);
        if (quantity > availableQuantity) return NextResponse.json({ message: `주문 직전 매도 가능 수량은 ${availableQuantity}주입니다.`, availableQuantity }, { status: 409 });
      }
      result = await call(env, token, side === 'sell' ? 'ust20001' : 'ust20000', '/api/us/ordr', { stex_tp, stk_cd: code, ord_qty: String(quantity), ord_uv: orderType === 'limit' ? String(price) : '', ...(side === 'sell' ? { stop_pric: '' } : {}), trde_tp: orderType === 'limit' ? '00' : '03' });
    }
    const response = { success: true, orderNo: text(result.ord_no), message: `모의투자 ${side === 'sell' ? '매도' : '매수'} 주문이 접수되었습니다.` };
    orders.set(idempotencyKey, { response, expiresAt: Date.now() + 10 * 60_000 });
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error && !['AUTHENTICATION_FAILED', 'MISSING_CREDENTIALS'].includes(error.message) ? error.message : '모의투자 주문 접수에 실패했습니다.' }, { status: 502 });
  }
}
