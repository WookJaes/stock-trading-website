export type KiwoomEnvironment = 'domestic-live' | 'overseas-live' | 'domestic-mock' | 'overseas-mock';

export const KIWOOM_REAL_DOMAIN = 'https://api.kiwoom.com';
export const KIWOOM_MOCK_DOMAIN = 'https://mockapi.kiwoom.com';

export function isKiwoomEnvironment(value: unknown): value is KiwoomEnvironment {
  return value === 'domestic-live' || value === 'overseas-live' || value === 'domestic-mock' || value === 'overseas-mock';
}

export function isDomestic(environment: KiwoomEnvironment) {
  return environment.startsWith('domestic-');
}

export function isLive(environment: KiwoomEnvironment) {
  return environment.endsWith('-live');
}

export function kiwoomDomain(environment: KiwoomEnvironment) {
  return isLive(environment) ? KIWOOM_REAL_DOMAIN : KIWOOM_MOCK_DOMAIN;
}

export function kiwoomCredentials(environment: KiwoomEnvironment) {
  if (isLive(environment)) {
    const appKey = process.env.KIS_REAL_APP_KEY ?? process.env.KIWOOM_REAL_APP_KEY;
    const appSecret = process.env.KIS_REAL_APP_SECRET ?? process.env.KIWOOM_REAL_APP_SECRET;
    if (!appKey || !appSecret) throw new Error('MISSING_CREDENTIALS');
    return { appKey, appSecret };
  }

  const domestic = isDomestic(environment);
  const appKey = process.env[domestic ? 'KIS_MOCK_DOMESTIC_APP_KEY' : 'KIS_MOCK_OVERSEAS_APP_KEY'] ?? process.env[domestic ? 'KIWOOM_MOCK_DOMESTIC_APP_KEY' : 'KIWOOM_MOCK_OVERSEAS_APP_KEY'];
  const appSecret = process.env[domestic ? 'KIS_MOCK_DOMESTIC_APP_SECRET' : 'KIS_MOCK_OVERSEAS_APP_SECRET'] ?? process.env[domestic ? 'KIWOOM_MOCK_DOMESTIC_APP_SECRET' : 'KIWOOM_MOCK_OVERSEAS_APP_SECRET'];
  if (!appKey || !appSecret) throw new Error('MISSING_CREDENTIALS');
  return { appKey, appSecret };
}
