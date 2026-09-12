'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, LoaderCircle, RefreshCw, ShieldCheck, TrendingDown, TrendingUp, X } from 'lucide-react';
import { OrderQuantityControls } from '@/components/order-quantity-controls';

export type TradeStock = { code: string; name: string; englishName?: string; market: string };
type Environment = 'domestic-live' | 'overseas-live' | 'domestic-mock' | 'overseas-mock';
type Detail = TradeStock & { currency: 'KRW' | 'USD'; currentPrice: number; change: number; changeRate: number; volume: number; high52: number; low52: number; status?: string; warning?: string; tradable: boolean; unavailableReason?: string };
type OrderResponse = { success: boolean; orderNo: string; message: string };
type OrderStatus = { status: 'checking' | 'pending' | 'filled' | 'cancelled' | 'rejected'; statusLabel: string; orderedQuantity?: number; filledQuantity?: number; remainingQuantity?: number; filledPrice?: number };

async function json<T>(response: Response | Promise<Response>): Promise<T> {
  const resolved = await response;
  const payload = await resolved.json() as T & { message?: string };
  if (!resolved.ok) throw new Error(payload.message || '요청을 처리하지 못했습니다.');
  return payload;
}
function money(value: number, currency: 'KRW' | 'USD') { return new Intl.NumberFormat('ko-KR', { style: 'currency', currency, maximumFractionDigits: currency === 'KRW' ? 0 : 4 }).format(value); }
function count(value: number) { return new Intl.NumberFormat('ko-KR').format(value); }

