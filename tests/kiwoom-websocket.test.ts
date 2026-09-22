import assert from 'node:assert/strict';
import test from 'node:test';
import { KiwoomWebSocketManager } from '../lib/server/kiwoom-websocket.ts';

class FakeSocket {
  readyState = 0;
  sent: string[] = [];
  private listeners = new Map<string, Array<(event: unknown) => void>>();

  addEventListener(type: string, listener: (event: unknown) => void) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  send(value: string) {
    this.sent.push(value);
  }

  close() {
    this.readyState = 3;
  }

  emit(type: string, event: unknown = {}) {
    if (type === 'open') this.readyState = 1;
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

void test('공식 LOGIN, REG, PING 흐름 뒤에만 웹소켓을 ready로 표시한다', async () => {
  const socket = new FakeSocket();
  const states: string[] = [];
  const manager = new KiwoomWebSocketManager(
    'domestic-mock',
    { onEvent() {}, onState: (state) => states.push(state) },
    () => socket as unknown as WebSocket,
    async () => 'server-only-token',
  );
  manager.setSymbols(['005930']);
  manager.start();
  await new Promise((resolve) => setImmediate(resolve));
  socket.emit('open');
  assert.deepEqual(JSON.parse(socket.sent[0]), {
    trnm: 'LOGIN',
    token: 'server-only-token',
  });
  socket.emit('message', {
    data: JSON.stringify({ trnm: 'LOGIN', return_code: 0 }),
  });
  assert.equal(JSON.parse(socket.sent[1]).grp_no, '1001');
  assert.equal(JSON.parse(socket.sent[2]).grp_no, '1002');
  socket.emit('message', {
    data: JSON.stringify({ trnm: 'REG', return_code: 0 }),
  });
  socket.emit('message', {
    data: JSON.stringify({ trnm: 'REG', return_code: 0 }),
  });
  assert.equal(manager.currentState(), 'ready');
  socket.emit('message', {
    data: JSON.stringify({ trnm: 'PING', timestamp: '1' }),
  });
  assert.deepEqual(JSON.parse(socket.sent.at(-1)!), {
    trnm: 'PING',
    timestamp: '1',
  });
  assert.equal(states.includes('authenticating'), true);
  manager.stop();
});

void test('미국 실시간 등록은 명세의 종목·거래소 객체 형식을 사용한다', async () => {
  const socket = new FakeSocket();
  const manager = new KiwoomWebSocketManager(
    'overseas-mock',
    { onEvent() {} },
    () => socket as unknown as WebSocket,
    async () => 'server-only-token',
  );
  manager.setSymbols([{ code: 'NVDA', market: 'NASDAQ' }]);
  manager.start();
  await new Promise((resolve) => setImmediate(resolve));
  socket.emit('open');
  socket.emit('message', {
    data: JSON.stringify({ trnm: 'LOGIN', return_code: 0 }),
  });
  const priceRegistration = JSON.parse(socket.sent[1]);
  const orderRegistration = JSON.parse(socket.sent[2]);
  assert.deepEqual(priceRegistration.data, [
    { item: [{ jmcode: 'NVDA', stex_tp: 'ND' }], type: ['FE'] },
  ]);
  assert.deepEqual(orderRegistration.data, [
    { item: [{ jmcode: 'NVDA', stex_tp: 'ND' }], type: ['F4', 'F5'] },
  ]);
  manager.stop();
});
