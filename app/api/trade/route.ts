import { NextRequest, NextResponse } from 'next/server';

type Environment = 'domestic-mock' | 'overseas-mock';
type KiwoomResponse = Record<string, unknown> & { return_code?: number; token?: string; return_msg?: string };
const MOCK_DOMAIN = 'https://mockapi.kiwoom.com';
const tokenCache = new Map<Environment, { value: string; expiresAt: number }>();
const orders = new Map<string, { response: unknown; expiresAt: number }>();

function text(value: unknown) { return typeof value === 'string' || typeof value === 'number' ? String(value) : ''; }
function number(value: unknown) { const parsed = Number(text(value).replaceAll(',', '')); return Number.isFinite(parsed) ? parsed : 0; }
function credentials(environment: Environment) {
  const domestic = environment === 'domestic-mock';
  const appKey = process.env[domestic ? 'KIS_MOCK_DOMESTIC_APP_KEY' : 'KIS_MOCK_OVERSEAS_APP_KEY'] ?? process.env[domestic ? 'KIWOOM_MOCK_DOMESTIC_APP_KEY' : 'KIWOOM_MOCK_OVERSEAS_APP_KEY'];
  const appSecret = process.env[domestic ? 'KIS_MOCK_DOMESTIC_APP_SECRET' : 'KIS_MOCK_OVERSEAS_APP_SECRET'] ?? process.env[domestic ? 'KIWOOM_MOCK_DOMESTIC_APP_SECRET' : 'KIWOOM_MOCK_OVERSEAS_APP_SECRET'];
  if (!appKey || !appSecret) throw new Error('MISSING_CREDENTIALS');
  return { appKey, appSecret };
}
async function getToken(environment: Environment) {
  const cached = tokenCache.get(environment);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const { appKey, appSecret } = credentials(environment);
  const response = await fetch(`${MOCK_DOMAIN}/oauth2/token`, { method: 'POST', headers: { 'Content-Type': 'application/json;charset=UTF-8' }, body: JSON.stringify({ grant_type: 'client_credentials', appkey: appKey, secretkey: appSecret }), cache: 'no-store' });
  const data = await response.json() as KiwoomResponse;
  if (!response.ok || data.return_code !== 0 || !data.token) throw new Error('AUTHENTICATION_FAILED');
  tokenCache.set(environment, { value: data.token, expiresAt: Date.now() + 23 * 60 * 60 * 1000 });
  return data.token;
}
async function call(token: string, apiId: string, path: string, body: Record<string, string>) {
  const response = await fetch(`${MOCK_DOMAIN}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json;charset=UTF-8', 'api-id': apiId, authorization: `Bearer ${token}` }, body: JSON.stringify(body), cache: 'no-store' });
  const data = await response.json() as KiwoomResponse;
  if (!response.ok || data.return_code !== 0) throw new Error(text(data.return_msg) || 'UPSTREAM_FAILED');
  return data;
}
function environment(value: string | null): Environment | null { return value === 'domestic-mock' || value === 'overseas-mock' ? value : null; }
function kstDate() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}${get('month')}${get('day')}`;
}
function marketCode(market: string) { return market === 'NASDAQ' ? 'ND' : market === 'NYSE' ? 'NY' : market === 'AMEX' ? 'NA' : ''; }

export async function GET(request: NextRequest) {
  const env = environment(request.nextUrl.searchParams.get('environment'));
  const action = request.nextUrl.searchParams.get('action');
  const code = request.nextUrl.searchParams.get('code')?.trim() ?? '';
  const market = request.nextUrl.searchParams.get('market')?.trim() ?? '';
  if (!env || !code) return NextResponse.json({ message: '잘못된 요청입니다.' }, { status: 400 });
  try {
    const token = await getToken(env);
    if (action === 'detail') {
      if (env === 'domestic-mock') {
        const data = await call(token, 'ka10001', '/api/dostk/stkinfo', { stk_cd: code });
        return NextResponse.json({ code: text(data.stk_cd), name: text(data.stk_nm), market, currency: 'KRW', currentPrice: Math.abs(number(data.cur_prc)), change: number(data.pred_pre), changeRate: number(data.flu_rt), volume: number(data.trde_qty), high52: Math.abs(number(data['250hgst'])), low52: Math.abs(number(data['250lwst'])), status: text(data.state), warning: text(data.auditInfo), tradable: market !== 'NXT', unavailableReason: market === 'NXT' ? '국내 모의투자는 NXT 주문을 지원하지 않습니다.' : undefined });
      }
      const stex_tp = marketCode(market);
      if (!stex_tp) return NextResponse.json({ message: '해외 모의투자가 지원하지 않는 거래소입니다.' }, { status: 400 });
      const data = await call(token, 'usa20100', '/api/us/mrkcond', { stex_tp, stk_cd: code });
      return NextResponse.json({ code: text(data.stk_cd), name: text(data.stk_nm), englishName: text(data.stk_enm), market, currency: 'USD', currentPrice: Math.abs(number(data.cur_prc)), change: number(data.pred_pre), changeRate: number(data.flu_rt), volume: number(data.acc_trde_qty), high52: Math.abs(number(data['52wk_hgst_pric'])), low52: Math.abs(number(data['52wk_lwst_pric'])), tradable: true });
    }
    if (action === 'status') {
      const orderNo = request.nextUrl.searchParams.get('orderNo')?.trim() ?? '';
      if (!orderNo) return NextResponse.json({ message: '주문번호가 필요합니다.' }, { status: 400 });
      if (env === 'domestic-mock') {
        const data = await call(token, 'kt00007', '/api/dostk/acnt', { ord_dt: kstDate(), qry_tp: '1', stk_bond_tp: '1', sell_tp: '2', stk_cd: code, fr_ord_no: '', dmst_stex_tp: 'KRX' });
        const rows = Array.isArray(data.acnt_ord_cntr_prps_dtl) ? data.acnt_ord_cntr_prps_dtl as Record<string, unknown>[] : [];
        const row = rows.find((item) => text(item.ord_no) === orderNo);
        return NextResponse.json(row ? { status: number(row.ord_remnq) === 0 ? 'filled' : 'pending', statusLabel: number(row.ord_remnq) === 0 ? '체결 완료' : '미체결', orderedQuantity: number(row.ord_qty), filledQuantity: number(row.cntr_qty), remainingQuantity: number(row.ord_remnq), filledPrice: number(row.cntr_uv) } : { status: 'checking', statusLabel: '체결 확인 중' });
      }
      const stex_tp = marketCode(market);
      const data = await call(token, 'ust21150', '/api/us/acnt', { ord_dt: '', query_tp: '1', slby_tp: '2', stex_tp, stk_cd: code, oppo_trde_tp: '0', fr_ord_no: '' });
      const rows = Array.isArray(data.result_list) ? data.result_list as Record<string, unknown>[] : [];
      const row = rows.find((item) => text(item.ord_no) === orderNo);
      return NextResponse.json(row ? { status: number(row.ord_remnq) === 0 ? 'filled' : 'pending', statusLabel: text(row.ord_stat_nm), orderedQuantity: number(row.ord_qty), filledQuantity: number(row.cntr_qty), remainingQuantity: number(row.ord_remnq), filledPrice: number(row.cntr_uv), rejectedReason: text(row.text1) } : { status: 'checking', statusLabel: '체결 확인 중' });
    }
    return NextResponse.json({ message: '지원하지 않는 요청입니다.' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error && !['AUTHENTICATION_FAILED', 'MISSING_CREDENTIALS'].includes(error.message) ? error.message : '키움 모의투자 API 요청에 실패했습니다.' }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json() as Record<string, unknown>;
  const env = environment(text(body.environment));
  const code = text(body.code).trim();
  const market = text(body.market).trim();
  const orderType = text(body.orderType);
  const quantity = number(body.quantity);
  const price = number(body.price);
  const idempotencyKey = text(body.idempotencyKey);
  if (!env || !code || !idempotencyKey || !Number.isInteger(quantity) || quantity < 1 || !['market', 'limit'].includes(orderType) || (orderType === 'limit' && price <= 0)) return NextResponse.json({ message: '주문 항목을 다시 확인해 주세요.' }, { status: 400 });
  const existing = orders.get(idempotencyKey);
  if (existing && existing.expiresAt > Date.now()) return NextResponse.json(existing.response);
  try {
    const token = await getToken(env);
    let result: KiwoomResponse;
    if (env === 'domestic-mock') {
      if (market === 'NXT') return NextResponse.json({ message: '국내 모의투자는 NXT 주문을 지원하지 않습니다.' }, { status: 400 });
      result = await call(token, 'kt10000', '/api/dostk/ordr', { dmst_stex_tp: 'KRX', stk_cd: code, ord_qty: String(quantity), ord_uv: orderType === 'limit' ? String(price) : '', trde_tp: orderType === 'limit' ? '0' : '3', cond_uv: '' });
    } else {
      const stex_tp = marketCode(market);
      if (!stex_tp) return NextResponse.json({ message: '해외 모의투자가 지원하지 않는 거래소입니다.' }, { status: 400 });
      result = await call(token, 'ust20000', '/api/us/ordr', { stex_tp, stk_cd: code, ord_qty: String(quantity), ord_uv: orderType === 'limit' ? String(price) : '', trde_tp: orderType === 'limit' ? '00' : '03' });
    }
    const response = { success: true, orderNo: text(result.ord_no), message: '모의투자 매수 주문이 접수되었습니다.' };
    orders.set(idempotencyKey, { response, expiresAt: Date.now() + 10 * 60_000 });
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error && !['AUTHENTICATION_FAILED', 'MISSING_CREDENTIALS'].includes(error.message) ? error.message : '모의투자 주문 접수에 실패했습니다.' }, { status: 502 });
  }
}