export function StockTradePanel({ stock, environment, mode = 'buy', holdingQuantity, availableQuantity, onClose }: { stock: TradeStock; environment: Environment; mode?: 'buy' | 'sell'; holdingQuantity?: number; availableQuantity?: number; onClose: () => void }) {
  const live = environment.endsWith('-live');
  const [quantity, setQuantity] = useState('1');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [price, setPrice] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [notification, setNotification] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  const params = new URLSearchParams({ environment, action: 'detail', code: stock.code, market: stock.market });
  const detailQuery = useQuery({ queryKey: ['stock-detail', environment, stock.code, stock.market], queryFn: () => json<Detail>(fetch(`/api/trade?${params}`)), staleTime: 15_000 });
  const statusParams = order ? new URLSearchParams({ environment, action: 'status', code: stock.code, market: stock.market, orderNo: order.orderNo, side: mode }) : null;
  const statusQuery = useQuery({ queryKey: ['order-status', environment, order?.orderNo], queryFn: () => json<OrderStatus>(fetch(`/api/trade?${statusParams}`)), enabled: Boolean(order), refetchInterval: (query) => ['filled', 'cancelled', 'rejected'].includes(query.state.data?.status ?? '') ? false : 5_000 });
  const orderMutation = useMutation({
    mutationFn: (idempotencyKey: string) => json<OrderResponse>(fetch('/api/trade', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ environment, code: stock.code, market: stock.market, side: mode, quantity: Number(quantity), orderType, price: orderType === 'limit' ? Number(price) : 0, idempotencyKey }) })),
    onSuccess: (result) => { setOrder(result); setConfirming(false); setNotification({ tone: 'success', message: result.message }); },
    onError: (error) => { setConfirming(false); setNotification({ tone: 'error', message: error.message }); },
  });
  const detail = detailQuery.data;
  const valid = Number.isInteger(Number(quantity)) && Number(quantity) > 0 && (mode !== 'sell' || availableQuantity === undefined || Number(quantity) <= availableQuantity) && (orderType === 'market' || Number(price) > 0);
  const submitOrder = () => orderMutation.mutate(crypto.randomUUID());

  return <><button type="button" className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-[2px]" onClick={onClose} aria-label="거래 패널 닫기"/><dialog open aria-label={`${stock.name} 거래 패널`} className="fixed inset-y-0 right-0 z-50 m-0 ml-auto flex h-full w-full max-w-lg flex-col overflow-y-auto border-0 border-l border-slate-200 bg-slate-50 p-0 shadow-2xl">
    <header className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur"><div><p className={`text-xs font-semibold ${mode === 'sell' ? 'text-blue-700' : 'text-emerald-800'}`}>{live ? '실투자 종목 조회' : `모의투자 ${mode === 'sell' ? '매도' : '매수'}`}</p><h2 className="mt-1 text-xl font-bold">{stock.name}</h2><p className="mt-1 text-xs text-slate-500">{stock.code} · {stock.market}</p></div><button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-lg hover:bg-slate-100" aria-label="닫기"><X className="size-5"/></button></header>
    <div className="space-y-4 p-4 sm:p-5">
      {notification && <div className={`flex gap-2 rounded-xl border p-3 text-sm ${notification.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'}`}>{notification.tone === 'success' ? <CheckCircle2 className="size-4 shrink-0"/> : <AlertCircle className="size-4 shrink-0"/>}<p>{notification.message}</p></div>}
      {detailQuery.isPending ? <div className="grid min-h-48 place-items-center"><LoaderCircle className="size-6 animate-spin text-emerald-800"/></div> : detailQuery.isError ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{detailQuery.error.message}</div> : detail && <>
        <section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold text-slate-500">현재가</p><p className="mt-2 text-2xl font-bold tabular-nums">{money(detail.currentPrice, detail.currency)}</p></div><div className={`flex items-center gap-1 text-sm font-semibold ${detail.changeRate > 0 ? 'text-rose-600' : detail.changeRate < 0 ? 'text-blue-600' : 'text-slate-500'}`}>{detail.changeRate > 0 ? <TrendingUp className="size-4"/> : <TrendingDown className="size-4"/>}{detail.change > 0 ? '+' : ''}{detail.change} ({detail.changeRate > 0 ? '+' : ''}{detail.changeRate}%)</div></div><dl className="mt-5 grid grid-cols-3 gap-3 border-t border-slate-100 pt-4 text-center"><div><dt className="text-[11px] text-slate-400">52주 최고</dt><dd className="mt-1 text-sm font-semibold">{money(detail.high52, detail.currency)}</dd></div><div><dt className="text-[11px] text-slate-400">52주 최저</dt><dd className="mt-1 text-sm font-semibold">{money(detail.low52, detail.currency)}</dd></div><div><dt className="text-[11px] text-slate-400">거래량</dt><dd className="mt-1 text-sm font-semibold">{count(detail.volume)}</dd></div></dl>{(detail.status || detail.warning) && <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{[detail.warning, detail.status].filter(Boolean).join(' · ')}</p>}</section>
        {!detail.tradable ? <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertCircle className="size-4 shrink-0"/><p>{detail.unavailableReason}</p></div> : <section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><h3 className="font-bold">{mode === 'sell' ? '매도' : '매수'} 주문</h3><span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><ShieldCheck className="size-4"/>모의투자 전용</span></div>
          {mode === 'sell' && <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-blue-50 p-3 text-sm"><div><p className="text-xs text-blue-600">보유수량</p><p className="mt-1 font-bold text-blue-950">{count(holdingQuantity ?? 0)}주</p></div><div><p className="text-xs text-blue-600">매도 가능</p><p className="mt-1 font-bold text-blue-950">{count(availableQuantity ?? 0)}주</p></div></div>}
          <div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => setOrderType('market')} className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${orderType === 'market' ? 'border-emerald-800 bg-emerald-50 text-emerald-900' : 'border-slate-200 text-slate-500'}`}>시장가</button><button type="button" onClick={() => setOrderType('limit')} className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${orderType === 'limit' ? 'border-emerald-800 bg-emerald-50 text-emerald-900' : 'border-slate-200 text-slate-500'}`}>지정가</button></div>
          <OrderQuantityControls quantity={quantity} unitPrice={orderType === 'limit' ? Number(price) : detail.currentPrice} currency={detail.currency} maximum={mode === 'sell' ? availableQuantity : undefined} onChange={setQuantity}/>
          {orderType === 'limit' && <label className="mt-4 block text-xs font-semibold text-slate-600">주문단가 ({detail.currency})<input type="number" min="0" step={detail.currency === 'KRW' ? '1' : '0.01'} value={price} onChange={(event) => setPrice(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-emerald-700"/></label>}
          {mode === 'sell' && availableQuantity !== undefined && Number(quantity) > availableQuantity && <p className="mt-2 text-xs font-semibold text-rose-600">매도 가능 수량을 초과했습니다.</p>}
          <button type="button" disabled={!valid || orderMutation.isPending || Boolean(order)} onClick={() => setConfirming(true)} className={`mt-5 h-11 w-full rounded-xl text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 ${mode === 'sell' ? 'bg-blue-700' : 'bg-emerald-900'}`}>{order ? '주문 접수 완료' : `${mode === 'sell' ? '매도' : '매수'} 주문 확인`}</button>
        </section>}
        {order && <section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><h3 className="font-bold">주문 상태</h3><button type="button" onClick={() => statusQuery.refetch()} disabled={statusQuery.isFetching} className="grid size-8 place-items-center rounded-lg border border-slate-200"><RefreshCw className={`size-4 ${statusQuery.isFetching ? 'animate-spin' : ''}`}/></button></div><p className="mt-3 text-sm font-semibold text-slate-700">{statusQuery.data?.statusLabel ?? '체결 확인 중'}</p>{statusQuery.data?.orderedQuantity !== undefined && <dl className="mt-3 grid grid-cols-3 gap-2 text-xs"><div><dt className="text-slate-400">주문</dt><dd className="mt-1 font-semibold">{statusQuery.data.orderedQuantity}주</dd></div><div><dt className="text-slate-400">체결</dt><dd className="mt-1 font-semibold">{statusQuery.data.filledQuantity}주</dd></div><div><dt className="text-slate-400">미체결</dt><dd className="mt-1 font-semibold">{statusQuery.data.remainingQuantity}주</dd></div></dl>}</section>}
      </>}
    </div>
  </dialog>
  {confirming && <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/45 p-4"><dialog open aria-label={`${mode === 'sell' ? '매도' : '매수'} 주문 최종 확인`} className="relative m-0 w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"><h3 className="text-lg font-bold">{mode === 'sell' ? '매도' : '매수'} 주문을 접수할까요?</h3><p className="mt-2 text-sm leading-relaxed text-slate-600">{stock.name} {quantity}주를 {orderType === 'market' ? '시장가' : `${price} ${detail?.currency} 지정가`}로 주문합니다. {mode === 'sell' ? '최종 확인 시 잔고와 매도 가능 수량을 다시 조회한 뒤 모의투자 주문이 전송됩니다.' : '최종 확인 시 모의투자 주문이 전송됩니다.'}</p><div className="mt-5 grid grid-cols-2 gap-2"><button type="button" onClick={() => setConfirming(false)} className="h-10 rounded-xl border border-slate-200 text-sm font-semibold">취소</button><button type="button" onClick={submitOrder} disabled={orderMutation.isPending} className={`h-10 rounded-xl text-sm font-bold text-white disabled:opacity-60 ${mode === 'sell' ? 'bg-blue-700' : 'bg-emerald-900'}`}>{orderMutation.isPending ? '재확인 중' : '최종 확인'}</button></div></dialog></div>}
  </>;
}
