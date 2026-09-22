import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { KiwoomEnvironment } from '../kiwoom-environment.ts';
import { strategyDataPath } from './data-path.ts';

export type SellIntentState =
  | 'claimed'
  | 'preflight'
  | 'submitting'
  | 'submission_unknown'
  | 'accepted'
  | 'partial'
  | 'reconciling'
  | 'needs_review'
  | 'filled'
  | 'cancelled';

export type SellIntentSource = 'manual' | 'strategy' | 'external';

export type SellIntent = {
  id: string;
  positionKey: string;
  environment: KiwoomEnvironment;
  market: string;
  code: string;
  generation: number;
  source: SellIntentSource;
  idempotencyKey?: string;
  reasons: string[];
  state: SellIntentState;
  orderNo?: string;
  orderedQuantity?: number;
  filledQuantity: number;
  remainingQuantity?: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
};

export type StrategyPosition = {
  positionKey: string;
  environment: KiwoomEnvironment;
  market: string;
  code: string;
  generation: number;
  quantity: number;
  availableQuantity: number;
  averagePrice: number;
  highWaterPrice?: number;
  trailingActive: boolean;
  lastCandleKey?: string;
  lastTriggeredCandleKey?: string;
  updatedAt: number;
};

const blockingStates: SellIntentState[] = [
  'claimed',
  'preflight',
  'submitting',
  'submission_unknown',
  'accepted',
  'partial',
  'reconciling',
  'needs_review',
];

function jsonArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function optionalText(value: unknown) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : undefined;
}

