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

  const eventsByDate = useMemo(() => {
    const map = new Map<string, SdmsEvent[]>();
    for (const e of events) {
      const key = e.eventDate;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [events]);

  const monthLabel = useMemo(() => {
    const name = cursor.toLocaleString(undefined, { month: 'long' });
    return `${name} ${cursor.getFullYear()}`;
  }, [cursor]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exam Calendar"
        description="Admin view of exam application, late-fee slabs, and examination date windows."
        action={
          <div className="flex items-center gap-2">
            <Button
              tone="secondary"
              onClick={() => setCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
            >
              Prev
            </Button>
            <Button
              tone="secondary"
              onClick={() => setCursor(() => new Date())}
            >
              Today
            </Button>
            <Button
              tone="secondary"
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
          ) : eventsByDate.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No exam events found for this month.</p>
          ) : (
            <div className="space-y-6">
              {eventsByDate.map(([date, rows]) => (
                <div key={date} className="space-y-2">
                  <p className="text-sm font-semibold text-slate-900">{date}</p>
                  <div className="space-y-2 rounded-lg border p-3">
                    {rows.map((e) => {
                      const kind =
                        e.title.startsWith('Application') ? 'Application' :
                        e.title.startsWith('Late Fee') ? 'Late Fee' :
                        e.title.startsWith('Examination') ? 'Examination' :
                        'Exam';
                      const scopeParts = [
                        e.targetCollege,
                        e.targetCourse,
                        e.targetBranch,
                        e.targetBatch,
                        e.targetYear != null ? `Y${e.targetYear}` : null,
                        e.targetSemester != null ? `S${e.targetSemester}` : null,
                      ].filter(Boolean) as string[];
                      const scope = scopeParts.length ? scopeParts.join(' · ') : '—';
                      const range =
                        e.endDate && e.endDate !== e.eventDate
                          ? `${e.eventDate} → ${e.endDate}`
                          : `${e.eventDate}`;
                      return (
                        <div key={e.id} className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                              {kind}
                            </span>
                            <span className="text-sm font-medium text-slate-900">{e.title}</span>
                          </div>
                          <p className="text-xs text-slate-600">{range}</p>
                          <p className="text-xs text-slate-500">Scope: {scope}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

