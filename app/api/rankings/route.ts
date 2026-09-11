import { NextRequest, NextResponse } from 'next/server';
import { isDomestic, isKiwoomEnvironment, kiwoomCredentials, kiwoomDomain, type KiwoomEnvironment as Environment } from '@/lib/kiwoom-environment';

type Category = 'value' | 'gainers' | 'volume' | 'popular';
type KiwoomResponse = Record<string, unknown> & { return_code?: number; returnCode?: number; token?: string };

const tokenCache = new Map<Environment, { value: string; expiresAt: number }>();

function text(value: unknown) { return typeof value === 'string' || typeof value === 'number' ? String(value) : ''; }
function numeric(value: unknown) { const parsed = Number(text(value).replaceAll(',', '')); return Number.isFinite(parsed) ? parsed : 0; }
function absolute(value: unknown) { return Math.abs(numeric(value)); }
function market(value: unknown) { return ({ ND: 'NASDAQ', NY: 'NYSE', NA: 'AMEX' } as Record<string, string>)[text(value)] ?? text(value); }

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

const domesticRequests: Record<Category, { apiId: string; path: string; list: string; body: Record<string, string> }> = {
  value: { apiId: 'ka10032', path: '/api/dostk/rkinfo', list: 'trde_prica_upper', body: { mrkt_tp: '000', mang_stk_incls: '0', stex_tp: '1' } },
  gainers: { apiId: 'ka10027', path: '/api/dostk/rkinfo', list: 'pred_pre_flu_rt_upper', body: { mrkt_tp: '000', sort_tp: '1', trde_qty_cnd: '0000', stk_cnd: '0', crd_cnd: '0', updown_incls: '1', pric_cnd: '0', trde_prica_cnd: '0', stex_tp: '1' } },
  volume: { apiId: 'ka10030', path: '/api/dostk/rkinfo', list: 'tdy_trde_qty_upper', body: { mrkt_tp: '000', sort_tp: '1', mang_stk_incls: '0', crd_tp: '0', trde_qty_tp: '0', pric_tp: '0', trde_prica_tp: '0', mrkt_open_tp: '0', stex_tp: '1' } },
  popular: { apiId: 'ka00198', path: '/api/dostk/stkinfo', list: 'item_inq_rank', body: { qry_tp: '1' } },
};

const overseasRequests: Record<Category, { apiId: string; path: string; list: string; body: Record<string, string> }> = {
  value: { apiId: 'usa20540', path: '/api/us/rkinfo', list: 'result_list', body: { stex_tp: '0', inds_cd: '', stk_tp: '0', trde_qty_tp: '0', stk_cnd: '0', pric_cnd: '0', trde_prica_cnd: '0' } },
  gainers: { apiId: 'usa20910', path: '/api/us/rkinfo', list: 'result_list', body: { stex_tp: '0', inds_cd: '', inds_cls_tp: '0', sort_tp: '1', stk_tp: '0', stk_cnd: '0', pric_cnd: '0', trde_prica_cnd: '0', trde_qty_tp: '' } },
  volume: { apiId: 'usa20530', path: '/api/us/rkinfo', list: 'result_list', body: { stex_tp: '0', inds_cd: '', stk_tp: '0', trde_qty_tp: '0', qry_tp: '0', stk_cnd: '0', pric_cnd: '0', trde_prica_cnd: '0' } },
  popular: { apiId: 'usa01980', path: '/api/us/rkinfo', list: 'result_list', body: { svc_type: 'B281' } },
};

async function loadRanking(environment: Environment, category: Category) {
  const config = (isDomestic(environment) ? domesticRequests : overseasRequests)[category];
  const token = await getToken(environment);
  const response = await fetch(`${kiwoomDomain(environment)}${config.path}`, { method: 'POST', headers: { 'Content-Type': 'application/json;charset=UTF-8', 'api-id': config.apiId, authorization: `Bearer ${token}` }, body: JSON.stringify(config.body), cache: 'no-store' });
  const data = await response.json() as KiwoomResponse;
  const returnCode = data.return_code ?? data.returnCode;
  if (!response.ok || returnCode !== 0) throw new Error('UPSTREAM_FAILED');
  const rows = Array.isArray(data[config.list]) ? data[config.list] as Record<string, unknown>[] : [];
  return rows.slice(0, 30).map((row, index) => ({
    rank: numeric(row.now_rank ?? row.bigd_rank ?? row.rank) || index + 1,
    code: text(row.stk_cd),
    name: text(row.stk_nm),
    englishName: text(row.stk_enm) || undefined,
    market: isDomestic(environment) ? 'KRX' : market(row.stex_tp),
    currentPrice: absolute(row.cur_prc ?? row.past_curr_prc ?? row.curr_pric),
    change: numeric(row.pred_pre),
    changeRate: numeric(row.flu_rt ?? row.base_comp_chgr ?? row.diff_rate_for_gjga),
    volume: absolute(row.now_trde_qty ?? row.trde_qty ?? row.acc_trde_qty),
    tradeValue: absolute(row.trde_prica ?? row.trde_amt),
    currency: isDomestic(environment) ? 'KRW' : 'USD',
  })).filter((item) => item.code && item.name);
}

export async function GET(request: NextRequest) {
  const environment = request.nextUrl.searchParams.get('environment');
  const category = request.nextUrl.searchParams.get('category');
  if (!isKiwoomEnvironment(environment)) return NextResponse.json({ message: '지원하지 않는 투자 환경입니다.' }, { status: 400 });
  if (category !== 'value' && category !== 'gainers' && category !== 'volume' && category !== 'popular') return NextResponse.json({ message: '지원하지 않는 순위 유형입니다.' }, { status: 400 });
  try {
    return NextResponse.json({ environment, category, asOf: new Date().toISOString(), results: await loadRanking(environment, category) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN';
    if (code === 'MISSING_CREDENTIALS') return NextResponse.json({ message: '선택한 투자 환경의 인증정보가 설정되지 않았습니다.' }, { status: 503 });
    if (code === 'AUTHENTICATION_FAILED') return NextResponse.json({ message: '키움 인증에 실패했습니다.' }, { status: 502 });
    return NextResponse.json({ message: '순위 정보를 불러오지 못했습니다.' }, { status: 502 });
  }
}
