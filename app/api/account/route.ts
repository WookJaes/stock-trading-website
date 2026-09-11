import { NextRequest, NextResponse } from 'next/server';
import { isDomestic, isKiwoomEnvironment, isLive, kiwoomCredentials, kiwoomDomain, type KiwoomEnvironment as Environment } from '@/lib/kiwoom-environment';

type KiwoomResponse = Record<string, unknown> & { return_code?: number };
const tokenCache = new Map<Environment, { value: string; expiresAt: number }>();

function parseNumber(value: unknown) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return 0;
  const parsed = Number(value.replaceAll(',', '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}
function parseText(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}
async function getToken(environment: Environment) {
  const cached = tokenCache.get(environment);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const { appKey, appSecret } = kiwoomCredentials(environment);
  const response = await fetch(`${kiwoomDomain(environment)}/oauth2/token`, { method: 'POST', headers: { 'Content-Type': 'application/json;charset=UTF-8' }, body: JSON.stringify({ grant_type: 'client_credentials', appkey: appKey, secretkey: appSecret }), cache: 'no-store' });
  const data = await response.json() as KiwoomResponse & { token?: string };
  if (!response.ok || data.return_code !== 0 || !data.token) throw new Error('AUTHENTICATION_FAILED');
  tokenCache.set(environment, { value: data.token, expiresAt: Date.now() + 23 * 60 * 60 * 1000 });
  return data.token;
}
async function requestKiwoom(environment: Environment, token: string, apiId: string, path: string, body: Record<string, string>) {
  const response = await fetch(`${kiwoomDomain(environment)}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json;charset=UTF-8', 'api-id': apiId, authorization: `Bearer ${token}` }, body: JSON.stringify(body), cache: 'no-store' });
  const data = await response.json() as KiwoomResponse;
  if (!response.ok || (data.return_code !== undefined && data.return_code !== 0)) throw new Error('UPSTREAM_FAILED');
  return data;
}
async function domesticAccount(environment: Environment, token: string) {
  const [data, deposit] = await Promise.all([
    requestKiwoom(environment, token, 'kt00018', '/api/dostk/acnt', { qry_tp: '1', dmst_stex_tp: 'KRX' }),
    requestKiwoom(environment, token, 'kt00001', '/api/dostk/acnt', { qry_tp: '3' }),
  ]);
  const rows = Array.isArray(data.acnt_evlt_remn_indv_tot) ? data.acnt_evlt_remn_indv_tot as Record<string, unknown>[] : [];
  return { environment, asOf: new Date().toISOString(), currency: 'KRW' as const, accountNotice: rows.length === 0 && parseNumber(data.prsm_dpst_aset_amt) === 0 && parseNumber(deposit.entr) === 0 ? `키움 ${isLive(environment) ? '실투자' : '모의투자'} API가 현재 계좌의 조회 내역이 없다고 응답했습니다.` : undefined, cashBalance: parseNumber(deposit.entr), totalPurchaseAmount: parseNumber(data.tot_pur_amt), totalEvaluationAmount: parseNumber(data.tot_evlt_amt), totalProfitLoss: parseNumber(data.tot_evlt_pl), totalProfitRate: parseNumber(data.tot_prft_rt), estimatedAssets: parseNumber(data.prsm_dpst_aset_amt), holdings: rows.map((row) => ({ code: parseText(row.stk_cd).replace(/^[AJQ]/, ''), name: parseText(row.stk_nm), market: 'KRX', quantity: parseNumber(row.rmnd_qty), availableQuantity: parseNumber(row.trde_able_qty), averagePrice: parseNumber(row.pur_pric), currentPrice: Math.abs(parseNumber(row.cur_prc)), evaluationAmount: parseNumber(row.evlt_amt), profitLoss: parseNumber(row.evltv_prft), profitRate: parseNumber(row.prft_rt), currency: 'KRW' as const })) };
}
async function overseasAccount(environment: Environment, token: string) {
  const [valuation, deposit] = await Promise.all([
    requestKiwoom(environment, token, 'ust21120', '/api/us/acnt', { cmsn_incl_tp: '0', exrt_tp: '0' }),
    requestKiwoom(environment, token, 'ust21160', '/api/us/acnt', {}),
  ]);
  const currencyRows = Array.isArray(valuation.result_list) ? valuation.result_list as Record<string, unknown>[] : [];
  const usd = currencyRows.find((row) => parseText(row.crnc_code) === 'USD');
  return {
    environment,
    asOf: new Date().toISOString(),
    currency: 'USD' as const,
    accountNotice: usd ? `해외 ${isLive(environment) ? '실투자' : '모의투자'} 계좌는 USD 외화예수금과 해외증권 평가금 기준으로 표시합니다.` : `키움 ${isLive(environment) ? '실투자' : '모의투자'} API가 USD 계좌 내역을 반환하지 않았습니다.`,
    cashBalance: parseNumber(usd?.fx_entr ?? deposit.d0_usd_fx_entr),
    cashBalanceKrw: parseNumber(valuation.won_entr ?? deposit.won_entr),
    withdrawableKrw: parseNumber(deposit.d0_won_conv_alow_ch),
    totalPurchaseAmount: 0,
    totalEvaluationAmount: parseNumber(usd?.evlt_amt),
    totalProfitLoss: 0,
    totalProfitRate: 0,
    estimatedAssets: parseNumber(valuation.aset_evlt_amt),
    holdings: [],
  };
}

export async function GET(request: NextRequest) {
  const environment = request.nextUrl.searchParams.get('environment');
  if (!isKiwoomEnvironment(environment)) return NextResponse.json({ message: '지원하지 않는 투자 환경입니다.' }, { status: 400 });
  try {
    const token = await getToken(environment);
    const account = isDomestic(environment) ? await domesticAccount(environment, token) : await overseasAccount(environment, token);
    return NextResponse.json(account, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN';
    if (code === 'MISSING_CREDENTIALS') return NextResponse.json({ message: '선택한 투자 환경의 인증정보가 설정되지 않았습니다.' }, { status: 503 });
    if (code === 'AUTHENTICATION_FAILED') return NextResponse.json({ message: '키움 인증에 실패했습니다. 서버 설정을 확인해 주세요.' }, { status: 502 });
    return NextResponse.json({ message: '키움 계좌 정보를 불러오지 못했습니다.' }, { status: 502 });
  }
}
