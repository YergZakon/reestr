"use client";
import { useEffect, useState, KeyboardEvent } from "react";

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
}: PaginationProps) {
  // Input «К странице N» — local state, синхронизируется с реальным page
  const [jumpInput, setJumpInput] = useState<string>(String(page));

  // Если page изменился извне (фильтр, стрелка, прыжок) — обновим input
  useEffect(() => {
    setJumpInput(String(page));
  }, [page]);

  function handleJumpKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const n = parseInt(jumpInput, 10);
    if (!Number.isFinite(n)) return;
    const clamped = Math.max(1, Math.min(totalPages, n));
    if (clamped !== page) onPageChange(clamped);
    // Если клампилось — обновим input на корректное значение визуально
    setJumpInput(String(clamped));
  }

  if (totalPages <= 1) return null;

  const pages: (number | string)[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("...");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      pages.push(i);
    }
    if (page < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-between pt-4 gap-3 flex-wrap">
      <span className="text-sm text-slate-500">
        Всего: {total} требований
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="px-2 py-1 text-sm border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ←
        </button>
        {pages.map((p, i) =>
          typeof p === "string" ? (
            <span key={`dot-${i}`} className="px-2 text-slate-400">
              ...
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`px-3 py-1 text-sm rounded-md ${
                p === page
                  ? "bg-blue-600 text-white"
                  : "border border-slate-300 hover:bg-slate-50"
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="px-2 py-1 text-sm border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          →
        </button>
      </div>

      <div className="flex items-center gap-1.5 text-sm text-slate-500">
        <span>К странице</span>
        <input
          type="number"
          min={1}
          max={totalPages}
          value={jumpInput}
          onChange={(e) => setJumpInput(e.target.value)}
          onKeyDown={handleJumpKey}
          className="w-16 px-2 py-1 text-sm border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-transparent outline-none text-center"
          aria-label="Перейти к странице"
          title="Введите номер страницы и нажмите Enter"
        />
        <span>/ {totalPages}</span>
      </div>
    </div>
  );
}
