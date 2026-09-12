import type { OrderStatus, TrackedOrder } from '@/lib/kiwoom-order-status';

export const ORDER_MONITOR_INTERVAL_MS = 5_000;
export const ORDER_MONITOR_DURATION_MS = 24 * 60 * 60_000;

type Monitor = {
  expiresAt: number;
  running: boolean;
  terminal: boolean;
  timer?: ReturnType<typeof setTimeout>;
};

const monitors = new Map<string, Monitor>();

export function orderMonitorKey(order: TrackedOrder) {
  return `${order.environment}:${order.side}:${order.orderNo}`;
}

function discardExpired(now: number) {
  for (const [key, monitor] of monitors) if (monitor.expiresAt <= now) monitors.delete(key);
}

export function startOrderMonitor(
  order: TrackedOrder,
  checkStatus: (order: TrackedOrder) => Promise<OrderStatus>,
  onFilled: (order: TrackedOrder, status: OrderStatus) => Promise<void>,
  options: { intervalMs?: number; durationMs?: number; now?: () => number } = {},
) {
  const intervalMs = options.intervalMs ?? ORDER_MONITOR_INTERVAL_MS;
  const durationMs = options.durationMs ?? ORDER_MONITOR_DURATION_MS;
  const now = options.now ?? Date.now;
  discardExpired(now());
  const key = orderMonitorKey(order);
  if (monitors.has(key)) return false;

  const monitor: Monitor = { expiresAt: now() + durationMs, running: false, terminal: false };
  monitors.set(key, monitor);

  const schedule = () => {
    if (monitor.terminal || now() >= monitor.expiresAt) return;
    monitor.timer = setTimeout(poll, intervalMs);
    monitor.timer.unref?.();
  };
  const poll = async () => {
    if (monitor.running || monitor.terminal || now() >= monitor.expiresAt) return;
    monitor.running = true;
    try {
      const status = await checkStatus(order);
      if (status.status === 'filled') {
        monitor.terminal = true;
        await onFilled(order, status);
        return;
      }
      if (status.status === 'cancelled' || status.status === 'rejected') {
        monitor.terminal = true;
        return;
      }
    } catch {
      // 일시적인 조회 실패는 다음 5초 주기에서 다시 시도한다.
    } finally {
      monitor.running = false;
    }
    schedule();
  };

  schedule();
  return true;
}

export function stopOrderMonitor(order: TrackedOrder) {
  const monitor = monitors.get(orderMonitorKey(order));
  if (!monitor) return false;
  monitor.terminal = true;
  if (monitor.timer) clearTimeout(monitor.timer);
  monitors.delete(orderMonitorKey(order));
  return true;
}
