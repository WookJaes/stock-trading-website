import { NextRequest, NextResponse } from 'next/server';
import {
  isKiwoomEnvironment,
  type KiwoomEnvironment,
} from '@/lib/kiwoom-environment';
import { strategyRuntimeStore } from '@/lib/server/strategy-runtime';
import { fetchHolding, fetchOpenOrders } from '@/lib/server/kiwoom-portfolio';

function publicIntent(intent: ReturnType<ReturnType<typeof strategyRuntimeStore>['listRecentIntents']>[number]) {
  return {
    id: intent.id,
    environment: intent.environment,
    market: intent.market,
    code: intent.code,
    source: intent.source,
    reasons: intent.reasons,
    state: intent.state,
    orderNo: intent.orderNo,
    orderedQuantity: intent.orderedQuantity,
    filledQuantity: intent.filledQuantity,
    remainingQuantity: intent.remainingQuantity,
    lastError: intent.lastError,
    createdAt: intent.createdAt,
    updatedAt: intent.updatedAt,
  };
}

export async function GET(request: NextRequest) {
  const rawEnvironment = request.nextUrl.searchParams.get('environment');
  if (rawEnvironment && !isKiwoomEnvironment(rawEnvironment))
    return NextResponse.json(
      { message: '지원하지 않는 투자 환경입니다.' },
      { status: 400 },
    );
  try {
    const environment = rawEnvironment as KiwoomEnvironment | null;
    const store = strategyRuntimeStore();
    const services = store.runtimeStatuses();
    const worker = services.find((status) => status.status_key === 'worker');
    const intents = store
      .listRecentIntents(100)
      .filter((intent) => !environment || intent.environment === environment)
      .map(publicIntent);
    return NextResponse.json(
      {
        mode:
          process.env.ENABLE_MOCK_STRATEGY_ORDERS === 'true'
            ? 'mock-enabled'
            : 'dry-run',
        liveOrdersEnabled: false,
        workerOnline:
          worker?.status_value === 'running' &&
          Date.now() - worker.updated_at < 90_000,
        services: services.map((status) => ({
          key: status.status_key,
          value: status.status_value,
          updatedAt: status.updated_at,
        })),
        intents,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      { message: '전략 실행 상태를 읽지 못했습니다.' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { message: '올바른 요청이 아닙니다.' },
      { status: 400 },
    );
  }
  if (body.action !== 'resume' || typeof body.intentId !== 'string')
    return NextResponse.json(
      { message: '지원하지 않는 작업입니다.' },
      { status: 400 },
    );
  try {
    const store = strategyRuntimeStore();
    const intent = store.getIntent(body.intentId);
    if (!intent || intent.state !== 'needs_review')
      return NextResponse.json(
        { message: '재가동할 수 있는 안전정지 상태가 아닙니다.' },
        { status: 409 },
      );
    const [holding, openOrders] = await Promise.all([
      fetchHolding(intent.environment, intent.market, intent.code),
      fetchOpenOrders(intent.environment, intent.market, intent.code),
    ]);
    if (openOrders.some((order) => order.side === 'sell' && order.remainingQuantity > 0))
      return NextResponse.json(
        { message: '미체결 매도 주문이 남아 있어 재가동할 수 없습니다.' },
        { status: 409 },
      );
    if (holding)
      store.upsertPosition({
        environment: intent.environment,
        market: intent.market,
        code: intent.code,
        quantity: holding.quantity,
        availableQuantity: holding.availableQuantity,
        averagePrice: holding.averagePrice,
        trailingActive: false,
      });
    const resumed = store.resumeIntent(body.intentId);
    return resumed
      ? NextResponse.json({ success: true })
      : NextResponse.json(
          { message: '재가동할 수 있는 안전정지 상태가 아닙니다.' },
          { status: 409 },
        );
  } catch {
    return NextResponse.json(
      { message: '전략 상태를 변경하지 못했습니다.' },
      { status: 500 },
    );
  }
}
