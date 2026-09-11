'use client';

import { Download } from 'lucide-react';
import { createHoldingsCsv, type CsvHolding } from '@/lib/account-csv';

type AccountCsvDownloadProps = {
  holdings: CsvHolding[];
  asOf: string;
};

function fileDate(asOf: string) {
  const date = new Date(asOf);
  return Number.isNaN(date.getTime())
    ? new Date().toISOString().slice(0, 10)
    : date.toISOString().slice(0, 10);
}

export function AccountCsvDownload({
  holdings,
  asOf,
}: AccountCsvDownloadProps) {
  const download = () => {
    const blob = new Blob([createHoldingsCsv(holdings)], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `holdings-${fileDate(asOf)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      type="button"
      onClick={download}
      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
      aria-label="보유 종목 CSV 다운로드"
    >
      <Download className="size-3.5" />
      전체 CSV
    </button>
  );
}
