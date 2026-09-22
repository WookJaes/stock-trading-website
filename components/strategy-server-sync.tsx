'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, LoaderCircle, ShieldCheck } from 'lucide-react';
import {
  defaultStrategySettings,
  parseStrategySettings,
  serializeStrategySettings,
  STRATEGY_SETTINGS_STORAGE_KEY,
  type StrategySettings,
} from '@/lib/strategy-settings';

const strategySettingsEvent = 'portfolio-desk-strategy-settings-change';

type SettingsResponse = {
  revision: number;
  settings: StrategySettings;
  initialized: boolean;
};

type StatusResponse = {
  mode: 'dry-run' | 'mock-enabled';
  liveOrdersEnabled: false;
  workerOnline: boolean;
  services: Array<{
    key: string;
    value: string;
    updatedAt: number;
  }>;
  intents: Array<{
    id: string;
    environment: string;
    market: string;
    code: string;
    source: 'manual' | 'strategy' | 'external';
    reasons: string[];
    state: string;
    orderedQuantity?: number;
    filledQuantity: number;
    remainingQuantity?: number;
    lastError?: string;
    updatedAt: number;
  }>;
};

async function json<T>(responseValue: Response | Promise<Response>): Promise<T> {
  const response = await responseValue;
  const payload = (await response.json()) as T & { message?: string };
  if (!response.ok) throw new Error(payload.message || '요청을 처리하지 못했습니다.');
  return payload;
}

export function StrategySettingsSync() {
  const revision = useRef(0);
  const suppressEvent = useRef(false);
  const saveQueue = useRef(Promise.resolve());
  const [migrationSettings, setMigrationSettings] = useState<StrategySettings>();
  const [message, setMessage] = useState<string>();
  const query = useQuery({
    queryKey: ['strategy-settings-server'],
    queryFn: () =>
      json<SettingsResponse>(
        fetch('/api/strategy-settings', { cache: 'no-store' }),
      ),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!query.data) return;
    revision.current = query.data.revision;
    const localText = window.localStorage.getItem(STRATEGY_SETTINGS_STORAGE_KEY);
    const local = localText ? parseStrategySettings(localText) : null;
    if (!query.data.initialized && local) {
      queueMicrotask(() => setMigrationSettings(local));
      return;
    }
    suppressEvent.current = true;
    window.localStorage.setItem(
      STRATEGY_SETTINGS_STORAGE_KEY,
      serializeStrategySettings(query.data.settings),
    );
    window.dispatchEvent(new Event(strategySettingsEvent));
    queueMicrotask(() => {
      suppressEvent.current = false;
    });
  }, [query.data]);

  useEffect(() => {
    const save = () => {
      if (suppressEvent.current) return;
      const text = window.localStorage.getItem(STRATEGY_SETTINGS_STORAGE_KEY);
      const settings = text ? parseStrategySettings(text) : null;
      if (!settings) return;
      saveQueue.current = saveQueue.current
        .catch(() => undefined)
        .then(async () => {
          const response = await fetch('/api/strategy-settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ revision: revision.current, settings }),
          });
          const result = await json<SettingsResponse>(response);
          revision.current = result.revision;
          setMigrationSettings(undefined);
          setMessage('전략 설정을 서버에 저장했습니다.');
          window.setTimeout(() => setMessage(undefined), 1800);
        })
        .catch((error) => {
          setMessage(error instanceof Error ? error.message : '전략 설정 저장에 실패했습니다.');
          void query.refetch();
        });
    };
    const storage = (event: StorageEvent) => {
      if (event.key === STRATEGY_SETTINGS_STORAGE_KEY) save();
    };
    window.addEventListener(strategySettingsEvent, save);
    window.addEventListener('storage', storage);
    return () => {
      window.removeEventListener(strategySettingsEvent, save);
      window.removeEventListener('storage', storage);
    };
  }, [query]);

  if (!migrationSettings && !message && !query.isError) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[70] max-w-sm rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-xl">
      {migrationSettings ? (
        <>
          <p className="font-bold text-slate-800">기존 브라우저 설정 발견</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            기존 설정을 서버로 가져오면 브라우저를 닫아도 전략 워커가 사용할 수 있습니다.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                window.localStorage.setItem(
                  STRATEGY_SETTINGS_STORAGE_KEY,
                  serializeStrategySettings(migrationSettings),
                );
                window.dispatchEvent(new Event(strategySettingsEvent));
              }}
              className="rounded-lg bg-emerald-900 px-3 py-2 text-xs font-semibold text-white"
            >
              서버로 가져오기
            </button>
            <button
              type="button"
              onClick={() => {
                window.localStorage.setItem(
                  STRATEGY_SETTINGS_STORAGE_KEY,
                  serializeStrategySettings(defaultStrategySettings),
                );
                window.dispatchEvent(new Event(strategySettingsEvent));
                setMigrationSettings(undefined);
              }}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600"
            >
              기본값 사용
            </button>
          </div>
        </>
      ) : (
        <p className={`flex gap-2 ${query.isError ? 'text-rose-700' : 'text-emerald-800'}`}>
          {query.isError ? <AlertCircle className="size-4 shrink-0" /> : <CheckCircle2 className="size-4 shrink-0" />}
          {query.isError ? query.error.message : message}
        </p>
      )}
    </div>
  );
}

