import { Skeleton } from '@/components/ui/Skeleton';

export function FeeCollectionDeskSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading fee collection desk">
      {/* Top Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-36 rounded-lg" />
      </div>

      {/* Main Grid: Content + Payment Sidebar */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* Left Column */}
        <div className="space-y-4 min-w-0">
          {/* Student Profile Banner */}
          <div className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-md)]">
            <div className="flex flex-wrap items-center gap-4">
              <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Skeleton className="h-6 w-24 rounded" />
                  <Skeleton className="h-6 w-28 rounded" />
                  <Skeleton className="h-6 w-20 rounded" />
                  <Skeleton className="h-6 w-24 rounded" />
                  <Skeleton className="h-6 w-20 rounded" />
                </div>
              </div>
              <div className="h-20 w-36 rounded-[var(--radius)] border border-slate-100 bg-slate-50 p-3 flex flex-col justify-between">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-7 w-24" />
              </div>
            </div>
          </div>

          {/* Year Cards Grid */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-sm)] space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <Skeleton className="h-3 w-8" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <Skeleton className="h-4 w-12 rounded" />
                </div>
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </div>

          {/* Examinations Tabs & Eligible Examinations Card */}
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
            <div className="border-b border-[var(--border)] px-5 pt-4">
              <div className="flex gap-2">
                <Skeleton className="h-9 w-32 rounded-t-lg" />
                <Skeleton className="h-9 w-32 rounded-t-lg" />
              </div>
            </div>
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
              <div className="space-y-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-64" />
              </div>
            </div>
            <div className="divide-y divide-[var(--border)] p-5 space-y-4">
              {[1, 2].map((i) => (
                <div key={i} className="flex flex-wrap items-center justify-between gap-3 pt-3 first:pt-0">
                  <div className="space-y-1.5 flex-1 min-w-[200px]">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-64" />
                    <Skeleton className="h-3 w-36" />
                  </div>
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-6 w-20 rounded" />
                    <Skeleton className="h-8 w-24 rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Fee Records Table Card */}
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
              <div className="space-y-1">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-52" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-20 rounded-lg" />
                <Skeleton className="h-8 w-20 rounded-lg" />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-slate-50/70">
                    <th className="px-4 py-3"><Skeleton className="h-4 w-4" /></th>
                    <th className="px-4 py-3"><Skeleton className="h-3 w-28" /></th>
                    <th className="px-4 py-3"><Skeleton className="h-3 w-20" /></th>
                    <th className="px-4 py-3"><Skeleton className="h-3 w-16" /></th>
                    <th className="px-4 py-3"><Skeleton className="h-3 w-16" /></th>
                    <th className="px-4 py-3 text-right"><Skeleton className="h-3 w-14 ml-auto" /></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {[1, 2, 3].map((r) => (
                    <tr key={r}>
                      <td className="px-4 py-3.5"><Skeleton className="h-4 w-4" /></td>
                      <td className="px-4 py-3.5 space-y-1"><Skeleton className="h-3.5 w-40" /><Skeleton className="h-2.5 w-24" /></td>
                      <td className="px-4 py-3.5"><Skeleton className="h-3 w-16" /></td>
                      <td className="px-4 py-3.5"><Skeleton className="h-3.5 w-16" /></td>
                      <td className="px-4 py-3.5"><Skeleton className="h-5 w-16 rounded-full" /></td>
                      <td className="px-4 py-3.5 text-right"><Skeleton className="h-7 w-16 rounded-lg ml-auto" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column (Payment Desk Sidebar) */}
        <div className="xl:sticky xl:top-4 xl:self-start">
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm space-y-4">
            <div className="border-b border-[var(--border)] pb-3 space-y-1.5">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3 w-44" />
            </div>

            {/* Selected summary */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 space-y-2">
              <div className="flex justify-between items-center">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-8" />
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-slate-200">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-6 w-24" />
              </div>
            </div>

            {/* Payment Method Channels */}
            <div className="space-y-2">
              <Skeleton className="h-3 w-28" />
              <div className="grid grid-cols-2 gap-2">
                <Skeleton className="h-10 rounded-lg" />
                <Skeleton className="h-10 rounded-lg" />
                <Skeleton className="h-10 rounded-lg" />
                <Skeleton className="h-10 rounded-lg" />
              </div>
            </div>

            {/* Inputs */}
            <div className="space-y-3 pt-1">
              <div className="space-y-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-9 w-full rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-14 w-full rounded-lg" />
              </div>
            </div>

            {/* Action button */}
            <Skeleton className="h-11 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function FeeStudentsTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white" aria-busy="true">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-[var(--border)] bg-slate-50/70">
            <th className="px-4 py-3"><Skeleton className="h-3 w-16" /></th>
            <th className="px-4 py-3"><Skeleton className="h-3 w-32" /></th>
            <th className="px-4 py-3"><Skeleton className="h-3 w-20" /></th>
            <th className="px-4 py-3"><Skeleton className="h-3 w-24" /></th>
            <th className="px-4 py-3"><Skeleton className="h-3 w-16" /></th>
            <th className="px-4 py-3 text-right"><Skeleton className="h-3 w-14 ml-auto" /></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {Array.from({ length: rows }).map((_, idx) => (
            <tr key={idx} className="hover:bg-slate-50/50">
              <td className="px-4 py-3.5"><Skeleton className="h-4 w-24 font-mono" /></td>
              <td className="px-4 py-3.5 space-y-1">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-2.5 w-24" />
              </td>
              <td className="px-4 py-3.5"><Skeleton className="h-3 w-20" /></td>
              <td className="px-4 py-3.5"><Skeleton className="h-3 w-28" /></td>
              <td className="px-4 py-3.5"><Skeleton className="h-5 w-16 rounded-full" /></td>
              <td className="px-4 py-3.5 text-right"><Skeleton className="h-8 w-20 rounded-lg ml-auto" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FeeLedgerTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white" aria-busy="true">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-[var(--border)] bg-slate-50/70">
            <th className="px-4 py-3"><Skeleton className="h-3 w-16" /></th>
            <th className="px-4 py-3"><Skeleton className="h-3 w-28" /></th>
            <th className="px-4 py-3"><Skeleton className="h-3 w-20" /></th>
            <th className="px-4 py-3"><Skeleton className="h-3 w-16" /></th>
            <th className="px-4 py-3"><Skeleton className="h-3 w-20" /></th>
            <th className="px-4 py-3 text-right"><Skeleton className="h-3 w-16 ml-auto" /></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {Array.from({ length: rows }).map((_, idx) => (
            <tr key={idx}>
              <td className="px-4 py-3.5"><Skeleton className="h-3.5 w-20 font-mono" /></td>
              <td className="px-4 py-3.5 space-y-1">
                <Skeleton className="h-3.5 w-36" />
                <Skeleton className="h-2.5 w-24" />
              </td>
              <td className="px-4 py-3.5"><Skeleton className="h-3 w-20" /></td>
              <td className="px-4 py-3.5"><Skeleton className="h-3.5 w-16" /></td>
              <td className="px-4 py-3.5"><Skeleton className="h-5 w-16 rounded-full" /></td>
              <td className="px-4 py-3.5 text-right"><Skeleton className="h-7 w-20 rounded-lg ml-auto" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StudentFeePaymentSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading application fee payment">
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-[var(--border)] bg-white p-4 space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-4 w-36" />
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-white p-4 space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-4 w-36" />
        </div>
      </div>
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-5 space-y-4">
        <div className="flex justify-between items-center">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-36" />
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-5 space-y-3">
        <Skeleton className="h-5 w-32" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
