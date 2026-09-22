import { randomUUID } from 'node:crypto';
import {
  evaluateDeadCross,
  evaluateSlTp,
  evaluateTrailingStop,
  inStrategyWindow,
  isExcludedStock,
  type StrategyReason,
} from '../lib/strategy-engine.ts';
import type { KiwoomEnvironment } from '../lib/kiwoom-environment.ts';
import type { StrategyMarket } from '../lib/strategy-settings.ts';
import { sendTelegramNotification } from '../lib/telegram.ts';
import { readStoredNotificationPreferences } from '../lib/server/notification-preferences-store.ts';
import {
  fetchCompletedChartCandles,
  fetchHolding,
  fetchHoldings,
  fetchOpenOrders,
} from '../lib/server/kiwoom-portfolio.ts';
import {
  findUnknownSubmittedOrder,
  reconcileBrokerOrder,
} from '../lib/server/kiwoom-order-reconciler.ts';
import {
  KiwoomWebSocketManager,
  type KiwoomWebSocketState,
} from '../lib/server/kiwoom-websocket.ts';
import type { RealtimeEvent } from '../lib/server/kiwoom-realtime.ts';
import { submitCoordinatedSell } from '../lib/server/sell-coordinator.ts';
import { readStoredStrategySettings } from '../lib/server/strategy-settings-store.ts';
import {
  strategyRuntimeStore,
  type StrategyPosition,
} from '../lib/server/strategy-runtime.ts';

const owner = randomUUID();
const runtime = strategyRuntimeStore();
const chartChecks = new Map<string, number>();
const dryRunSignals = new Set<string>();
const holdingsCache = new Map<
  KiwoomEnvironment,
  Map<string, Awaited<ReturnType<typeof fetchHoldings>>[number]>
>();
const realtimeManagers = new Map<KiwoomEnvironment, KiwoomWebSocketManager>();
const realtimeState = new Map<KiwoomEnvironment, KiwoomWebSocketState>();
const realtimeReconciled = new Map<KiwoomEnvironment, boolean>();
const regularMarketOpen = new Map<KiwoomEnvironment, boolean>();
const freshPriceSymbols = new Map<KiwoomEnvironment, Set<string>>();
const symbolQueues = new Map<string, Promise<void>>();
let stopped = false;
let evaluating = false;
let reconciling = false;
const scheduledTimers = new Set<ReturnType<typeof setTimeout>>();

function environmentForMarket(market: StrategyMarket): KiwoomEnvironment {
  return market === 'domestic' ? 'domestic-mock' : 'overseas-mock';
}

