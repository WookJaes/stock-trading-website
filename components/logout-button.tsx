'use client';

import { LogOut } from 'lucide-react';

export function LogoutButton() {
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.replace('/login');
  }

  return <button type="button" onClick={logout} className="grid size-9 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800" aria-label="로그아웃" title="로그아웃"><LogOut className="size-4"/></button>;
}
