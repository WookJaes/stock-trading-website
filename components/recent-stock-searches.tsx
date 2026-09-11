'use client';

import { useCallback, useEffect, useState } from 'react';
import { Clock3, Trash2, X } from 'lucide-react';
import {
  addRecentSearch,
  parseRecentSearches,
  RECENT_SEARCHES_STORAGE_KEY,
} from '@/lib/recent-searches';

function save(searches: string[]) {
  try {
    localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(searches));
  } catch {
    // 검색 기능은 저장 공간을 사용할 수 없는 브라우저에서도 계속 동작해야 합니다.
  }
}

export function useRecentStockSearches() {
  const [searches, setSearches] = useState<string[]>([]);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        setSearches(
          parseRecentSearches(
            localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY),
          ),
        );
      } catch {
        setSearches([]);
      }
    });
  }, []);

  const add = useCallback((search: string) => {
    setSearches((current) => {
      const next = addRecentSearch(current, search);
      save(next);
      return next;
    });
  }, []);

  const remove = useCallback((search: string) => {
    setSearches((current) => {
      const next = current.filter((item) => item !== search);
      save(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setSearches([]);
    try {
      localStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY);
    } catch {
      // 메모리 상태를 비우는 것만으로도 사용자의 삭제 동작은 완료됩니다.
    }
  }, []);

  return { searches, add, remove, clear };
}

export function RecentStockSearches({
  searches,
  onSelect,
  onRemove,
  onClear,
}: {
  searches: string[];
  onSelect: (search: string) => void;
  onRemove: (search: string) => void;
  onClear: () => void;
}) {
  if (searches.length === 0) return null;

  return (
    <section
      className="mt-4 border-t border-slate-100 pt-4"
      aria-label="최근 검색어"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
          <Clock3 className="size-3.5" />
          최근 검색어
        </h2>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-rose-600"
        >
          <Trash2 className="size-3.5" />
          전체 삭제
        </button>
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {searches.map((search) => (
          <li
            key={search}
            className="flex items-center rounded-full border border-slate-200 bg-slate-50 text-sm text-slate-700"
          >
            <button
              type="button"
              onClick={() => onSelect(search)}
              className="py-1.5 pl-3 pr-1 font-medium hover:text-emerald-800"
            >
              {search}
            </button>
            <button
              type="button"
              onClick={() => onRemove(search)}
              aria-label={`${search} 삭제`}
              className="mr-1 grid size-7 place-items-center rounded-full text-slate-400 hover:bg-white hover:text-rose-600"
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