async function evaluatePosition(
  environment: KiwoomEnvironment,
  market: StrategyMarket,
  holding: Awaited<ReturnType<typeof fetchHoldings>>[number],
  position: StrategyPosition,
  now: Date,
) {
  const { settings } = await readStoredStrategySettings();
  const reasons: StrategyReason[] = [];
  const slTp = settings.strategies.slTp[market];
  if (
    inStrategyWindow(market, slTp.startTime, slTp.endTime, now) &&
    !isExcludedStock(slTp.excludedStocks, holding.code, holding.market)
  ) {
    const reason = evaluateSlTp(slTp, holding.averagePrice, holding.currentPrice);
    if (reason) reasons.push(reason);
  }

  const trailing = settings.strategies.trailingStop[market];
  if (
    inStrategyWindow(market, trailing.startTime, trailing.endTime, now) &&
    !isExcludedStock(trailing.excludedStocks, holding.code, holding.market)
  ) {
    const result = evaluateTrailingStop(
      trailing,
      holding.averagePrice,
      holding.currentPrice,
      {
        active: position.trailingActive,
        highWaterPrice: position.highWaterPrice,
      },
    );
    if (
      result.active !== position.trailingActive ||
      result.highWaterPrice !== position.highWaterPrice
    )
      position = runtime.updatePositionStrategyState(position.positionKey, {
        trailingActive: result.active,
        highWaterPrice: result.highWaterPrice,
      });
    if (result.reason) reasons.push(result.reason);
  }

  const deadCross = settings.strategies.deadCross[market];
  if (
    inStrategyWindow(market, deadCross.startTime, deadCross.endTime, now) &&
    !isExcludedStock(deadCross.excludedStocks, holding.code, holding.market)
  ) {
    try {
      const checkKey = `${position.positionKey}:${deadCross.candle}`;
      const nextCheck = chartChecks.get(checkKey) ?? 0;
      if (Date.now() >= nextCheck) {
        chartChecks.set(checkKey, Date.now() + 60_000);
        const candles = await fetchCompletedChartCandles({
          environment,
          market: holding.market,
          strategyMarket: market,
          code: holding.code,
          candle: deadCross.candle,
          required: deadCross.longPeriod + 1,
          now,
        });
        if (candles.length >= deadCross.longPeriod + 1) {
          const latestKey = candles.at(-1)!.key;
          if (latestKey !== position.lastCandleKey) {
            const reason = evaluateDeadCross(deadCross, candles);
            position = runtime.updatePositionStrategyState(position.positionKey, {
              lastCandleKey: latestKey,
              ...(reason ? { lastTriggeredCandleKey: latestKey } : {}),
            });
            if (reason && position.lastTriggeredCandleKey === latestKey)
              reasons.push(reason);
          }
        } else {
          runtime.recordAudit(
            'dead_cross_insufficient_candles',
            { environment, market: holding.market, code: holding.code },
            { required: deadCross.longPeriod + 1, received: candles.length },
          );
        }
      }
    } catch {
      runtime.recordAudit(
        'dead_cross_evaluation_failed',
        { environment, market: holding.market, code: holding.code },
        {},
      );
      if (reasons.length === 0)
        runtime.recordAudit(
          'strategy_evaluation_deferred',
          { environment, market: holding.market, code: holding.code },
          { strategy: 'dead-cross' },
        );
    }
  }

  const uniqueReasons = [...new Set(reasons)];
  const dryRunKey = `${position.positionKey}:${uniqueReasons.sort().join(',')}`;
  if (uniqueReasons.length === 0) {
    for (const key of dryRunSignals)
      if (key.startsWith(`${position.positionKey}:`)) dryRunSignals.delete(key);
    return;
  }
  if (process.env.ENABLE_MOCK_STRATEGY_ORDERS !== 'true') {
    if (!dryRunSignals.has(dryRunKey)) {
      dryRunSignals.add(dryRunKey);
      runtime.recordAudit(
        'strategy_signal_dry_run',
        { environment, market: holding.market, code: holding.code },
        { reasons: uniqueReasons },
      );
    }
    return;
  }
  await submitCoordinatedSell({
    environment,
    market: holding.market,
    code: holding.code,
    source: 'strategy',
    reasons: uniqueReasons,
    runtime,
  });
}

function queueSymbol(key: string, task: () => Promise<void>) {
  const previous = symbolQueues.get(key) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(task)
    .catch(() => undefined)
    .finally(() => {
      if (symbolQueues.get(key) === next) symbolQueues.delete(key);
    });
  symbolQueues.set(key, next);
}

async function handleRealtimeEvent(
  environment: KiwoomEnvironment,
  market: StrategyMarket,
  event: RealtimeEvent,
) {
  if (event.kind === 'market-state') {
    regularMarketOpen.set(environment, event.state === '3');
    return;
  }
  if (event.kind === 'price') {
    if (market === 'overseas')
      regularMarketOpen.set(environment, event.regularSession === true);
    if (
      !regularMarketOpen.get(environment) ||
      !realtimeReconciled.get(environment)
    )
      return;
    const fresh = freshPriceSymbols.get(environment) ?? new Set<string>();
    fresh.add(event.code);
    freshPriceSymbols.set(environment, fresh);
    const holding = holdingsCache.get(environment)?.get(event.code);
    if (!holding) return;
    const updated = { ...holding, currentPrice: event.price };
    holdingsCache.get(environment)!.set(event.code, updated);
    const position = runtime.upsertPosition({
      environment,
      market: updated.market,
      code: updated.code,
      quantity: updated.quantity,
      availableQuantity: updated.availableQuantity,
      averagePrice: updated.averagePrice,
      trailingActive: false,
    });
    queueSymbol(position.positionKey, () =>
      evaluatePosition(environment, market, updated, position, new Date()),
    );
    return;
  }
  if (event.kind === 'order') {
    if (event.executionNo && event.filledQuantity && event.filledPrice)
      runtime.recordFill({
        environment,
        orderNo: event.orderNo,
        executionNo: event.executionNo,
        quantity: event.filledQuantity,
        price: event.filledPrice,
      });
    const known = runtime
      .listBlockingIntents(environment)
      .find((intent) => intent.orderNo === event.orderNo);
    if (!known && event.side === 'sell') {
      const holding = holdingsCache.get(environment)?.get(event.code);
      if (!holding) return;
      const position = runtime.upsertPosition({
        environment,
        market: holding.market,
        code: holding.code,
        quantity: holding.quantity,
        availableQuantity: holding.availableQuantity,
        averagePrice: holding.averagePrice,
        trailingActive: false,
      });
      const blocking = runtime.getBlockingIntentForSymbol(
        environment,
        holding.market,
        holding.code,
      );
      if (blocking && blocking.orderNo !== event.orderNo) {
        runtime.updateIntent(blocking.id, {
          state: 'needs_review',
          lastError: 'CONCURRENT_EXTERNAL_SELL_ORDER',
        });
        return;
      }
      const claim = runtime.claimSellIntent({
        positionKey: position.positionKey,
        environment,
        market: holding.market,
        code: holding.code,
        generation: position.generation,
        source: 'external',
        reasons: ['external-sell-order'],
      });
      if (claim.claimed)
        runtime.updateIntent(claim.intent.id, {
          state: 'accepted',
          orderNo: event.orderNo,
          orderedQuantity: event.orderedQuantity,
          filledQuantity: event.filledQuantity,
          remainingQuantity: event.remainingQuantity,
        });
    }
    void reconcileOrders();
    return;
  }
  if (event.kind === 'balance') void evaluateStrategies();
}

