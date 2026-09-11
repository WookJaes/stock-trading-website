import { NextRequest, NextResponse } from 'next/server';

type Environment = 'domestic-mock' | 'overseas-mock';
type KiwoomResponse = Record<string, unknown> & { return_code?: number; token?: string };
type Stock = { code: string; name: string; englishName?: string; market: string; sector?: string; isEtf?: boolean; status?: string };

const MOCK_DOMAIN = 'https://mockapi.kiwoom.com';
const tokenCache = new Map<Environment, { value: string; expiresAt: number }>();
const stockCache = new Map<Environment, { value: Stock[]; expiresAt: number }>();

function text(value: unknown) {
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
  const response = await fetch(`${MOCK_DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json;charset=UTF-8' },
    body: JSON.stringify({ grant_type: 'client_credentials', appkey: appKey, secretkey: appSecret }),
    cache: 'no-store',
  });
  const data = await response.json() as KiwoomResponse;
  if (!response.ok || data.return_code !== 0 || !data.token) throw new Error('AUTHENTICATION_FAILED');
  tokenCache.set(environment, { value: data.token, expiresAt: Date.now() + 23 * 60 * 60 * 1000 });
  return data.token;
}

async function requestList(token: string, apiId: string, path: string, body: Record<string, string>) {
  const response = await fetch(`${MOCK_DOMAIN}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json;charset=UTF-8', 'api-id': apiId, authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const data = await response.json() as KiwoomResponse;
  if (!response.ok || data.return_code !== 0) throw new Error('UPSTREAM_FAILED');
  return Array.isArray(data.list) ? data.list as Record<string, unknown>[] : [];
}

async function loadStocks(environment: Environment) {
  const cached = stockCache.get(environment);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const token = await getToken(environment);
  let stocks: Stock[];
  if (environment === 'domestic-mock') {
    const markets = ['0', '10', '50', '8'];
    const rows: Record<string, unknown>[] = [];
    for (const mrkt_tp of markets) {
      if (rows.length > 0) await new Promise((resolve) => setTimeout(resolve, 1100));
      rows.push(...await requestList(token, 'ka10099', '/api/dostk/stkinfo', { mrkt_tp }));
    }
    stocks = rows.map((row) => ({ code: text(row.code), name: text(row.name), market: text(row.marketName), sector: text(row.upName), status: text(row.auditInfo) }));
  } else {
    const rows = await requestList(token, 'usa10099', '/api/us/stkinfo', { stex_tp: '%' });
    stocks = rows.map((row) => ({ code: text(row.stk_cd), name: text(row.stk_nm), englishName: text(row.stk_enm), market: text(row.mkgb), sector: text(row.upgb), isEtf: text(row.isEtf) === 'Y' }));
  }
  stockCache.set(environment, { value: stocks, expiresAt: Date.now() + 10 * 60 * 1000 });
  return stocks;
}

export async function GET(request: NextRequest) {
  const environment = request.nextUrl.searchParams.get('environment');
  const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (environment !== 'domestic-mock' && environment !== 'overseas-mock') return NextResponse.json({ message: '지원하지 않는 투자 환경입니다.' }, { status: 400 });
  if (!query) return NextResponse.json({ results: [], total: 0 });
  try {
    const normalized = query.toLocaleLowerCase('ko-KR');
    const score = (stock: Stock) => {
      const code = stock.code.toLocaleLowerCase('ko-KR');
      const name = stock.name.toLocaleLowerCase('ko-KR');
      const englishName = stock.englishName?.toLocaleLowerCase('en-US') ?? '';
      if (code === normalized) return 0;
      if (name === normalized || englishName === normalized) return 1;
      if (code.startsWith(normalized)) return 2;
      if (name.startsWith(normalized) || englishName.startsWith(normalized)) return 3;
      return 4;
    };
    const matches = (await loadStocks(environment)).filter((stock) => stock.code.toLocaleLowerCase('ko-KR').includes(normalized) || stock.name.toLocaleLowerCase('ko-KR').includes(normalized) || stock.englishName?.toLocaleLowerCase('en-US').includes(normalized)).sort((left, right) => score(left) - score(right));
    return NextResponse.json({ results: matches.slice(0, 50), total: matches.length }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN';
    if (code === 'MISSING_CREDENTIALS') return NextResponse.json({ message: '선택한 모의투자 환경의 인증정보가 설정되지 않았습니다.' }, { status: 503 });
    if (code === 'AUTHENTICATION_FAILED') return NextResponse.json({ message: '모의투자 인증에 실패했습니다.' }, { status: 502 });
    return NextResponse.json({ message: '종목 목록을 불러오지 못했습니다.' }, { status: 502 });
  }
}
