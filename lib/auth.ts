const SESSION_COOKIE = 'portfolio_session';
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const encoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function digest(value: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
}

function sessionSecret() {
  const password = process.env.PASSWORD;
  if (!password) return null;
  return process.env.SESSION_SECRET || `portfolio-session:${password}`;
}

async function signature(payload: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload))));
}

export async function verifyPassword(candidate: string) {
  const password = process.env.PASSWORD;
  if (!password) return false;
  return equalBytes(await digest(candidate), await digest(password));
}

export async function createSession(now = Date.now()) {
  const secret = sessionSecret();
  if (!secret) throw new Error('AUTH_NOT_CONFIGURED');
  const expiresAt = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  const nonce = crypto.randomUUID();
  const payload = `v1.${expiresAt}.${nonce}`;
  return `${payload}.${await signature(payload, secret)}`;
}

export async function verifySession(token: string | undefined, now = Date.now()) {
  const secret = sessionSecret();
  if (!secret || !token) return false;
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return false;
  const expiresAt = Number(parts[1]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now / 1000)) return false;
  const payload = parts.slice(0, 3).join('.');
  const expected = await signature(payload, secret);
  return equalBytes(encoder.encode(parts[3]), encoder.encode(expected));
}

export const authCookie = {
  name: SESSION_COOKIE,
  maxAge: SESSION_TTL_SECONDS,
  options: {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  },
};