function ensureRealtimeManager(
  environment: KiwoomEnvironment,
  market: StrategyMarket,
) {
  const existing = realtimeManagers.get(environment);
  if (existing) return existing;
  const manager = new KiwoomWebSocketManager(environment, {
    onEvent: (event) => handleRealtimeEvent(environment, market, event),
    onState: (state) => {
      realtimeState.set(environment, state);
      runtime.setRuntimeStatus(`websocket:${environment}`, state);
      if (state !== 'ready') {
        regularMarketOpen.set(environment, false);
        realtimeReconciled.set(environment, false);
        freshPriceSymbols.delete(environment);
      }
      runtime.recordAudit('websocket_state', { environment }, { state });
      if (state === 'ready') void evaluateStrategies();
    },
  });
  realtimeManagers.set(environment, manager);
  manager.start();
  return manager;
}

function registerExternalOpenOrders(
  environment: KiwoomEnvironment,
  holdings: Awaited<ReturnType<typeof fetchHoldings>>,
  openOrders: Awaited<ReturnType<typeof fetchOpenOrders>>,
) {
  for (const order of openOrders) {
    if (order.side !== 'sell' || order.remainingQuantity <= 0) continue;
    const holding = holdings.find((item) => item.code === order.code);
    const previous = runtime.getLatestPosition(
      environment,
      order.market || holding?.market || '',
      order.code,
    );
    const market = order.market || holding?.market || previous?.market;
    if (!market) continue;
    const blocking = runtime.getBlockingIntentForSymbol(
      environment,
      market,
      order.code,
    );
    if (blocking?.orderNo === order.orderNo) continue;
    if (blocking) {
      runtime.updateIntent(blocking.id, {
        state: 'needs_review',
        lastError: 'CONCURRENT_EXTERNAL_SELL_ORDER',
      });
      continue;
    }
    const position = holding
      ? runtime.upsertPosition({
          environment,
          market,
          code: order.code,
          quantity: holding.quantity,
          availableQuantity: holding.availableQuantity,
          averagePrice: holding.averagePrice,
          trailingActive: false,
        })
      : previous;
    if (!position) continue;
    const external = runtime.claimSellIntent({
      positionKey: position.positionKey,
      environment,
      market,
      code: order.code,
      generation: position.generation,
      source: 'external',
      reasons: ['external-open-sell-order'],
    });
    if (external.claimed)
      runtime.updateIntent(external.intent.id, {
        state: 'accepted',
        orderNo: order.orderNo,
        orderedQuantity: order.orderedQuantity,
        filledQuantity: order.filledQuantity,
        remainingQuantity: order.remainingQuantity,
      });
  }
}

