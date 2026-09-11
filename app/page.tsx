'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, BarChart3, BriefcaseBusiness, Building2, ChevronRight, CircleDollarSign, Clock3, Globe2, LayoutDashboard, LockKeyhole, Menu, RefreshCw, ShieldCheck, WalletCards, X } from 'lucide-react';
import { QueryProvider } from '@/components/query-provider';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Environment = 'domestic-mock' | 'overseas-mock';
type Holding = { code: string; name: string; market: string; quantity: number; availableQuantity: number; averagePrice: number; currentPrice: number; evaluationAmount: number; profitLoss: number; profitRate: number; currency: 'KRW' | 'USD' };
type AccountData = { environment: Environment; asOf: string; currency: 'KRW' | 'USD'; accountNotice?: string; cashBalance: number; totalPurchaseAmount: number; totalEvaluationAmount: number; totalProfitLoss: number; totalProfitRate: number; estimatedAssets?: number; holdings: Holding[] };

const environments = [
  { id: 'live', label: '실투자', icon: LockKeyhole, disabled: true },
  { id: 'domestic-mock', label: '국내 모의투자', icon: Building2, disabled: false },
  { id: 'overseas-mock', label: '해외 모의투자', icon: Globe2, disabled: false },
] as const;
const menuItems = [
  { label: '계좌 확인', icon: WalletCards, active: true },
  { label: '시장 현황', icon: BarChart3, disabled: true },
  { label: '주문 관리', icon: BriefcaseBusiness, disabled: true },
];

