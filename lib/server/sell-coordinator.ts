import { isLive, type KiwoomEnvironment } from '../kiwoom-environment.ts';
import {
  KiwoomApiError,
  kiwoomText,
  overseasMarketCode,
  requestKiwoom,
} from './kiwoom-client.ts';
import {
  fetchHolding,
  fetchOpenOrders,
} from './kiwoom-portfolio.ts';
import {
  strategyRuntimeStore,
  type SellIntentSource,
  type StrategyRuntimeStore,
} from './strategy-runtime.ts';

export type SubmitSellResult =
  | { status: 'accepted'; intentId: string; orderNo: string; quantity: number }
  | { status: 'blocked'; intentId: string; message: string }
  | { status: 'dry-run'; message: string }
  | { status: 'unavailable'; message: string };

export async function submitCoordinatedSell(input: {
  environment: KiwoomEnvironment;
  market: string;
  code: string;
  source: SellIntentSource;
  reasons: string[];
  requestedQuantity?: number;
  orderType?: 'market' | 'limit';
  price?: number;
  idempotencyKey?: string;
  runtime?: StrategyRuntimeStore;
}): Promise<SubmitSellResult> {
  if (isLive(input.environment))
    return {
      status: 'unavailable',
      message: '실투자 자동·수동 주문은 비활성화되어 있습니다.',
    };
  if (
    input.source === 'strategy' &&
    process.env.ENABLE_MOCK_STRATEGY_ORDERS !== 'true'
  )
    return {
      status: 'dry-run',
      message: '모의 자동주문 안전 스위치가 꺼져 있어 신호만 기록했습니다.',
    };

  const runtime = input.runtime ?? strategyRuntimeStore();
  const idempotent = input.idempotencyKey
    ? runtime.getIntentByIdempotencyKey(input.idempotencyKey)
    : undefined;
  if (idempotent?.state === 'accepted' && idempotent.orderNo)
    return {
      status: 'accepted',
      intentId: idempotent.id,
      orderNo: idempotent.orderNo,
      quantity: idempotent.orderedQuantity ?? 0,
    };
  if (idempotent)
    return {
      status: 'blocked',
      intentId: idempotent.id,
      message: '동일한 요청이 이미 처리되었으며 새 주문을 전송하지 않았습니다.',
    };
  const symbolBlocking = runtime.getBlockingIntentForSymbol(
    input.environment,
    input.market,
    input.code,
  );
  if (symbolBlocking)
    return {
      status: 'blocked',
      intentId: symbolBlocking.id,
      message: '이 종목의 매도 주문이 이미 처리 중이거나 안전 정지 상태입니다.',
    };
  const initialHolding = await fetchHolding(
    input.environment,
    input.market,
    input.code,
    'preflight',
  );
  if (!initialHolding || initialHolding.quantity <= 0)
    return { status: 'unavailable', message: '현재 보유수량이 없습니다.' };
  const position = runtime.upsertPosition({
    environment: input.environment,
    market: input.market,
    code: input.code,
    quantity: initialHolding.quantity,
    availableQuantity: initialHolding.availableQuantity,
    averagePrice: initialHolding.averagePrice,
    trailingActive: false,
  });
  const claimed = runtime.claimSellIntent({
    positionKey: position.positionKey,
    environment: input.environment,
    market: input.market,
    code: input.code,
    generation: position.generation,
    source: input.source,
    idempotencyKey: input.idempotencyKey,
    reasons: input.reasons,
  });
  if (!claimed.claimed)
    return {
      status: 'blocked',
      intentId: claimed.intent.id,
      message: '이 종목의 매도 주문이 이미 처리 중이거나 안전 정지 상태입니다.',
    };

  const intentId = claimed.intent.id;
  runtime.updateIntent(intentId, { state: 'preflight' });
  try {
    const [holding, openOrders] = await Promise.all([
      fetchHolding(input.environment, input.market, input.code, 'preflight'),
      fetchOpenOrders(
        input.environment,
        input.market,
        input.code,
        'preflight',
      ),
    ]);
    if (openOrders.some((order) => order.side === 'sell' && order.remainingQuantity > 0)) {
      runtime.updateIntent(intentId, {
        state: 'needs_review',
        lastError: 'EXISTING_OPEN_SELL_ORDER',
      });
      return {
        status: 'blocked',
        intentId,
        message: '기존 미체결 매도 주문이 있어 자동 주문을 중지했습니다.',
      };
    }
    const available = Math.floor(holding?.availableQuantity ?? 0);
    const requested = input.requestedQuantity
      ? Math.floor(input.requestedQuantity)
      : available;
    if (input.source === 'manual' && requested > available) {
      runtime.updateIntent(intentId, {
        state: 'needs_review',
        lastError: 'SELLABLE_QUANTITY_CHANGED',
      });
      return {
        status: 'blocked',
        intentId,
        message: `주문 직전 매도 가능 수량은 ${available}주입니다.`,
      };
    }
    const quantity = Math.min(requested, available);
    if (quantity < 1) {
      runtime.updateIntent(intentId, {
        state: 'needs_review',
        lastError: 'NO_SELLABLE_QUANTITY',
      });
      return {
        status: 'blocked',
        intentId,
        message: '주문 직전 매도 가능 수량이 없습니다.',
      };
    }

    runtime.updateIntent(intentId, {
      state: 'submitting',
      orderedQuantity: quantity,
      remainingQuantity: quantity,
    });
    const domestic = input.environment.startsWith('domestic-');
    const orderType = input.source === 'strategy' ? 'market' : input.orderType;
    const limitPrice = orderType === 'limit' ? input.price ?? 0 : 0;
    if (orderType === 'limit' && limitPrice <= 0) {
      runtime.updateIntent(intentId, {
        state: 'needs_review',
        lastError: 'INVALID_LIMIT_PRICE',
      });
      return {
        status: 'blocked',
        intentId,
        message: '지정가 주문 가격을 확인해 주세요.',
      };
    }
    const stexTp = overseasMarketCode(input.market);
    if (!domestic && !stexTp) {
      runtime.updateIntent(intentId, {
        state: 'needs_review',
        lastError: 'UNSUPPORTED_EXCHANGE',
      });
      return {
        status: 'blocked',
        intentId,
        message: '지원하는 미국 거래소를 확인하지 못했습니다.',
      };
    }
    const { payload } = await requestKiwoom(
      input.environment,
      domestic ? 'kt10001' : 'ust20001',
      domestic ? '/api/dostk/ordr' : '/api/us/ordr',
      domestic
        ? {
            dmst_stex_tp: 'KRX',
            stk_cd: input.code,
            ord_qty: String(quantity),
            ord_uv: orderType === 'limit' ? String(limitPrice) : '',
            trde_tp: orderType === 'limit' ? '0' : '3',
            cond_uv: '',
          }
        : {
            stex_tp: stexTp,
            stk_cd: input.code,
            ord_qty: String(quantity),
            ord_uv: orderType === 'limit' ? String(limitPrice) : '',
            stop_pric: '',
            trde_tp: orderType === 'limit' ? '00' : '03',
          },
      undefined,
      'order-status',
    );
    const orderNo = kiwoomText(payload.ord_no);
    if (!orderNo) {
      runtime.updateIntent(intentId, {
        state: 'submission_unknown',
        lastError: 'ORDER_NUMBER_MISSING',
      });
      return {
        status: 'blocked',
        intentId,
        message: '주문 전송 결과를 확정할 수 없어 안전 정지했습니다.',
      };
    }
    runtime.updateIntent(intentId, {
      state: 'accepted',
      orderNo,
      orderedQuantity: quantity,
      remainingQuantity: quantity,
    });
    return { status: 'accepted', intentId, orderNo, quantity };
  } catch (error) {
    const uncertain =
      error instanceof KiwoomApiError && error.requestMayHaveReachedBroker;
    runtime.updateIntent(intentId, {
      state: uncertain ? 'submission_unknown' : 'needs_review',
      lastError: uncertain ? 'SUBMISSION_UNKNOWN' : 'PREFLIGHT_OR_ORDER_FAILED',
    });
    return {
      status: 'blocked',
      intentId,
      message: uncertain
        ? '주문 전달 여부를 확인할 수 없어 재주문하지 않고 안전 정지했습니다.'
        : '주문 확인 또는 접수에 실패해 안전 정지했습니다.',
    };
  }
}
