import assert from 'node:assert/strict';
import test from 'node:test';
import { createSession, verifyPassword, verifySession } from '../lib/auth.ts';
import { clearAllLoginFailures, clearLoginFailures, loginLimit, recordLoginFailure } from '../lib/login-rate-limit.ts';

await test('비밀번호를 일정 시간 비교 방식으로 검증한다', async () => {
  process.env.PASSWORD = 'test-password';
  assert.equal(await verifyPassword('test-password'), true);
  assert.equal(await verifyPassword('wrong-password'), false);
});

await test('서명된 세션의 변조와 만료를 거부한다', async () => {
  process.env.PASSWORD = 'test-password';
  process.env.SESSION_SECRET = 'test-session-secret-with-enough-entropy';
  const now = Date.now();
  const session = await createSession(now);
  assert.equal(await verifySession(session, now), true);
  assert.equal(await verifySession(`${session.slice(0, -1)}x`, now), false);
  assert.equal(await verifySession(session, now + 8 * 60 * 60 * 1000 + 1), false);
});

await test('IP별 로그인 실패를 15분 동안 5회로 제한한다', () => {
  clearAllLoginFailures();
  const key = 'test-client';
  const now = Date.now();
  for (let count = 0; count < 4; count += 1) assert.equal(recordLoginFailure(key, now).blocked, false);
  assert.equal(recordLoginFailure(key, now).blocked, true);
  assert.equal(loginLimit(key, now + 14 * 60 * 1000).blocked, true);
  assert.equal(loginLimit(key, now + 15 * 60 * 1000 + 1).blocked, false);
  clearLoginFailures(key);
});
