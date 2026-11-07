'use client';

export interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  variant?: 'inline' | 'bar';
  className?: string;
}

export function Pagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50],
  variant = 'inline',
  className = '',
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);

  const startItem = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endItem = Math.min(safePage * pageSize, totalItems);

  // Generate page numbers with ellipsis
  const getPageNumbers = (): (number | '...')[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (safePage <= 4) {
      return [1, 2, 3, 4, 5, '...', totalPages];
    }
    if (safePage >= totalPages - 3) {
      return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, '...', safePage - 1, safePage, safePage + 1, '...', totalPages];
  };

  const pages = getPageNumbers();

  const containerClasses =
    variant === 'inline'
      ? `flex flex-wrap items-center justify-end gap-3 text-xs text-slate-600 ${className}`
      : `flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-white px-4 py-2.5 sm:px-5 text-xs text-slate-600 ${className}`;

  return (
    <div className={containerClasses}>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-slate-500">
          Showing <span className="font-semibold text-slate-800">{startItem}</span>–
          <span className="font-semibold text-slate-800">{endItem}</span> of{' '}
          <span className="font-semibold text-slate-800">{totalItems}</span>
        </span>

        {onPageSizeChange && totalItems > 0 && (
          <div className="flex items-center gap-1 text-[11px]">
            <span className="text-slate-300">·</span>
            <span className="text-slate-400">Per page:</span>
            <select
              value={pageSize}
              aria-label="Items per page"
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                onPageChange(1);
              }}
              className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-xs font-semibold text-slate-700 outline-none hover:border-slate-300 focus:border-[var(--primary)] cursor-pointer"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <nav aria-label="Pagination Navigation" className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(safePage - 1)}
            disabled={safePage <= 1}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-40"
          >
            <svg
              className="h-3 w-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            <span className="hidden sm:inline">Previous</span>
          </button>

          <div className="flex items-center gap-1">
            {pages.map((p, idx) =>
              p === '...' ? (
                <span key={`dots-${idx}`} className="px-1 text-slate-400 select-none text-[11px]">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => onPageChange(p)}
                  className={`min-w-[26px] h-7 rounded-md px-1.5 text-xs font-semibold transition ${
                    p === safePage
                      ? 'bg-[var(--primary)] text-white shadow-xs'
                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  {p}
                </button>
              ),
            )}
          </div>

          <button
            type="button"
            onClick={() => onPageChange(safePage + 1)}
            disabled={safePage >= totalPages}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-40"
          >
            <span className="hidden sm:inline">Next</span>
            <svg
              className="h-3 w-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </nav>
      )}
    </div>
  );
}
