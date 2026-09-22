'use client';

import { useState, useSyncExternalStore } from 'react';
import {
  AlertCircle,
  ArrowRightLeft,
  CheckCircle2,
  ClipboardCopy,
  Download,
  FileJson2,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import {
  defaultStrategySettings,
  parseStrategySettings,
  serializeStrategySettings,
  STRATEGY_SETTINGS_STORAGE_KEY,
  writeStrategySettings,
  type StrategySettings,
} from '@/lib/strategy-settings';

const strategySettingsEvent = 'portfolio-desk-strategy-settings-change';
const defaultSettingsText = serializeStrategySettings(defaultStrategySettings);

function subscribeStrategySettings(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STRATEGY_SETTINGS_STORAGE_KEY) onStoreChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(strategySettingsEvent, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(strategySettingsEvent, onStoreChange);
  };
}

function getStrategySettingsSnapshot() {
  return (
    window.localStorage.getItem(STRATEGY_SETTINGS_STORAGE_KEY) ??
    defaultSettingsText
  );
}

function hasEnabledStrategy(settings: StrategySettings) {
  return (
    settings.strategies.slTp.domestic.enabled ||
    settings.strategies.slTp.overseas.enabled ||
    settings.strategies.trailingStop.domestic.enabled ||
    settings.strategies.trailingStop.overseas.enabled ||
    settings.strategies.deadCross.domestic.enabled ||
    settings.strategies.deadCross.overseas.enabled
  );
}

export function StrategySettingsTransfer() {
  const settingsText = useSyncExternalStore(
    subscribeStrategySettings,
    getStrategySettingsSnapshot,
    () => defaultSettingsText,
  );
  const settings =
    parseStrategySettings(settingsText) ?? defaultStrategySettings;
  const exportedText = serializeStrategySettings(settings);
  const [importText, setImportText] = useState('');
  const [message, setMessage] = useState<
    { type: 'success' | 'error'; text: string } | undefined
  >();
  const [copied, setCopied] = useState(false);

  async function copySettings() {
    try {
      await navigator.clipboard.writeText(exportedText);
      setCopied(true);
      setMessage({
        type: 'success',
        text: '전체 전략 설정을 클립보드에 복사했습니다.',
      });
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
      setMessage({
        type: 'error',
        text: '자동 복사에 실패했습니다. JSON 영역을 직접 선택해 복사해 주세요.',
      });
    }
  }

  function importSettings() {
    const parsed = parseStrategySettings(importText);
    if (!parsed) {
      setMessage({
        type: 'error',
        text: 'JSON 형식이나 전략 설정값을 확인해 주세요.',
      });
      return;
    }
    if (
      hasEnabledStrategy(parsed) &&
      !window.confirm(
        '가져올 설정에 활성화된 전략이 있습니다. 현재 서버에 그대로 적용할까요?',
      )
    )
      return;
    writeStrategySettings(window.localStorage, parsed);
    window.dispatchEvent(new Event(strategySettingsEvent));
    setImportText('');
    setMessage({
      type: 'success',
      text: '전체 전략 설정을 적용했습니다. 서버 저장 완료 알림을 확인해 주세요.',
    });
  }

  return (
    <section>
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-emerald-800">
          <ArrowRightLeft className="size-3.5" />
          설정
        </div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          전략 설정 옮기기
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          전체 전략 설정을 JSON 텍스트로 복사해 다른 Portfolio Desk 서버에
          적용합니다.
        </p>
      </div>

      <div className="mb-5 flex gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        <p>
          SL/TP, 트레일링 스탑, 데드크로스의 국내·해외 설정과 제외종목만
          이동합니다. 비밀번호, 앱 키, 토큰, 계좌정보와 주문 실행 상태는 JSON에
          포함되지 않습니다.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <FileJson2 className="size-4 text-emerald-800" />
                <h2 className="font-bold">현재 설정 내보내기</h2>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                로컬에서 복사한 뒤 Lightsail 사이트의 가져오기 영역에 붙여
                넣으세요.
              </p>
            </div>
            <button
              type="button"
              onClick={copySettings}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-emerald-900 px-3 text-xs font-semibold text-white"
            >
              {copied ? (
                <CheckCircle2 className="size-3.5" />
              ) : (
                <ClipboardCopy className="size-3.5" />
              )}
              {copied ? '복사됨' : 'JSON 복사'}
            </button>
          </div>
          <textarea
            aria-label="내보낼 전체 전략 설정 JSON"
            readOnly
            value={exportedText}
            rows={22}
            className="mt-4 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] leading-5 text-slate-600 outline-none"
          />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="flex items-center gap-2">
            <Upload className="size-4 text-emerald-800" />
            <h2 className="font-bold">다른 환경 설정 가져오기</h2>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            붙여넣은 설정은 형식과 입력 범위를 검증한 뒤 현재 서버의 전체 전략
            설정을 대체합니다.
          </p>
          <textarea
            value={importText}
            onChange={(event) => {
              setImportText(event.target.value);
              setMessage(undefined);
            }}
            rows={22}
            spellCheck={false}
            placeholder="복사한 전체 전략 설정 JSON을 여기에 붙여 넣으세요."
            className="mt-4 w-full resize-y rounded-xl border border-slate-200 bg-white p-3 font-mono text-[11px] leading-5 outline-none focus:border-emerald-700 focus:ring-3 focus:ring-emerald-100"
          />
          <button
            type="button"
            disabled={!importText.trim()}
            onClick={importSettings}
            className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-40"
          >
            <Download className="size-4" />
            붙여넣은 전체 설정 적용
          </button>
        </section>
      </div>

      {message && (
        <output
          className={`mt-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${message.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-700'}`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="size-4 shrink-0" />
          ) : (
            <AlertCircle className="size-4 shrink-0" />
          )}
          {message.text}
        </output>
      )}
    </section>
  );
}
