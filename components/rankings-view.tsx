'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, BarChart3, Flame, LoaderCircle, RefreshCw, TrendingUp } from 'lucide-react';
import type { TradeStock } from '@/components/stock-trade-panel';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Environment = 'domestic-live' | 'overseas-live' | 'domestic-mock' | 'overseas-mock';
type Category = 'value' | 'gainers' | 'volume' | 'popular';
type RankItem = TradeStock & { rank: number; currentPrice: number; change: number; changeRate: number; volume: number; tradeValue: number; currency: 'KRW' | 'USD' };
type RankingData = { asOf: string; results: RankItem[] };

const categories = [
  { id: 'value', label: '거래대금 상위', icon: BarChart3 },
  { id: 'gainers', label: '상승률 상위', icon: TrendingUp },
  { id: 'volume', label: '거래량 상위', icon: BarChart3 },
  { id: 'popular', label: '인기검색 순위', icon: Flame },
] as const;

function formatNumber(value: number, digits = 0) { return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: digits }).format(value); }
function formatMoney(value: number, currency: 'KRW' | 'USD') { return new Intl.NumberFormat('ko-KR', { style: 'currency', currency, maximumFractionDigits: currency === 'KRW' ? 0 : 4 }).format(value); }
async function getRankings(environment: Environment, category: Category): Promise<RankingData> {
  const response = await fetch(`/api/rankings?environment=${environment}&category=${category}`, { headers: { Accept: 'application/json' } });
  const payload = await response.json() as RankingData | { message?: string };
  if (!response.ok) throw new Error('message' in payload && payload.message ? payload.message : '순위 정보를 불러오지 못했습니다.');
  return payload as RankingData;
}

export function RankingsView({ environment, onEnvironmentChange, onSelect }: { environment: Environment; onEnvironmentChange: (environment: Environment) => void; onSelect: (stock: TradeStock) => void }) {
  const [category, setCategory] = useState<Category>('value');
  const query = useQuery({ queryKey: ['rankings', environment, category], queryFn: () => getRankings(environment, category), staleTime: 30_000, retry: 1 });
  const live = environment.endsWith('-live');
  const domestic = environment.startsWith('domestic-');
  const currency = domestic ? 'KRW' : 'USD';

  return <section>
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="mb-2 flex items-center gap-2 text-xs font-semibold text-emerald-800"><BarChart3 className="size-3.5"/>시장 순위</div><h1 className="text-2xl font-bold tracking-tight md:text-3xl">주요 종목 순위</h1><p className="mt-2 text-sm text-slate-500">시장 흐름을 살펴보고 종목을 선택해 거래 패널을 엽니다.</p></div><button type="button" onClick={() => query.refetch()} disabled={query.isFetching} className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"><RefreshCw className={`size-4 ${query.isFetching ? 'animate-spin' : ''}`}/>{query.isFetching ? '새로고침 중' : '새로고침'}</button></div>
    <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div className="flex gap-2" aria-label="순위 시장"><button type="button" onClick={() => live && onEnvironmentChange('domestic-live')} disabled={!live && !domestic} className={`rounded-lg px-4 py-2 text-sm font-semibold ${domestic ? 'bg-emerald-900 text-white' : live ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'cursor-not-allowed bg-slate-100 text-slate-400'}`}>국내</button><button type="button" onClick={() => live && onEnvironmentChange('overseas-live')} disabled={!live && domestic} className={`rounded-lg px-4 py-2 text-sm font-semibold ${!domestic ? 'bg-emerald-900 text-white' : live ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'cursor-not-allowed bg-slate-100 text-slate-400'}`}>해외</button></div>
      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">{categories.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" onClick={() => setCategory(item.id)} aria-pressed={category === item.id} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition ${category === item.id ? 'border-emerald-800 bg-emerald-50 text-emerald-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}><Icon className="size-4"/>{item.label}</button>; })}</div>
    </div>
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-bold">{categories.find((item) => item.id === category)?.label}</h2><p className="mt-1 text-xs text-slate-500">종목을 선택하면 {live ? '조회 패널' : '매수 패널'}이 열립니다.</p></div>{query.data && <span className="text-[11px] text-slate-400">{new Date(query.data.asOf).toLocaleString('ko-KR')}</span>}</div>
      {query.isPending ? <div className="grid min-h-72 place-items-center"><div className="text-center"><LoaderCircle className="mx-auto size-6 animate-spin text-emerald-800"/><p className="mt-3 text-sm text-slate-500">순위 정보를 불러오고 있습니다.</p></div></div> : query.isError ? <div className="m-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><div className="flex gap-2"><AlertCircle className="size-4 shrink-0"/><div><p>{query.error.message}</p><button type="button" onClick={() => query.refetch()} className="mt-3 font-bold underline">다시 시도</button></div></div></div> : query.data.results.length === 0 ? <div className="grid min-h-72 place-items-center text-center"><div><BarChart3 className="mx-auto size-8 text-slate-300"/><p className="mt-3 font-semibold text-slate-700">표시할 순위 데이터가 없습니다</p><p className="mt-1 text-sm text-slate-400">장 운영 시간에 따라 데이터가 제공되지 않을 수 있습니다.</p></div></div> : <Table><TableHeader className="bg-slate-50/80"><TableRow><TableHead className="w-16 pl-5 text-center">순위</TableHead><TableHead>종목</TableHead><TableHead className="text-right">현재가</TableHead><TableHead className="text-right">등락률</TableHead><TableHead className="hidden text-right md:table-cell">{category === 'value' ? '거래대금' : category === 'volume' ? '거래량' : '등락'}</TableHead></TableRow></TableHeader><TableBody>{query.data.results.map((item) => <TableRow key={`${item.market}-${item.code}`}><TableCell className="pl-5 text-center text-sm font-bold tabular-nums text-slate-500">{item.rank}</TableCell><TableCell className="py-2"><button type="button" onClick={() => onSelect(item)} className="w-full rounded-lg px-2 py-2 text-left hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-700"><div className="font-semibold text-slate-800">{item.name}</div><div className="mt-1 text-[11px] text-slate-400">{item.code} · {item.market}</div></button></TableCell><TableCell className="text-right font-medium tabular-nums">{formatMoney(item.currentPrice, item.currency)}</TableCell><TableCell className={`text-right font-semibold tabular-nums ${item.changeRate > 0 ? 'text-rose-600' : item.changeRate < 0 ? 'text-blue-600' : 'text-slate-500'}`}>{item.changeRate > 0 ? '+' : ''}{formatNumber(item.changeRate, 2)}%</TableCell><TableCell className="hidden text-right tabular-nums text-slate-600 md:table-cell">{category === 'value' ? `${formatNumber(item.tradeValue)} ${currency === 'KRW' ? '백만원' : '천달러'}` : category === 'volume' ? `${formatNumber(item.volume)}주` : item.change ? `${item.change > 0 ? '+' : ''}${formatMoney(item.change, item.currency)}` : '-'}</TableCell></TableRow>)}</TableBody></Table>}
    </div>
  </section>;
}