export function StrategyRuntimeBadge() {
  const [resuming, setResuming] = useState<string>();
  const [resumeError, setResumeError] = useState<string>();
  const query = useQuery({
    queryKey: ['strategy-runtime-status'],
    queryFn: () =>
      json<StatusResponse>(
        fetch('/api/strategy-status', { cache: 'no-store' }),
      ),
    refetchInterval: 15_000,
  });
  if (query.isPending)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
        <LoaderCircle className="size-3 animate-spin" /> 상태 확인 중
      </span>
    );
  if (query.isError)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
        <AlertCircle className="size-3" /> 워커 상태 확인 실패
      </span>
    );
  const enabled = query.data.mode === 'mock-enabled';
  const workerOnline = query.data.workerOnline;
  const active = query.data.intents
    .filter((intent) =>
      [
        'claimed',
        'preflight',
        'submitting',
        'submission_unknown',
        'accepted',
        'partial',
        'reconciling',
        'needs_review',
      ].includes(intent.state),
    )
    .slice(0, 5);
  return (
    <div className="space-y-2">
      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${enabled && workerOnline ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
        <ShieldCheck className="size-3" />
        {!workerOnline
          ? '전략 워커 연결 확인 필요'
          : enabled
            ? '모의 자동주문 활성'
            : '신호 기록 전용 · 주문 안 함'}
      </span>
      {active.length > 0 && (
        <div className="max-w-xl rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-sm">
          <p className="font-bold text-slate-800">진행 중·안전정지 {active.length}건</p>
          <ul className="mt-2 space-y-2">
            {active.map((intent) => (
              <li key={intent.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                <span className="font-semibold text-slate-800">{intent.code}</span>
                <span>{intent.market}</span>
                <span>· {intent.state === 'needs_review' ? '사용자 확인 필요' : '주문 확인 중'}</span>
                {intent.state === 'needs_review' && (
                  <button
                    type="button"
                    disabled={resuming === intent.id}
                    onClick={async () => {
                      setResuming(intent.id);
                      setResumeError(undefined);
                      try {
                        await json(
                          fetch('/api/strategy-status', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'resume', intentId: intent.id }),
                          }),
                        );
                        await query.refetch();
                      } catch (error) {
                        setResumeError(error instanceof Error ? error.message : '재가동하지 못했습니다.');
                      } finally {
                        setResuming(undefined);
                      }
                    }}
                    className="ml-auto rounded-md border border-slate-200 bg-white px-2 py-1 font-semibold text-emerald-800 disabled:opacity-50"
                  >
                    확인 후 재가동
                  </button>
                )}
              </li>
            ))}
          </ul>
          {resumeError && <p className="mt-2 text-rose-700">{resumeError}</p>}
        </div>
      )}
    </div>
  );
}