function mapIntent(row: Record<string, unknown>): SellIntent {
  return {
    id: String(row.id),
    positionKey: String(row.position_key),
    environment: String(row.environment) as KiwoomEnvironment,
    market: String(row.market),
    code: String(row.code),
    generation: Number(row.generation),
    source: String(row.source) as SellIntentSource,
    ...(optionalText(row.idempotency_key)
      ? { idempotencyKey: optionalText(row.idempotency_key) }
      : {}),
    reasons: jsonArray(String(row.reasons_json)),
    state: String(row.state) as SellIntentState,
    ...(optionalText(row.order_no) ? { orderNo: optionalText(row.order_no) } : {}),
    ...(row.ordered_quantity === null
      ? {}
      : { orderedQuantity: Number(row.ordered_quantity) }),
    filledQuantity: Number(row.filled_quantity),
    ...(row.remaining_quantity === null
      ? {}
      : { remainingQuantity: Number(row.remaining_quantity) }),
    ...(optionalText(row.last_error) ? { lastError: optionalText(row.last_error) } : {}),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export class StrategyRuntimeStore {
  private readonly database: DatabaseSync;

  constructor(filePath = strategyDataPath('strategy-runtime.sqlite')) {
    if (filePath !== ':memory:')
      mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
    this.database = new DatabaseSync(filePath);
    this.database.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS sell_intents (
        id TEXT PRIMARY KEY,
        position_key TEXT NOT NULL,
        environment TEXT NOT NULL,
        market TEXT NOT NULL,
        code TEXT NOT NULL,
        generation INTEGER NOT NULL,
        source TEXT NOT NULL,
        idempotency_key TEXT,
        reasons_json TEXT NOT NULL,
        state TEXT NOT NULL,
        order_no TEXT,
        ordered_quantity INTEGER,
        filled_quantity INTEGER NOT NULL DEFAULT 0,
        remaining_quantity INTEGER,
        last_error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS one_blocking_sell_per_position
      ON sell_intents(position_key)
      WHERE state IN ('claimed','preflight','submitting','submission_unknown','accepted','partial','reconciling','needs_review');
      CREATE UNIQUE INDEX IF NOT EXISTS one_blocking_sell_per_symbol
      ON sell_intents(environment, market, code)
      WHERE state IN ('claimed','preflight','submitting','submission_unknown','accepted','partial','reconciling','needs_review');
      CREATE INDEX IF NOT EXISTS sell_intents_state ON sell_intents(state, updated_at);

      CREATE TABLE IF NOT EXISTS strategy_positions (
        position_key TEXT PRIMARY KEY,
        environment TEXT NOT NULL,
        market TEXT NOT NULL,
        code TEXT NOT NULL,
        generation INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        available_quantity INTEGER NOT NULL,
        average_price REAL NOT NULL,
        high_water_price REAL,
        trailing_active INTEGER NOT NULL DEFAULT 0,
        last_candle_key TEXT,
        last_triggered_candle_key TEXT,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS order_fills (
        environment TEXT NOT NULL,
        order_no TEXT NOT NULL,
        execution_no TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        price REAL NOT NULL,
        occurred_at INTEGER NOT NULL,
        PRIMARY KEY(environment, order_no, execution_no)
      );

      CREATE TABLE IF NOT EXISTS worker_leases (
        name TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        environment TEXT,
        market TEXT,
        code TEXT,
        intent_id TEXT,
        detail_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notification_outbox (
        event_key TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL,
        sent_at INTEGER,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS runtime_status (
        status_key TEXT PRIMARY KEY,
        status_value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    const intentColumns = this.database
      .prepare('PRAGMA table_info(sell_intents)')
      .all() as Array<{ name: string }>;
    if (!intentColumns.some((column) => column.name === 'idempotency_key'))
      this.database.exec('ALTER TABLE sell_intents ADD COLUMN idempotency_key TEXT;');
    this.database.exec(`CREATE UNIQUE INDEX IF NOT EXISTS sell_intents_idempotency
      ON sell_intents(idempotency_key) WHERE idempotency_key IS NOT NULL;`);
  }

  close() {
    this.database.close();
  }

  claimSellIntent(input: {
    positionKey: string;
    environment: KiwoomEnvironment;
    market: string;
    code: string;
    generation: number;
    source: SellIntentSource;
    idempotencyKey?: string;
    reasons: string[];
    now?: number;
  }) {
    const now = input.now ?? Date.now();
    const id = randomUUID();
    try {
      this.database
        .prepare(`INSERT INTO sell_intents
          (id, position_key, environment, market, code, generation, source, idempotency_key, reasons_json, state, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'claimed', ?, ?)`)
        .run(
          id,
          input.positionKey,
          input.environment,
          input.market,
          input.code,
          input.generation,
          input.source,
          input.idempotencyKey ?? null,
          JSON.stringify([...new Set(input.reasons)]),
          now,
          now,
        );
      this.addAudit('sell_intent_claimed', input, id, { reasons: input.reasons }, now);
      return { claimed: true as const, intent: this.getIntent(id)! };
    } catch (error) {
      if (String(error).includes('UNIQUE constraint failed')) {
        const idempotent = input.idempotencyKey
          ? this.getIntentByIdempotencyKey(input.idempotencyKey)
          : undefined;
        if (idempotent)
          return { claimed: false as const, intent: idempotent };
        const existing =
          this.getBlockingIntent(input.positionKey) ??
          this.getBlockingIntentForSymbol(
            input.environment,
            input.market,
            input.code,
          );
        if (existing) {
          const reasons = [...new Set([...existing.reasons, ...input.reasons])];
          this.database
            .prepare('UPDATE sell_intents SET reasons_json = ?, updated_at = ? WHERE id = ?')
            .run(JSON.stringify(reasons), now, existing.id);
          this.addAudit('sell_signal_suppressed', input, existing.id, { reasons: input.reasons }, now);
          return { claimed: false as const, intent: { ...existing, reasons } };
        }
      }
      throw error;
    }
  }

  getIntent(id: string) {
    const row = this.database
      .prepare('SELECT * FROM sell_intents WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    return row ? mapIntent(row) : undefined;
  }

  getIntentByIdempotencyKey(idempotencyKey: string) {
    const row = this.database
      .prepare('SELECT * FROM sell_intents WHERE idempotency_key = ?')
      .get(idempotencyKey) as Record<string, unknown> | undefined;
    return row ? mapIntent(row) : undefined;
  }

  getBlockingIntent(positionKey: string) {
    const placeholders = blockingStates.map(() => '?').join(',');
    const row = this.database
      .prepare(`SELECT * FROM sell_intents WHERE position_key = ? AND state IN (${placeholders}) ORDER BY created_at DESC LIMIT 1`)
      .get(positionKey, ...blockingStates) as Record<string, unknown> | undefined;
    return row ? mapIntent(row) : undefined;
  }

  hasBlockingIntentForSymbol(environment: KiwoomEnvironment, market: string, code: string) {
    return Boolean(this.getBlockingIntentForSymbol(environment, market, code));
  }

  getBlockingIntentForSymbol(
    environment: KiwoomEnvironment,
    market: string,
    code: string,
  ) {
    const placeholders = blockingStates.map(() => '?').join(',');
    const row = this.database
      .prepare(`SELECT * FROM sell_intents WHERE environment = ? AND market = ? AND code = ? AND state IN (${placeholders}) ORDER BY created_at DESC LIMIT 1`)
      .get(environment, market, code, ...blockingStates) as
      | Record<string, unknown>
      | undefined;
    return row ? mapIntent(row) : undefined;
  }

  getLatestIntentForSymbol(
    environment: KiwoomEnvironment,
    market: string,
    code: string,
  ) {
    const row = this.database
      .prepare(`SELECT * FROM sell_intents
        WHERE environment = ? AND market = ? AND code = ?
        ORDER BY created_at DESC LIMIT 1`)
      .get(environment, market, code) as Record<string, unknown> | undefined;
    return row ? mapIntent(row) : undefined;
  }

  updateIntent(
    id: string,
    patch: {
      state: SellIntentState;
      orderNo?: string;
      orderedQuantity?: number;
      filledQuantity?: number;
      remainingQuantity?: number;
      lastError?: string;
    },
    now = Date.now(),
  ) {
    const current = this.getIntent(id);
    if (!current) throw new Error('SELL_INTENT_NOT_FOUND');
    this.database
      .prepare(`UPDATE sell_intents SET
        state = ?, order_no = ?, ordered_quantity = ?, filled_quantity = ?, remaining_quantity = ?, last_error = ?, updated_at = ?
        WHERE id = ?`)
      .run(
        patch.state,
        patch.orderNo ?? current.orderNo ?? null,
        patch.orderedQuantity ?? current.orderedQuantity ?? null,
        patch.filledQuantity ?? current.filledQuantity,
        patch.remainingQuantity ?? current.remainingQuantity ?? null,
        patch.lastError ?? current.lastError ?? null,
        now,
        id,
      );
    this.addAudit('sell_intent_state', current, id, { state: patch.state }, now);
    return this.getIntent(id)!;
  }

  listBlockingIntents(environment?: KiwoomEnvironment) {
    const placeholders = blockingStates.map(() => '?').join(',');
    const rows = (environment
      ? this.database
          .prepare(`SELECT * FROM sell_intents WHERE environment = ? AND state IN (${placeholders}) ORDER BY updated_at DESC`)
          .all(environment, ...blockingStates)
      : this.database
          .prepare(`SELECT * FROM sell_intents WHERE state IN (${placeholders}) ORDER BY updated_at DESC`)
          .all(...blockingStates)) as Record<string, unknown>[];
    return rows.map(mapIntent);
  }

  listRecentIntents(limit = 100) {
    const rows = this.database
      .prepare('SELECT * FROM sell_intents ORDER BY updated_at DESC LIMIT ?')
      .all(limit) as Record<string, unknown>[];
    return rows.map(mapIntent);
  }

  resumeIntent(id: string, now = Date.now()) {
    const current = this.getIntent(id);
    if (!current || current.state !== 'needs_review') return false;
    this.updateIntent(id, { state: 'cancelled', lastError: undefined }, now);
    this.addAudit('sell_intent_resumed', current, id, {}, now);
    return true;
  }

  recordFill(input: {
    environment: KiwoomEnvironment;
    orderNo: string;
    executionNo: string;
    quantity: number;
    price: number;
    occurredAt?: number;
  }) {
    const result = this.database
      .prepare(`INSERT OR IGNORE INTO order_fills
        (environment, order_no, execution_no, quantity, price, occurred_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
      .run(
        input.environment,
        input.orderNo,
        input.executionNo,
        input.quantity,
        input.price,
        input.occurredAt ?? Date.now(),
      );
    return result.changes === 1;
  }

  upsertPosition(input: Omit<StrategyPosition, 'positionKey' | 'generation' | 'updatedAt'> & { now?: number }) {
    const baseKey = `${input.environment}:${input.market}:${input.code}`;
    const previous = this.database
      .prepare('SELECT * FROM strategy_positions WHERE position_key LIKE ? ORDER BY generation DESC LIMIT 1')
      .get(`${baseKey}:%`) as Record<string, unknown> | undefined;
    let generation = previous ? Number(previous.generation) : 1;
    const previousQuantity = previous ? Number(previous.quantity) : 0;
    const previousAverage = previous ? Number(previous.average_price) : 0;
    if (
      previous &&
      ((previousQuantity === 0 && input.quantity > 0) ||
        input.quantity > previousQuantity ||
        (input.quantity > 0 && previousAverage !== input.averagePrice))
    )
      generation += 1;
    const positionKey = `${baseKey}:${generation}`;
    const now = input.now ?? Date.now();
    this.database
      .prepare(`INSERT INTO strategy_positions
        (position_key, environment, market, code, generation, quantity, available_quantity, average_price, high_water_price, trailing_active, last_candle_key, last_triggered_candle_key, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, NULL, NULL, ?)
        ON CONFLICT(position_key) DO UPDATE SET
          quantity = excluded.quantity,
          available_quantity = excluded.available_quantity,
          average_price = excluded.average_price,
          updated_at = excluded.updated_at`)
      .run(
        positionKey,
        input.environment,
        input.market,
        input.code,
        generation,
        input.quantity,
        input.availableQuantity,
        input.averagePrice,
        now,
      );
    return this.getPosition(positionKey)!;
  }

  getPosition(positionKey: string): StrategyPosition | undefined {
    const row = this.database
      .prepare('SELECT * FROM strategy_positions WHERE position_key = ?')
      .get(positionKey) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      positionKey: String(row.position_key),
      environment: String(row.environment) as KiwoomEnvironment,
      market: String(row.market),
      code: String(row.code),
      generation: Number(row.generation),
      quantity: Number(row.quantity),
      availableQuantity: Number(row.available_quantity),
      averagePrice: Number(row.average_price),
      ...(row.high_water_price === null ? {} : { highWaterPrice: Number(row.high_water_price) }),
      trailingActive: Boolean(row.trailing_active),
      ...(optionalText(row.last_candle_key)
        ? { lastCandleKey: optionalText(row.last_candle_key) }
        : {}),
      ...(optionalText(row.last_triggered_candle_key)
        ? { lastTriggeredCandleKey: optionalText(row.last_triggered_candle_key) }
        : {}),
      updatedAt: Number(row.updated_at),
    };
  }

  getLatestPosition(
    environment: KiwoomEnvironment,
    market: string,
    code: string,
  ) {
    const row = this.database
      .prepare(`SELECT position_key FROM strategy_positions
        WHERE environment = ? AND market = ? AND code = ?
        ORDER BY generation DESC LIMIT 1`)
      .get(environment, market, code) as { position_key: string } | undefined;
    return row ? this.getPosition(row.position_key) : undefined;
  }

  listLatestOpenPositions(environment: KiwoomEnvironment) {
    const rows = this.database
      .prepare(`SELECT current.position_key
        FROM strategy_positions AS current
        INNER JOIN (
          SELECT environment, market, code, MAX(generation) AS generation
          FROM strategy_positions
          WHERE environment = ?
          GROUP BY environment, market, code
        ) AS latest
          ON current.environment = latest.environment
          AND current.market = latest.market
          AND current.code = latest.code
          AND current.generation = latest.generation
        WHERE current.quantity > 0`)
      .all(environment) as Array<{ position_key: string }>;
    return rows
      .map((row) => this.getPosition(row.position_key))
      .filter((position): position is StrategyPosition => Boolean(position));
  }

  updatePositionStrategyState(
    positionKey: string,
    patch: {
      highWaterPrice?: number;
      trailingActive?: boolean;
      lastCandleKey?: string;
      lastTriggeredCandleKey?: string;
    },
    now = Date.now(),
  ) {
    const position = this.getPosition(positionKey);
    if (!position) throw new Error('POSITION_NOT_FOUND');
    this.database
      .prepare(`UPDATE strategy_positions SET
        high_water_price = ?, trailing_active = ?, last_candle_key = ?, last_triggered_candle_key = ?, updated_at = ?
        WHERE position_key = ?`)
      .run(
        patch.highWaterPrice ?? position.highWaterPrice ?? null,
        (patch.trailingActive ?? position.trailingActive) ? 1 : 0,
        patch.lastCandleKey ?? position.lastCandleKey ?? null,
        patch.lastTriggeredCandleKey ?? position.lastTriggeredCandleKey ?? null,
        now,
        positionKey,
      );
    return this.getPosition(positionKey)!;
  }

  acquireLease(name: string, owner: string, ttlMs: number, now = Date.now()) {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const existing = this.database
        .prepare('SELECT owner, expires_at FROM worker_leases WHERE name = ?')
        .get(name) as { owner: string; expires_at: number } | undefined;
      if (existing && existing.owner !== owner && existing.expires_at > now) {
        this.database.exec('ROLLBACK');
        return false;
      }
      this.database
        .prepare(`INSERT INTO worker_leases(name, owner, expires_at) VALUES (?, ?, ?)
          ON CONFLICT(name) DO UPDATE SET owner = excluded.owner, expires_at = excluded.expires_at`)
        .run(name, owner, now + ttlMs);
      this.database.exec('COMMIT');
      return true;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  enqueueNotification(eventKey: string, payload: unknown, now = Date.now()) {
    const result = this.database
      .prepare(`INSERT OR IGNORE INTO notification_outbox(event_key, payload_json, created_at)
        VALUES (?, ?, ?)`)
      .run(eventKey, JSON.stringify(payload), now);
    return result.changes === 1;
  }

  pendingNotifications(limit = 20) {
    return this.database
      .prepare(`SELECT event_key, payload_json, attempts, created_at
        FROM notification_outbox WHERE sent_at IS NULL AND attempts < 10 ORDER BY created_at LIMIT ?`)
      .all(limit) as Array<{
      event_key: string;
      payload_json: string;
      attempts: number;
      created_at: number;
    }>;
  }

  markNotificationSent(eventKey: string, sentAt = Date.now()) {
    this.database
      .prepare('UPDATE notification_outbox SET sent_at = ? WHERE event_key = ? AND sent_at IS NULL')
      .run(sentAt, eventKey);
  }

  markNotificationAttempt(eventKey: string) {
    this.database
      .prepare('UPDATE notification_outbox SET attempts = attempts + 1 WHERE event_key = ? AND sent_at IS NULL')
      .run(eventKey);
  }

  recordAudit(
    eventType: string,
    context: Partial<{ environment: string; market: string; code: string }>,
    detail: unknown,
    now = Date.now(),
  ) {
    this.addAudit(eventType, context, undefined, detail, now);
  }

  setRuntimeStatus(key: string, value: string, now = Date.now()) {
    this.database
      .prepare(`INSERT INTO runtime_status(status_key, status_value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(status_key) DO UPDATE SET status_value = excluded.status_value, updated_at = excluded.updated_at`)
      .run(key, value, now);
  }

  runtimeStatuses() {
    return this.database
      .prepare('SELECT status_key, status_value, updated_at FROM runtime_status ORDER BY status_key')
      .all() as Array<{
      status_key: string;
      status_value: string;
      updated_at: number;
    }>;
  }

  private addAudit(
    eventType: string,
    context: Partial<{ environment: string; market: string; code: string }>,
    intentId: string | undefined,
    detail: unknown,
    now: number,
  ) {
    this.database
      .prepare(`INSERT INTO audit_events
        (event_type, environment, market, code, intent_id, detail_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(
        eventType,
        context.environment ?? null,
        context.market ?? null,
        context.code ?? null,
        intentId ?? null,
        JSON.stringify(detail),
        now,
      );
  }
}

let singleton: StrategyRuntimeStore | undefined;

export function strategyRuntimeStore() {
  singleton ??= new StrategyRuntimeStore();
  return singleton;
}
