import {
  isDomestic,
  isLive,
  type KiwoomEnvironment,
} from '../kiwoom-environment.ts';
import {
  clearKiwoomToken,
  getKiwoomToken,
  kiwoomNumber,
  kiwoomText,
  overseasMarketCode,
} from './kiwoom-client.ts';
import {
  parseKiwoomRealtimeMessage,
  RealtimeEventDeduplicator,
  type RealtimeEvent,
} from './kiwoom-realtime.ts';

export type KiwoomWebSocketState =
  | 'stopped'
  | 'connecting'
  | 'authenticating'
  | 'subscribing'
  | 'ready'
  | 'backoff';

export type KiwoomWebSocketSymbol = {
  code: string;
  market: string;
};

type WebSocketLike = Pick<
  WebSocket,
  'readyState' | 'send' | 'close' | 'addEventListener'
>;

const OPEN = 1;

function websocketUrl(environment: KiwoomEnvironment) {
  const host = isLive(environment) ? 'api.kiwoom.com' : 'mockapi.kiwoom.com';
  return `wss://${host}:10000/api/${isDomestic(environment) ? 'dostk' : 'us'}/websocket`;
}

export class KiwoomWebSocketManager {
  private socket?: WebSocketLike;
  private symbols: KiwoomWebSocketSymbol[] = [];
  private state: KiwoomWebSocketState = 'stopped';
  private reconnectAttempt = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private registrationResponses = 0;
  private readonly deduplicator = new RealtimeEventDeduplicator();
  private readonly environment: KiwoomEnvironment;
  private readonly handlers: {
    onEvent: (event: RealtimeEvent) => void | Promise<void>;
    onState?: (state: KiwoomWebSocketState) => void;
  };
  private readonly createSocket: (url: string) => WebSocketLike;
  private readonly tokenProvider: (
    environment: KiwoomEnvironment,
  ) => Promise<string>;

  constructor(
    environment: KiwoomEnvironment,
    handlers: {
      onEvent: (event: RealtimeEvent) => void | Promise<void>;
      onState?: (state: KiwoomWebSocketState) => void;
    },
    createSocket: (url: string) => WebSocketLike = (url) =>
      new WebSocket(url),
    tokenProvider: (environment: KiwoomEnvironment) => Promise<string> =
      getKiwoomToken,
  ) {
    this.environment = environment;
    this.handlers = handlers;
    this.createSocket = createSocket;
    this.tokenProvider = tokenProvider;
  }

  currentState() {
    return this.state;
  }

  setSymbols(symbols: Array<string | KiwoomWebSocketSymbol>) {
    const unique = new Map<string, KiwoomWebSocketSymbol>();
    for (const symbol of symbols) {
      const normalized =
        typeof symbol === 'string'
          ? { code: symbol, market: isDomestic(this.environment) ? 'KRX' : '' }
          : symbol;
      if (!normalized.code) continue;
      unique.set(`${normalized.market}:${normalized.code}`, normalized);
    }
    const next = [...unique.values()].sort((left, right) =>
      `${left.market}:${left.code}`.localeCompare(`${right.market}:${right.code}`),
    );
    if (JSON.stringify(next) === JSON.stringify(this.symbols)) return;
    this.symbols = next;
    if (this.state === 'ready') this.sendRegistrations();
  }

  start() {
    if (this.state !== 'stopped') return;
    void this.connect();
  }

  stop() {
    this.generation += 1;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = undefined;
    this.setState('stopped');
  }

  private setState(state: KiwoomWebSocketState) {
    this.state = state;
    this.handlers.onState?.(state);
  }

  private async connect() {
    const generation = ++this.generation;
    this.setState('connecting');
    try {
      const token = await this.tokenProvider(this.environment);
      if (generation !== this.generation) return;
      const socket = this.createSocket(websocketUrl(this.environment));
      this.socket = socket;
      socket.addEventListener('open', () => {
        if (generation !== this.generation) return;
        this.setState('authenticating');
        this.send({ trnm: 'LOGIN', token });
      });
      socket.addEventListener('message', (event) => {
        if (generation !== this.generation) return;
        void this.receive(String((event as MessageEvent).data));
      });
      socket.addEventListener('error', () => {
        if (generation === this.generation) this.scheduleReconnect();
      });
      socket.addEventListener('close', () => {
        if (generation === this.generation && this.state !== 'stopped')
          this.scheduleReconnect();
      });
    } catch {
      if (generation === this.generation) this.scheduleReconnect();
    }
  }

  private async receive(raw: string) {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    const trnm = kiwoomText(message.trnm);
    if (trnm === 'PING') {
      this.send(message);
      return;
    }
    if (trnm === 'LOGIN') {
      if (kiwoomNumber(message.return_code) !== 0) {
        clearKiwoomToken(this.environment);
        this.socket?.close();
        this.scheduleReconnect();
        return;
      }
      this.reconnectAttempt = 0;
      this.sendRegistrations();
      return;
    }
    if (trnm === 'REG') {
      if (kiwoomNumber(message.return_code) !== 0) {
        this.socket?.close();
        this.scheduleReconnect();
        return;
      }
      this.registrationResponses += 1;
      if (this.registrationResponses >= 2) this.setState('ready');
      return;
    }
    for (const event of parseKiwoomRealtimeMessage(message)) {
      if (this.deduplicator.accept(event)) await this.handlers.onEvent(event);
    }
  }

  private sendRegistrations() {
    if (!this.socket || this.socket.readyState !== OPEN) return;
    this.registrationResponses = 0;
    this.setState('subscribing');
    if (isDomestic(this.environment)) {
      this.send({
        trnm: 'REG',
        grp_no: '1001',
        refresh: '0',
        data: [{ item: this.symbols.map((symbol) => symbol.code), type: ['0B'] }],
      });
      this.send({
        trnm: 'REG',
        grp_no: '1002',
        refresh: '0',
        data: [{ item: [''], type: ['00', '04', '0s'] }],
      });
    } else {
      const overseasItems = this.symbols.flatMap((symbol) => {
        const stexTp = overseasMarketCode(symbol.market);
        return stexTp ? [{ jmcode: symbol.code, stex_tp: stexTp }] : [];
      });
      this.send({
        trnm: 'REG',
        grp_no: '2001',
        refresh: '0',
        data: [{ item: overseasItems, type: ['FE'] }],
      });
      this.send({
        trnm: 'REG',
        grp_no: '2002',
        refresh: '0',
        data: [{ item: overseasItems, type: ['F4', 'F5'] }],
      });
    }
  }

  private send(value: unknown) {
    if (this.socket?.readyState === OPEN)
      this.socket.send(JSON.stringify(value));
  }

  private scheduleReconnect() {
    if (this.state === 'stopped' || this.state === 'backoff') return;
    this.socket?.close();
    this.socket = undefined;
    this.setState('backoff');
    const base = Math.min(30_000, 1_000 * 2 ** this.reconnectAttempt++);
    const delay = base + Math.floor(Math.random() * Math.max(250, base / 4));
    this.reconnectTimer = setTimeout(() => {
      if (this.state === 'backoff') void this.connect();
    }, delay);
    this.reconnectTimer.unref?.();
  }
}