async function evaluateStrategies() {
  if (evaluating || stopped) return;
  evaluating = true;
  try {
    const lease = runtime.acquireLease('strategy-worker', owner, 30_000);
    if (!lease) return;
    runtime.setRuntimeStatus('worker', 'running');
    const { settings } = await readStoredStrategySettings();
    for (const market of ['domestic', 'overseas'] as const) {
      const enabled =
        settings.strategies.slTp[market].enabled ||
        settings.strategies.trailingStop[market].enabled ||
        settings.strategies.deadCross[market].enabled;
      if (!enabled) continue;
      const environment = environmentForMarket(market);
      try {
        const [holdings, openOrders] = await Promise.all([
          fetchHoldings(environment),
          fetchOpenOrders(environment),
        ]);
        holdingsCache.set(
          environment,
          new Map(holdings.map((holding) => [holding.code, holding])),
        );
        if (process.env.ENABLE_MOCK_STRATEGY_ORDERS === 'true' && holdings.length > 0)
          ensureRealtimeManager(environment, market).setSymbols(
            holdings.map((holding) => ({
              code: holding.code,
              market: holding.market,
            })),
          );
        registerExternalOpenOrders(environment, holdings, openOrders);
        if (realtimeState.get(environment) === 'ready')
          realtimeReconciled.set(environment, true);
        const currentPositionKeys = new Set(
          holdings.map((holding) => `${holding.market}:${holding.code}`),
        );
        for (const previous of runtime.listLatestOpenPositions(environment)) {
          if (currentPositionKeys.has(`${previous.market}:${previous.code}`))
            continue;
          const latestIntent = runtime.getLatestIntentForSymbol(
            environment,
            previous.market,
            previous.code,
          );
          const closedPosition = runtime.upsertPosition({
            environment,
            market: previous.market,
            code: previous.code,
            quantity: 0,
            availableQuantity: 0,
            averagePrice: previous.averagePrice,
            trailingActive: false,
          });
          const expectedAutomaticOrAppSell =
            latestIntent?.state === 'filled' &&
            latestIntent.generation === previous.generation;
          if (
            !expectedAutomaticOrAppSell &&
            !runtime.hasBlockingIntentForSymbol(
              environment,
              previous.market,
              previous.code,
            )
          ) {
            const external = runtime.claimSellIntent({
              positionKey: closedPosition.positionKey,
              environment,
              market: previous.market,
              code: previous.code,
              generation: closedPosition.generation,
              source: 'external',
              reasons: ['external-position-closed'],
            });
            if (external.claimed)
              runtime.updateIntent(external.intent.id, {
                state: 'needs_review',
                lastError: 'EXTERNAL_POSITION_CLOSED',
              });
          }
        }
        for (const holding of holdings) {
          const previous = runtime.getLatestPosition(
            environment,
            holding.market,
            holding.code,
          );
          const position = runtime.upsertPosition({
            environment,
            market: holding.market,
            code: holding.code,
            quantity: holding.quantity,
            availableQuantity: holding.availableQuantity,
            averagePrice: holding.averagePrice,
            trailingActive: false,
          });
          if (
            previous &&
            holding.quantity < previous.quantity &&
            !runtime.hasBlockingIntentForSymbol(
              environment,
              holding.market,
              holding.code,
            )
          ) {
            const external = runtime.claimSellIntent({
              positionKey: position.positionKey,
              environment,
              market: holding.market,
              code: holding.code,
              generation: position.generation,
              source: 'external',
              reasons: ['external-position-decrease'],
            });
            if (external.claimed)
              runtime.updateIntent(external.intent.id, {
                state: 'needs_review',
                lastError: 'EXTERNAL_POSITION_DECREASE',
              });
            continue;
          }
          const dryRun = process.env.ENABLE_MOCK_STRATEGY_ORDERS !== 'true';
          if (
            dryRun ||
            (realtimeState.get(environment) === 'ready' &&
              realtimeReconciled.get(environment) === true &&
              regularMarketOpen.get(environment) === true &&
              freshPriceSymbols.get(environment)?.has(holding.code) === true)
          )
            await evaluatePosition(environment, market, holding, position, new Date());
        }
        runtime.setRuntimeStatus(`environment:${environment}`, 'healthy');
      } catch {
        runtime.setRuntimeStatus(`environment:${environment}`, 'error');
        runtime.recordAudit('environment_evaluation_failed', { environment }, {});
      }
    }
  } finally {
    evaluating = false;
  }
}

