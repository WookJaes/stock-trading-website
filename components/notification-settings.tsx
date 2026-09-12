'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  BellRing,
  CheckCircle2,
  LoaderCircle,
  LogIn,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

type Preferences = { login: boolean; buyFilled: boolean; sellFilled: boolean };
type SettingsResponse = { preferences: Preferences; configured: boolean };

async function request<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, init);
  const body = (await response.json()) as T & { message?: string };
  if (!response.ok)
    throw new Error(body.message || '알림 설정을 처리하지 못했습니다.');
  return body;
}

const options = [
  {
    key: 'login',
    label: '로그인 알림',
    description: 'Portfolio Desk 로그인 성공 시 알립니다.',
    icon: LogIn,
  },
  {
    key: 'buyFilled',
    label: '매수 체결 알림',
    description: '모의투자 매수 주문이 전량 체결되면 알립니다.',
    icon: TrendingUp,
  },
  {
    key: 'sellFilled',
    label: '매도 체결 알림',
    description: '모의투자 매도 주문이 전량 체결되면 알립니다.',
    icon: TrendingDown,
  },
] as const;

export function NotificationSettings() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['notification-settings'],
    queryFn: () => request<SettingsResponse>('/api/settings/notifications'),
  });
  const mutation = useMutation({
    mutationFn: (preferences: Preferences) =>
      request<{ preferences: Preferences; success: true }>(
        '/api/settings/notifications',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(preferences),
        },
      ),
    onSuccess: (result) =>
      queryClient.setQueryData<SettingsResponse>(
        ['notification-settings'],
        (current) => ({
          configured: current?.configured ?? false,
          preferences: result.preferences,
        }),
      ),
  });

  if (query.isPending)
    return (
      <div className="grid min-h-64 place-items-center">
        <LoaderCircle className="size-6 animate-spin text-emerald-800" />
      </div>
    );
  if (query.isError)
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        {query.error.message}
      </div>
    );
  const data = query.data;

  return (
    <section>
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-emerald-800">
          <BellRing className="size-3.5" />
          Telegram 알림
        </div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          알림 설정
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Telegram으로 받을 이벤트를 선택합니다.
        </p>
      </div>
      <div
        className={`mb-4 flex gap-3 rounded-xl border px-4 py-3 text-sm ${data.configured ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
      >
        {data.configured ? (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
        ) : (
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
        )}
        <p>
          {data.configured
            ? 'Telegram 봇과 채팅방이 서버에 연결되어 있습니다.'
            : '서버의 TELEGRAM_BOT_TOKEN과 TELEGRAM_CHAT_ID 설정이 필요합니다.'}
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        {options.map(({ key, label, description, icon: Icon }) => {
          const enabled = data.preferences[key];
          return (
            <div
              key={key}
              className="flex items-center gap-4 border-b border-slate-100 px-5 py-5 last:border-b-0"
            >
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-800">
                <Icon className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold text-slate-800">{label}</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {description}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={`${label} ${enabled ? '끄기' : '켜기'}`}
                disabled={mutation.isPending}
                onClick={() =>
                  mutation.mutate({ ...data.preferences, [key]: !enabled })
                }
                className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${enabled ? 'bg-emerald-800' : 'bg-slate-300'}`}
              >
                <span
                  className={`absolute top-1 size-5 rounded-full bg-white shadow-sm transition-all ${enabled ? 'left-6' : 'left-1'}`}
                />
              </button>
            </div>
          );
        })}
      </div>
      {mutation.isError && (
        <p role="alert" className="mt-4 text-sm text-rose-700">
          {mutation.error.message}
        </p>
      )}
      {mutation.isPending && (
        <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <LoaderCircle className="size-4 animate-spin" />
          설정을 저장하고 있습니다.
        </p>
      )}
    </section>
  );
}
