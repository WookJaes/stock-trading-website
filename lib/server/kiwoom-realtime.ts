import { kiwoomNumber, kiwoomText } from './kiwoom-client.ts';

export type RealtimeEvent =
  | {
      kind: 'price';
      market: 'domestic' | 'overseas';
      code: string;
      price: number;
      occurredAt: string;
      regularSession?: boolean;
    }
  | {
      kind: 'order';
      market: 'domestic' | 'overseas';
      code: string;
      orderNo: string;
      side: 'buy' | 'sell';
      state: string;
      orderedQuantity: number;
      remainingQuantity: number;
      executionNo?: string;
      filledQuantity?: number;
      filledPrice?: number;
    }
  | {
      kind: 'balance';
      market: 'domestic' | 'overseas';
      code: string;
      quantity: number;
      availableQuantity?: number;
      averagePrice: number;
    }
  | {
      kind: 'market-state';
      market: 'domestic';
      state: string;
      occurredAt: string;
    };

function normalizeCode(value: unknown) {
  return kiwoomText(value).replace(/^[AJQ]/, '');
}

export function parseKiwoomRealtimeMessage(value: unknown): RealtimeEvent[] {
  if (!value || typeof value !== 'object') return [];
  const message = value as Record<string, unknown>;
  if (message.trnm !== 'REAL' || !Array.isArray(message.data)) return [];
  const events: RealtimeEvent[] = [];
  for (const raw of message.data) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const type = kiwoomText(item.type);
    const code = normalizeCode(item.item);
    const values =
      item.values && typeof item.values === 'object'
        ? (item.values as Record<string, unknown>)
        : {};
    if (type === '0B') {
      const price = Math.abs(kiwoomNumber(values['10']));
      const occurredAt = kiwoomText(values['20']);
      if (code && price > 0 && /^\d{6}$/.test(occurredAt))
        events.push({
          kind: 'price',
          market: 'domestic',
          code,
          price,
          occurredAt,
        });
    } else if (type === 'FE') {
      const price = Math.abs(kiwoomNumber(values['10']));
      if (code && price > 0)
        events.push({
          kind: 'price',
          market: 'overseas',
          code,
          price,
          occurredAt:
            kiwoomText(values['51020']) || kiwoomText(values['20']),
          regularSession: kiwoomText(values['290']) === '0',
        });
    } else if (type === '00' || type === 'F4' || type === 'F5') {
      const orderNo = kiwoomText(values['9203']);
      const sideValue = kiwoomText(values['907']);
      if (!code || !orderNo) continue;
      const overseas = type.startsWith('F');
      events.push({
        kind: 'order',
        market: overseas ? 'overseas' : 'domestic',
        code,
        orderNo,
        side:
          sideValue === '1' || sideValue === '01' ? 'sell' : 'buy',
        state: kiwoomText(values['913']),
        orderedQuantity: kiwoomNumber(values['900']),
        remainingQuantity: kiwoomNumber(values['902']),
        ...(kiwoomText(values['909'])
          ? { executionNo: kiwoomText(values['909']) }
          : {}),
        ...(kiwoomNumber(values['911']) > 0
          ? { filledQuantity: kiwoomNumber(values['911']) }
          : {}),
        ...(kiwoomNumber(values['910']) > 0
          ? { filledPrice: kiwoomNumber(values['910']) }
          : {}),
      });
      if (type === 'F5' && kiwoomNumber(values['930']) >= 0)
        events.push({
          kind: 'balance',
          market: 'overseas',
          code,
          quantity: kiwoomNumber(values['930']),
          averagePrice: kiwoomNumber(values['931']),
        });
    } else if (type === '04') {
      if (!code) continue;
      events.push({
        kind: 'balance',
        market: 'domestic',
        code,
        quantity: kiwoomNumber(values['930']),
        availableQuantity: kiwoomNumber(values['933']),
        averagePrice: kiwoomNumber(values['931']),
      });
    } else if (type === '0s') {
      events.push({
        kind: 'market-state',
        market: 'domestic',
        state: kiwoomText(values['215']),
        occurredAt: kiwoomText(values['20']),
      });
    }
  }
  return events;
}

export class RealtimeEventDeduplicator {
  private readonly seenExecutions = new Set<string>();
  private readonly latestPrices = new Map<
    string,
    { occurredAt: string; receivedDay: string }
  >();
  private readonly now: () => Date;

  constructor(now: () => Date = () => new Date()) {
    this.now = now;
  }

  accept(event: RealtimeEvent) {
    if (event.kind === 'order' && event.executionNo) {
      const key = `${event.market}:${event.orderNo}:${event.executionNo}`;
      if (this.seenExecutions.has(key)) return false;
      this.seenExecutions.add(key);
      return true;
    }
    if (event.kind === 'price') {
      const key = `${event.market}:${event.code}`;
      const previous = this.latestPrices.get(key);
      const receivedDay = new Intl.DateTimeFormat('en-CA', {
        timeZone:
          event.market === 'domestic' ? 'Asia/Seoul' : 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(this.now());
      if (
        previous?.receivedDay === receivedDay &&
        event.occurredAt &&
        event.occurredAt < previous.occurredAt
      )
        return false;
      if (event.occurredAt)
        this.latestPrices.set(key, { occurredAt: event.occurredAt, receivedDay });
    }
    return true;
  }
}

export class SharedSubscriptionRegistry {
  private readonly references = new Map<string, Set<string>>();

  subscribe(consumer: string, keys: string[]) {
    for (const key of keys) {
      const consumers = this.references.get(key) ?? new Set<string>();
      consumers.add(consumer);
      this.references.set(key, consumers);
    }
  }

  unsubscribe(consumer: string) {
    for (const [key, consumers] of this.references) {
      consumers.delete(consumer);
      if (consumers.size === 0) this.references.delete(key);
    }
  }

  keys() {
    return [...this.references.keys()].sort();
  }
}
