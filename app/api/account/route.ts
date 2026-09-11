import { NextRequest, NextResponse } from 'next/server';

type Environment = 'domestic-mock' | 'overseas-mock';
type KiwoomResponse = Record<string, unknown> & { return_code?: number };
const tokenCache = new Map<Environment, { value: string; expiresAt: number }>();
const MOCK_DOMAIN = 'https://mockapi.kiwoom.com';

function parseNumber(value: unknown) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return 0;
  const parsed = Number(value.replaceAll(',', '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}
function parseText(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}
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
  const data = await response.json() as KiwoomResponse & { token?: string };
  if (!response.ok || data.return_code !== 0 || !data.token) throw new Error('AUTHENTICATION_FAILED');
  tokenCache.set(environment, { value: data.token, expiresAt: Date.now() + 23 * 60 * 60 * 1000 });
  return data.token;
}
async function requestKiwoom(token: string, apiId: string, path: string, body: Record<string, string>) {
  const response = await fetch(`${MOCK_DOMAIN}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json;charset=UTF-8', 'api-id': apiId, authorization: `Bearer ${token}` }, body: JSON.stringify(body), cache: 'no-store' });
  const data = await response.json() as KiwoomResponse;
  if (!response.ok || (data.return_code !== undefined && data.return_code !== 0)) throw new Error('UPSTREAM_FAILED');
  return data;
}
async function domesticAccount(token: string) {
  const [data, deposit] = await Promise.all([
    requestKiwoom(token, 'kt00018', '/api/dostk/acnt', { qry_tp: '1', dmst_stex_tp: 'KRX' }),
    requestKiwoom(token, 'kt00001', '/api/dostk/acnt', { qry_tp: '3' }),
  ]);
  const rows = Array.isArray(data.acnt_evlt_remn_indv_tot) ? data.acnt_evlt_remn_indv_tot as Record<string, unknown>[] : [];
  return { environment: 'domestic-mock' as const, asOf: new Date().toISOString(), currency: 'KRW' as const, accountNotice: rows.length === 0 && parseNumber(data.prsm_dpst_aset_amt) === 0 && parseNumber(deposit.entr) === 0 ? '키움 모의투자 API가 현재 계좌의 조회 내역이 없다고 응답했습니다. 모의계좌의 자산 또는 연결된 앱 키를 확인해 주세요.' : undefined, cashBalance: parseNumber(deposit.entr), totalPurchaseAmount: parseNumber(data.tot_pur_amt), totalEvaluationAmount: parseNumber(data.tot_evlt_amt), totalProfitLoss: parseNumber(data.tot_evlt_pl), totalProfitRate: parseNumber(data.tot_prft_rt), estimatedAssets: parseNumber(data.prsm_dpst_aset_amt), holdings: rows.map((row) => ({ code: parseText(row.stk_cd).replace(/^[AJQ]/, ''), name: parseText(row.stk_nm), market: 'KRX', quantity: parseNumber(row.rmnd_qty), availableQuantity: parseNumber(row.trde_able_qty), averagePrice: parseNumber(row.pur_pric), currentPrice: Math.abs(parseNumber(row.cur_prc)), evaluationAmount: parseNumber(row.evlt_amt), profitLoss: parseNumber(row.evltv_prft), profitRate: parseNumber(row.prft_rt), currency: 'KRW' as const })) };
}
async function overseasAccount(token: string) {
  const deposit = await requestKiwoom(token, 'ust21160', '/api/us/acnt', {});
  return { environment: 'overseas-mock' as const, asOf: new Date().toISOString(), currency: 'KRW' as const, accountNotice: '키움 해외 모의투자는 전체 보유 종목 조회를 제공하지 않아 예수금만 표시합니다.', cashBalance: parseNumber(deposit.d0_won_conv_alow_ch), totalPurchaseAmount: 0, totalEvaluationAmount: 0, totalProfitLoss: 0, totalProfitRate: 0, holdings: [] };
}

export async function GET(request: NextRequest) {
  const environment = request.nextUrl.searchParams.get('environment');
  if (environment !== 'domestic-mock' && environment !== 'overseas-mock') return NextResponse.json({ message: '지원하지 않는 투자 환경입니다.' }, { status: 400 });
  try {
    const token = await getToken(environment);
    const account = environment === 'domestic-mock' ? await domesticAccount(token) : await overseasAccount(token);
    return NextResponse.json(account, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN';
    if (code === 'MISSING_CREDENTIALS') return NextResponse.json({ message: '선택한 모의투자 환경의 인증정보가 설정되지 않았습니다.' }, { status: 503 });
    if (code === 'AUTHENTICATION_FAILED') return NextResponse.json({ message: '모의투자 인증에 실패했습니다. 서버 설정을 확인해 주세요.' }, { status: 502 });
    return NextResponse.json({ message: '키움 모의투자 계좌 정보를 불러오지 못했습니다.' }, { status: 502 });
  }
}