function isUsMarketOpen(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  const minutes = Number(get('hour')) * 60 + Number(get('minute'));
  return !['Sat', 'Sun'].includes(get('weekday')) && minutes >= 570 && minutes < 960;
}
function money(value: number, currency: 'KRW' | 'USD') { return new Intl.NumberFormat('ko-KR', { style: 'currency', currency, maximumFractionDigits: currency === 'KRW' ? 0 : 2 }).format(value); }
function number(value: number, digits = 0) { return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: digits }).format(value); }
function Change({ value, suffix = '' }: { value: number; suffix?: string }) {
  const tone = value > 0 ? 'text-rose-600' : value < 0 ? 'text-blue-600' : 'text-slate-600';
  return <span className={`font-semibold tabular-nums ${tone}`}>{value > 0 ? '+' : ''}{number(value, 2)}{suffix}</span>;
}
async function getAccount(environment: Environment): Promise<AccountData> {
  const response = await fetch(`/api/account?environment=${environment}`, { headers: { Accept: 'application/json' } });
  const payload = await response.json() as AccountData | { message?: string };
  if (!response.ok) throw new Error('message' in payload && payload.message ? payload.message : '계좌 정보를 불러오지 못했습니다.');
  return payload as AccountData;
}
function Loading() {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="계좌 정보 로딩 중">{[0,1,2,3].map((item) => <div key={item} className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-white p-5"><div className="h-3 w-20 rounded bg-slate-100"/><div className="mt-7 h-6 w-32 rounded bg-slate-100"/><div className="mt-3 h-3 w-24 rounded bg-slate-100"/></div>)}</div>;
}

function Dashboard() {
  const [environment, setEnvironment] = useState<Environment>(() => isUsMarketOpen() ? 'overseas-mock' : 'domestic-mock');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const query = useQuery({ queryKey: ['account', environment], queryFn: () => getAccount(environment), staleTime: 30_000, retry: 1 });
  const data = query.data;
  const currency = data?.currency ?? (environment === 'domestic-mock' ? 'KRW' : 'USD');

  return <main className="min-h-screen bg-slate-50 text-slate-950">
    <header className="sticky top-0 z-30 border-b border-slate-200/90 bg-white/95 backdrop-blur">
      <div className="flex min-h-16 items-center gap-3 px-4 md:px-6">
        <button type="button" onClick={() => setSidebarOpen(true)} className="grid size-9 place-items-center rounded-lg border border-slate-200 text-slate-600 lg:hidden" aria-label="메뉴 열기"><Menu className="size-5"/></button>
        <div className="flex min-w-0 items-center gap-3 lg:w-60"><div className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-900 text-white shadow-sm"><CircleDollarSign className="size-5"/></div><div className="hidden sm:block"><p className="text-sm font-bold tracking-tight">PORTFOLIO DESK</p><p className="text-[11px] text-slate-500">Personal investment console</p></div></div>
        <div className="ml-auto flex items-center gap-1 rounded-xl bg-slate-100 p-1 sm:ml-0">
          {environments.map((item) => { const Icon = item.icon; const selected = item.id === environment; return <button key={item.id} type="button" disabled={item.disabled} onClick={() => !item.disabled && setEnvironment(item.id as Environment)} className={`flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition sm:px-3 ${selected ? 'bg-white text-emerald-900 shadow-sm ring-1 ring-slate-200' : item.disabled ? 'cursor-not-allowed text-slate-400' : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'}`} aria-pressed={selected} title={item.disabled ? '실투자 환경은 안전을 위해 비활성화되어 있습니다.' : item.label}><Icon className="size-3.5"/><span className="hidden min-[430px]:inline">{item.label}</span></button>; })}
        </div>
        <div className="ml-auto hidden items-center gap-2 text-xs text-slate-500 md:flex"><ShieldCheck className="size-4 text-emerald-700"/>서버 보안 연결</div>
      </div>
    </header>
    {sidebarOpen && <button className="fixed inset-0 z-40 bg-slate-950/25 lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="메뉴 닫기"/>}
    <div className="flex min-h-[calc(100vh-65px)]">
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-slate-200 bg-white px-3 py-5 transition-transform lg:sticky lg:top-16 lg:z-10 lg:h-[calc(100vh-65px)] lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="mb-5 flex items-center justify-between px-3 lg:hidden"><span className="text-sm font-bold">메뉴</span><button type="button" onClick={() => setSidebarOpen(false)} aria-label="메뉴 닫기" className="grid size-8 place-items-center rounded-lg hover:bg-slate-100"><X className="size-4"/></button></div>
        <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Workspace</p>
        <nav aria-label="주요 기능" className="space-y-1">{menuItems.map((item) => { const Icon = item.icon; return <button key={item.label} type="button" disabled={item.disabled} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${item.active ? 'bg-emerald-50 text-emerald-900' : 'text-slate-400'}`}><Icon className="size-4"/>{item.label}{item.active && <ChevronRight className="ml-auto size-4"/>}{item.disabled && <span className="ml-auto text-[10px]">준비 중</span>}</button>; })}</nav>
        <div className="absolute bottom-5 left-3 right-3 rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex gap-2.5"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-700"/><div><p className="text-xs font-semibold text-slate-700">모의투자 전용</p><p className="mt-1 text-[11px] leading-relaxed text-slate-500">인증정보는 브라우저에 노출되지 않습니다.</p></div></div></div>
      </aside>
      <section className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8 xl:px-10"><div className="mx-auto max-w-[1440px]">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="mb-2 flex items-center gap-2 text-xs font-semibold text-emerald-800"><LayoutDashboard className="size-3.5"/>계좌 확인</div><h1 className="text-2xl font-bold tracking-tight md:text-3xl">내 투자 현황</h1><p className="mt-2 text-sm text-slate-500">선택한 모의투자 계좌의 자산과 보유 종목을 확인합니다.</p></div><button type="button" onClick={() => query.refetch()} disabled={query.isFetching} className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60 sm:self-auto"><RefreshCw className={`size-4 ${query.isFetching ? 'animate-spin' : ''}`}/>{query.isFetching ? '새로고침 중' : '새로고침'}</button></div>
        {query.isPending ? <Loading/> : query.isError ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6"><div className="flex gap-3"><AlertCircle className="mt-0.5 size-5 shrink-0 text-amber-700"/><div><h2 className="font-semibold text-amber-950">계좌 정보를 연결하지 못했습니다</h2><p className="mt-1 text-sm text-amber-800">{query.error.message}</p><button type="button" onClick={() => query.refetch()} className="mt-4 rounded-lg bg-amber-900 px-3 py-2 text-xs font-semibold text-white">다시 시도</button></div></div></div> : data ? <>
          {data.accountNotice && <div className="mb-4 flex gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900"><AlertCircle className="mt-0.5 size-4 shrink-0"/><p>{data.accountNotice}</p></div>}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
            { label: '예수금', value: data.cashBalance, sub: '계좌 내 현금성 자산' },
            { label: '총 평가금액', value: data.totalEvaluationAmount, sub: '보유 종목 평가금액' },
            { label: '총 평가손익', value: data.totalProfitLoss, change: true, sub: '평가금액 − 매입금액' },
            { label: '총 수익률', value: data.totalProfitRate, rate: true, change: true, sub: '보유자산 평가수익률' },
          ].map((card) => <article key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"><p className="text-xs font-semibold text-slate-500">{card.label}</p><div className="mt-4 text-xl font-bold tracking-tight tabular-nums md:text-2xl">{card.change ? <Change value={card.value} suffix={card.rate ? '%' : ''}/> : money(card.value, currency)}</div><p className="mt-2 text-[11px] text-slate-400">{card.sub}</p></article>)}</div>
          <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-bold">보유 종목</h2><p className="mt-1 text-xs text-slate-500">총 {data.holdings.length}개 종목</p></div><div className="flex items-center gap-1.5 text-[11px] text-slate-400"><Clock3 className="size-3.5"/>{new Date(data.asOf).toLocaleString('ko-KR')}</div></div>
            {data.holdings.length === 0 ? <div className="grid min-h-64 place-items-center px-6 text-center"><div><WalletCards className="mx-auto size-8 text-slate-300"/><p className="mt-3 font-semibold text-slate-700">보유 종목이 없습니다</p><p className="mt-1 text-sm text-slate-400">선택한 모의투자 계좌에 표시할 잔고가 없습니다.</p></div></div> : <Table><TableHeader className="bg-slate-50/80"><TableRow className="hover:bg-slate-50/80"><TableHead className="h-11 pl-5 text-xs text-slate-500">종목</TableHead><TableHead className="text-right text-xs text-slate-500">보유 / 가능</TableHead><TableHead className="text-right text-xs text-slate-500">평균단가</TableHead><TableHead className="text-right text-xs text-slate-500">현재가</TableHead><TableHead className="text-right text-xs text-slate-500">평가금액</TableHead><TableHead className="pr-5 text-right text-xs text-slate-500">평가손익</TableHead></TableRow></TableHeader><TableBody>{data.holdings.map((holding) => <TableRow key={`${holding.market}-${holding.code}`}><TableCell className="py-4 pl-5"><div className="font-semibold text-slate-800">{holding.name}</div><div className="mt-1 text-[11px] text-slate-400">{holding.code} · {holding.market}</div></TableCell><TableCell className="text-right tabular-nums">{number(holding.quantity, 4)} <span className="text-slate-300">/</span> {number(holding.availableQuantity, 4)}</TableCell><TableCell className="text-right tabular-nums">{money(holding.averagePrice, holding.currency)}</TableCell><TableCell className="text-right font-medium tabular-nums">{money(holding.currentPrice, holding.currency)}</TableCell><TableCell className="text-right font-medium tabular-nums">{money(holding.evaluationAmount, holding.currency)}</TableCell><TableCell className="pr-5 text-right"><Change value={holding.profitLoss}/><div className="mt-1 text-[11px]"><Change value={holding.profitRate} suffix="%"/></div></TableCell></TableRow>)}</TableBody></Table>}
          </section>
        </> : null}
      </div></section>
    </div>
  </main>;
}

export default function Home() { return <QueryProvider><Dashboard/></QueryProvider>; }
