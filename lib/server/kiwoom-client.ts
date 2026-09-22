import {
  kiwoomCredentials,
  kiwoomDomain,
  type KiwoomEnvironment,
} from '../kiwoom-environment.ts';

export type KiwoomPayload = Record<string, unknown> & {
  return_code?: number;
  return_msg?: string;
  token?: string;
};

export class KiwoomApiError extends Error {
  readonly code:
    | 'authentication'
    | 'credentials'
    | 'transport'
    | 'upstream'
    | 'invalid-response';
  readonly requestMayHaveReachedBroker: boolean;

  constructor(
    code:
      | 'authentication'
      | 'credentials'
      | 'transport'
      | 'upstream'
      | 'invalid-response',
    requestMayHaveReachedBroker = false,
  ) {
    super(`KIWOOM_${code.toUpperCase()}`);
    this.code = code;
    this.requestMayHaveReachedBroker = requestMayHaveReachedBroker;
  }
}

const tokenCache = new Map<
  KiwoomEnvironment,
  { value: string; expiresAt: number }
>();

export type KiwoomRequestPriority =
  | 'order-status'
  | 'preflight'
  | 'balance'
  | 'chart';

type QueuedRequest<T> = {
  priority: number;
  sequence: number;
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

const requestPriorities: Record<KiwoomRequestPriority, number> = {
  'order-status': 0,
  preflight: 1,
  balance: 2,
  chart: 3,
};
const requestQueues = new Map<KiwoomEnvironment, QueuedRequest<unknown>[]>();
const runningQueues = new Set<KiwoomEnvironment>();
let requestSequence = 0;

async function drainRequestQueue(environment: KiwoomEnvironment) {
  if (runningQueues.has(environment)) return;
  runningQueues.add(environment);
  const queue = requestQueues.get(environment) ?? [];
  try {
    while (queue.length > 0) {
      queue.sort(
        (left, right) =>
          left.priority - right.priority || left.sequence - right.sequence,
      );
      const request = queue.shift()!;
      try {
        request.resolve(await request.run());
      } catch (error) {
        request.reject(error);
      }
    }
  } finally {
    runningQueues.delete(environment);
    if (queue.length === 0) requestQueues.delete(environment);
  }
}

function scheduleKiwoomRequest<T>(
  environment: KiwoomEnvironment,
  priority: KiwoomRequestPriority,
  run: () => Promise<T>,
) {
  return new Promise<T>((resolve, reject) => {
    const queue = requestQueues.get(environment) ?? [];
    queue.push({
      priority: requestPriorities[priority],
      sequence: requestSequence++,
      run,
      resolve: resolve as (value: unknown) => void,
      reject,
    });
    requestQueues.set(environment, queue);
    void drainRequestQueue(environment);
  });
}

export function clearKiwoomToken(environment: KiwoomEnvironment) {
  tokenCache.delete(environment);
}

export function kiwoomText(value: unknown) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : '';
}

export function kiwoomNumber(value: unknown) {
  const parsed = Number(kiwoomText(value).replaceAll(',', ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function overseasMarketCode(market: string) {
  return market === 'NASDAQ'
    ? 'ND'
    : market === 'NYSE'
      ? 'NY'
      : market === 'AMEX'
        ? 'NA'
        : '';
}

export function overseasMarketName(value: unknown) {
  const market = kiwoomText(value).toUpperCase();
  return market === 'ND' || market.includes('NASDAQ') || market.includes('나스닥')
    ? 'NASDAQ'
    : market === 'NY' || market.includes('NYSE') || market.includes('뉴욕')
      ? 'NYSE'
      : market === 'NA' || market.includes('AMEX') || market.includes('아멕스')
        ? 'AMEX'
        : 'US';
}

export async function getKiwoomToken(environment: KiwoomEnvironment) {
  const cached = tokenCache.get(environment);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  let credentials: { appKey: string; appSecret: string };
  try {
    credentials = kiwoomCredentials(environment);
  } catch {
    throw new KiwoomApiError('credentials');
  }

  let response: Response;
  try {
    response = await fetch(`${kiwoomDomain(environment)}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json;charset=UTF-8' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        appkey: credentials.appKey,
        secretkey: credentials.appSecret,
      }),
      cache: 'no-store',
    });
  } catch {
    throw new KiwoomApiError('transport');
  }

  let payload: KiwoomPayload;
  try {
    payload = (await response.json()) as KiwoomPayload;
  } catch {
    throw new KiwoomApiError('invalid-response');
  }
  if (!response.ok || payload.return_code !== 0 || !payload.token)
    throw new KiwoomApiError('authentication');
  tokenCache.set(environment, {
    value: payload.token,
    expiresAt: Date.now() + 23 * 60 * 60 * 1000,
  });
  return payload.token;
}

export async function requestKiwoom(
  environment: KiwoomEnvironment,
  apiId: string,
  path: string,
  body: Record<string, string>,
  continuation?: { contYn: string; nextKey: string },
  priority: KiwoomRequestPriority = 'balance',
) {
  return scheduleKiwoomRequest(environment, priority, async () => {
    const token = await getKiwoomToken(environment);
    let response: Response;
    try {
      response = await fetch(`${kiwoomDomain(environment)}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'api-id': apiId,
          authorization: `Bearer ${token}`,
          ...(continuation
            ? { 'cont-yn': continuation.contYn, 'next-key': continuation.nextKey }
            : {}),
        },
        body: JSON.stringify(body),
        cache: 'no-store',
      });
    } catch {
      throw new KiwoomApiError('transport', true);
    }

    let payload: KiwoomPayload;
    try {
      payload = (await response.json()) as KiwoomPayload;
    } catch {
      throw new KiwoomApiError('invalid-response', true);
    }
    if (!response.ok || payload.return_code !== 0)
      throw new KiwoomApiError('upstream', false);
    return {
      payload,
      continuation: {
        contYn:
          response.headers.get('cont-yn') ?? kiwoomText(payload['cont-yn']),
        nextKey:
          response.headers.get('next-key') ?? kiwoomText(payload['next-key']),
      },
    };
  });
}

export async function requestKiwoomPages(
  environment: KiwoomEnvironment,
  apiId: string,
  path: string,
  body: Record<string, string>,
  priority: KiwoomRequestPriority = 'balance',
) {
  const pages: KiwoomPayload[] = [];
  let continuation: { contYn: string; nextKey: string } | undefined;
  const seenContinuationKeys = new Set<string>();
  while (true) {
    const response = await requestKiwoom(
      environment,
      apiId,
      path,
      body,
      continuation,
      priority,
    );
    pages.push(response.payload);
    if (
      response.continuation.contYn.toUpperCase() !== 'Y' ||
      !response.continuation.nextKey
    )
      return pages;
    if (seenContinuationKeys.has(response.continuation.nextKey))
      throw new KiwoomApiError('invalid-response');
    seenContinuationKeys.add(response.continuation.nextKey);
    continuation = response.continuation;
  }
}
