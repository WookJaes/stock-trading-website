'use client';

import { useState } from 'react';
import { CircleDollarSign, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: { preventDefault(): void }) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const payload = await response.json() as { message?: string };
      if (!response.ok) throw new Error(payload.message || '로그인하지 못했습니다.');
      const next = new URLSearchParams(window.location.search).get('next');
      window.location.replace(next?.startsWith('/') && !next.startsWith('//') ? next : '/');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '로그인하지 못했습니다.');
      setPending(false);
    }
  }

  return <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10 text-slate-950">
    <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-9">
      <div className="grid size-12 place-items-center rounded-2xl bg-emerald-900 text-white shadow-sm"><CircleDollarSign className="size-6"/></div>
      <div className="mt-7"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-emerald-800"><ShieldCheck className="size-4"/>Secure access</div><h1 className="mt-3 text-2xl font-bold tracking-tight">Portfolio Desk 로그인</h1><p className="mt-2 text-sm leading-6 text-slate-500">계좌 정보에 접근하려면 관리 비밀번호를 입력하세요.</p></div>
      <form onSubmit={submit} className="mt-7">
        <label className="text-sm font-semibold text-slate-700" htmlFor="password">비밀번호</label>
        <div className="relative mt-2"><LockKeyhole className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"/><input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none transition focus:border-emerald-700 focus:bg-white focus:ring-3 focus:ring-emerald-100"/></div>
        {error && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</p>}
        <button type="submit" disabled={pending || !password} className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-900 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60">{pending ? <LoaderCircle className="size-4 animate-spin"/> : <LockKeyhole className="size-4"/>}{pending ? '확인 중' : '로그인'}</button>
      </form>
      <p className="mt-6 text-center text-xs leading-5 text-slate-400">세션은 8시간 후 자동으로 만료됩니다.</p>
    </section>
  </main>;
}
