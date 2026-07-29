'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { SdmsEvent } from '@/types/sdms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { LoadingBlock } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function toYmd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function fromYmd(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function normalizeDateKey(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

export default function ExamCalendarPage() {
  const [cursor, setCursor] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<SdmsEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const monthRange = useMemo(() => {
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    return { from: toYmd(monthStart), to: toYmd(monthEnd) };
  }, [cursor]);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEvents(await api.getSdmsEvents({ from: monthRange.from, to: monthRange.to }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load exam events.');
    } finally {
      setLoading(false);
    }
  }, [monthRange.from, monthRange.to]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const monthLabel = useMemo(() => {
    const name = cursor.toLocaleString(undefined, { month: 'long' });
    return `${name} ${cursor.getFullYear()}`;
  }, [cursor]);

  const calendarEventMap = useMemo(() => {
    const map = new Map<string, SdmsEvent[]>();
    const monthStart = fromYmd(monthRange.from);
    const monthEnd = fromYmd(monthRange.to);

    for (const event of events) {
      const startKey = normalizeDateKey(event.eventDate);
      const endKey = normalizeDateKey(event.endDate) ?? startKey;
      if (!startKey || !endKey) continue;

      const startDate = fromYmd(startKey);
      const endDate = fromYmd(endKey);
      const visibleStart = startDate > monthStart ? startDate : monthStart;
      const visibleEnd = endDate < monthEnd ? endDate : monthEnd;

      if (visibleStart > visibleEnd) continue;

      for (
        let day = new Date(visibleStart);
        day <= visibleEnd;
        day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
      ) {
        const key = toYmd(day);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(event);
      }
    }

    return map;
  }, [events, monthRange.from, monthRange.to]);

  const calendarDays = useMemo(() => {
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const leadingEmptyDays = monthStart.getDay();
    const totalDays = monthEnd.getDate();
    const cells: Array<{ key: string; date: string | null; dayNumber: number | null }> = [];

    for (let i = 0; i < leadingEmptyDays; i += 1) {
      cells.push({ key: `empty-start-${i}`, date: null, dayNumber: null });
    }

    for (let day = 1; day <= totalDays; day += 1) {
      const date = toYmd(new Date(cursor.getFullYear(), cursor.getMonth(), day));
      cells.push({ key: date, date, dayNumber: day });
    }

    while (cells.length % 7 !== 0) {
      cells.push({
        key: `empty-end-${cells.length}`,
        date: null,
        dayNumber: null,
      });
    }

    return cells;
  }, [cursor]);

  const todayYmd = useMemo(() => toYmd(new Date()), []);
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exam Calendar"
        description="Admin view of exam application, late-fee slabs, and examination date windows."
        action={
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Button
              variant="secondary"
              onClick={() => setCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
            >
              Prev
            </Button>
            <Button
              variant="secondary"
              onClick={() => setCursor(() => new Date())}
            >
              Today
            </Button>
            <Button
              variant="secondary"
              onClick={() => setCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
            >
              Next
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader title={monthLabel} description={`Showing events from ${monthRange.from} to ${monthRange.to}`} />
        <CardBody>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          {loading ? (
            <LoadingBlock label="Loading exam events…" />
          ) : events.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No exam events found for this month.</p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-wide text-[var(--muted)] sm:gap-2 sm:text-xs">
                  {weekDays.map((day) => (
                    <div
                      key={day}
                      className="min-w-0 rounded-md bg-slate-50 px-1 py-2 sm:px-2"
                    >
                      {day}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1 sm:gap-2">
                  {calendarDays.map((cell) => {
                    if (!cell.date || !cell.dayNumber) {
                      return (
                        <div
                          key={cell.key}
                          className="min-h-24 min-w-0 rounded-lg border border-dashed border-slate-200 bg-slate-50/40 sm:min-h-28 lg:min-h-36"
                        />
                      );
                    }

                    const rows = calendarEventMap.get(cell.date) ?? [];
                    const isToday = cell.date === todayYmd;
                    const visibleRows = rows.slice(0, 2);
                    const hiddenCount = rows.length - visibleRows.length;

                    return (
                      <div
                        key={cell.key}
                        className={`min-h-24 min-w-0 overflow-hidden rounded-lg border p-1.5 sm:min-h-28 sm:p-2 lg:min-h-36 ${
                          isToday
                            ? 'border-[var(--primary)] bg-[var(--primary-soft)]/30'
                            : 'border-[var(--border)]'
                        }`}
                      >
                        <div className="mb-1 flex items-center justify-end">
                          <span
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold sm:text-xs ${
                              isToday
                                ? 'bg-[var(--primary)] text-white'
                                : 'text-slate-900'
                            }`}
                          >
                            {cell.dayNumber}
                          </span>
                        </div>

                        {rows.length === 0 ? (
                          <p className="hidden text-xs text-[var(--muted)] sm:block">
                            No events
                          </p>
                        ) : (
                          <div className="space-y-1">
                            {visibleRows.map((e) => {
                              const title =
                                typeof e.title === 'string' && e.title.trim()
                                  ? e.title.trim()
                                  : 'Untitled event';
                              const kind = title.startsWith('Application')
                                ? 'Application'
                                : title.startsWith('Late Fee')
                                  ? 'Late Fee'
                                  : title.startsWith('Examination')
                                    ? 'Examination'
                                    : 'Exam';

                              return (
                                <div
                                  key={e.id}
                                  className={`min-w-0 rounded border px-1.5 py-1 text-[10px] sm:px-2 sm:text-xs ${
                                    kind === 'Application'
                                      ? 'border-blue-200 bg-blue-50 text-blue-800'
                                      : kind === 'Late Fee'
                                        ? 'border-amber-200 bg-amber-50 text-amber-800'
                                        : kind === 'Examination'
                                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                          : 'border-slate-200 bg-white/80 text-slate-700'
                                  }`}
                                  title={title}
                                >
                                  <p className="truncate font-medium">{title}</p>
                                  <p className="mt-0.5 hidden uppercase tracking-wide sm:block">
                                    {kind}
                                  </p>
                                </div>
                              );
                            })}
                            {hiddenCount > 0 ? (
                              <p className="px-1 text-[10px] font-medium text-[var(--muted)] sm:text-xs">
                                +{hiddenCount} more
                              </p>
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