async function reconcileOrders() {
  if (reconciling || stopped) return;
  reconciling = true;
  try {
    if (!runtime.acquireLease('strategy-worker', owner, 30_000)) return;
    for (const intent of runtime.listBlockingIntents()) {
      if (Date.now() - intent.createdAt >= 24 * 60 * 60_000) {
        runtime.updateIntent(intent.id, {
          state: 'needs_review',
          lastError: 'STATUS_TIMEOUT',
        });
        continue;
      }
      if (!intent.orderNo && intent.state === 'submission_unknown') {
        try {
          const orderNo = await findUnknownSubmittedOrder(intent);
          if (orderNo)
            runtime.updateIntent(intent.id, {
              state: 'accepted',
              orderNo,
              remainingQuantity: intent.orderedQuantity,
            });
        } catch {
          // 주문번호가 불명확한 동안 잠금을 유지하고 다음 주기에 다시 대조한다.
        }
        continue;
      }
      if (!intent.orderNo || !['accepted', 'partial', 'reconciling'].includes(intent.state))
        continue;
      try {
        const status = await reconcileBrokerOrder(intent);
        if (status.status === 'filled') {
          const holding = await fetchHolding(
            intent.environment,
            intent.market,
            intent.code,
          );
          if (holding && holding.quantity > 0) {
            runtime.updateIntent(intent.id, {
              state: 'needs_review',
              filledQuantity: status.filledQuantity,
              remainingQuantity: 0,
              lastError: 'POSITION_REMAINS_AFTER_FILL',
            });
          } else {
            runtime.updateIntent(intent.id, {
              state: 'filled',
              filledQuantity: status.filledQuantity,
              remainingQuantity: 0,
            });
            runtime.enqueueNotification(
              `sell-filled:${intent.environment}:${intent.orderNo}`,
              {
                type: 'sellFilled',
                environment: intent.environment,
                code: intent.code,
                market: intent.market,
                orderNo: intent.orderNo,
                quantity: status.filledQuantity ?? intent.orderedQuantity ?? 0,
                price: status.filledPrice ?? 0,
              },
            );
          }
        } else if (status.status === 'cancelled' || status.status === 'rejected') {
          runtime.updateIntent(intent.id, {
            state: 'needs_review',
            filledQuantity: status.filledQuantity,
            remainingQuantity: status.remainingQuantity,
            lastError:
              status.status === 'cancelled' ? 'ORDER_CANCELLED' : 'ORDER_REJECTED',
          });
        } else if (status.status === 'pending') {
          runtime.updateIntent(intent.id, {
            state: (status.filledQuantity ?? 0) > 0 ? 'partial' : 'accepted',
            filledQuantity: status.filledQuantity,
            remainingQuantity: status.remainingQuantity,
          });
        }
      } catch {
        runtime.updateIntent(intent.id, { state: 'reconciling' });
      }
    }
  } finally {
    reconciling = false;
  }
}

async function deliverNotifications() {
  for (const row of runtime.pendingNotifications()) {
    try {
      const payload = JSON.parse(row.payload_json);
      const result = await sendTelegramNotification(
        payload,
        await readStoredNotificationPreferences(),
      );
      if (result.sent || result.reason === 'disabled' || result.reason === 'not-configured')
        runtime.markNotificationSent(row.event_key);
      else runtime.markNotificationAttempt(row.event_key);
    } catch {
      runtime.markNotificationAttempt(row.event_key);
    }
  }
}

async function orderCycle() {
  await reconcileOrders();
  await deliverNotifications();
}

function schedule(task: () => Promise<void>, interval: number) {
  const run = async () => {
    if (stopped) return;
    try {
      await task();
    } finally {
      if (!stopped) {
        const timer = setTimeout(() => {
          scheduledTimers.delete(timer);
          void run();
        }, interval);
        scheduledTimers.add(timer);
      }
    }
  };
  void run();
}

function shutdown() {
  stopped = true;
  for (const timer of scheduledTimers) clearTimeout(timer);
  scheduledTimers.clear();
  for (const manager of realtimeManagers.values()) manager.stop();
  runtime.setRuntimeStatus('worker', 'stopped');
  runtime.close();
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
runtime.recordAudit('worker_started', {}, { realtime: 'rest-fallback' });
runtime.setRuntimeStatus('worker', 'running');
schedule(orderCycle, 5_000);
schedule(evaluateStrategies, 30_000);
