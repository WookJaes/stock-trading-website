const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

type Attempt = { failures: number; windowEndsAt: number };
const attempts = new Map<string, Attempt>();

function currentAttempt(key: string, now: number) {
  const attempt = attempts.get(key);
  if (!attempt || attempt.windowEndsAt <= now) {
    attempts.delete(key);
    return null;
  }
  return attempt;
}

export function loginLimit(key: string, now = Date.now()) {
  const attempt = currentAttempt(key, now);
  return {
    blocked: Boolean(attempt && attempt.failures >= MAX_FAILURES),
    retryAfterSeconds: attempt ? Math.max(1, Math.ceil((attempt.windowEndsAt - now) / 1000)) : 0,
  };
}

export function recordLoginFailure(key: string, now = Date.now()) {
  const attempt = currentAttempt(key, now) ?? { failures: 0, windowEndsAt: now + WINDOW_MS };
  attempt.failures += 1;
  attempts.set(key, attempt);
  return loginLimit(key, now);
}

export function clearLoginFailures(key: string) {
  attempts.delete(key);
}

export function clearAllLoginFailures() {
  attempts.clear();
}
