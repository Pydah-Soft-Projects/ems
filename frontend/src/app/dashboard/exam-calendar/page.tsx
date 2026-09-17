'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { SdmsEvent } from '@/types/sdms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { LoadingBlock } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';

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

function formatDateFull(ymd: string) {
  const [year, month, day] = ymd.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function ExamCalendarPage() {
  const [cursor, setCursor] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<SdmsEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

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

function mergeCsvStrings(a?: string | null, b?: string | null): string | null {
  const items = new Set<string>();
  if (a) {
    a.split(',').forEach((s) => {
      const trimmed = s.trim();
      if (trimmed) items.add(trimmed);
    });
  }
  if (b) {
    b.split(',').forEach((s) => {
      const trimmed = s.trim();
      if (trimmed) items.add(trimmed);
    });
  }
  return items.size > 0 ? Array.from(items).join(', ') : null;
}

  const calendarEventMap = useMemo(() => {
    const map = new Map<string, SdmsEvent[]>();

    const addOrMerge = (dateKey: string, ev: SdmsEvent, isEndDate: boolean) => {
      if (!map.has(dateKey)) map.set(dateKey, []);
      const list = map.get(dateKey)!;

      let eventTitle = ev.title?.trim() || '';

      if (isEndDate) {
        if (eventTitle.startsWith('Application Open')) {
          eventTitle = eventTitle.replace('Application Open', 'Application Closing');
        } else if (eventTitle.startsWith('Application Start')) {
          eventTitle = eventTitle.replace('Application Start', 'Application Closing');
        } else if (eventTitle.startsWith('Application:')) {
          eventTitle = eventTitle.replace('Application:', 'Application Closing:');
        } else if (eventTitle.startsWith('Examination Start')) {
          eventTitle = eventTitle.replace('Examination Start', 'Examination End');
        } else if (eventTitle.startsWith('Examination:')) {
          eventTitle = eventTitle.replace('Examination:', 'Examination End:');
        }
      } else {
        if (eventTitle.startsWith('Application:')) {
          eventTitle = eventTitle.replace('Application:', 'Application Open:');
        } else if (eventTitle.startsWith('Examination:')) {
          eventTitle = eventTitle.replace('Examination:', 'Examination Start:');
        }
      }

      const idx = list.findIndex(
        (item) => (item.title?.trim() || '') === eventTitle
      );

      if (idx >= 0) {
        const existing = list[idx];
        list[idx] = {
          ...existing,
          title: eventTitle,
          targetCourse: mergeCsvStrings(existing.targetCourse, ev.targetCourse),
          targetBranch: mergeCsvStrings(existing.targetBranch, ev.targetBranch),
          targetCollege: mergeCsvStrings(existing.targetCollege, ev.targetCollege),
          targetBatch: mergeCsvStrings(existing.targetBatch, ev.targetBatch),
        };
      } else {
        list.push({ ...ev, title: eventTitle });
      }
    };

    for (const event of events) {
      const startKey = normalizeDateKey(event.eventDate);
      const endKey = normalizeDateKey(event.endDate) ?? startKey;

      if (startKey) {
        addOrMerge(startKey, event, false);
      }

      if (endKey && endKey !== startKey) {
        addOrMerge(endKey, event, true);
      }
    }

    return map;
  }, [events]);

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

  const selectedEvents = selectedDate ? (calendarEventMap.get(selectedDate) ?? []) : [];

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
                    const dayDate = cell.date;

                    return (
                      <div
                        key={cell.key}
                        onClick={() => setSelectedDate(dayDate)}
                        className={`min-h-24 min-w-0 cursor-pointer overflow-hidden rounded-lg border p-1.5 transition hover:border-[var(--primary)] hover:shadow-sm sm:min-h-28 sm:p-2 lg:min-h-36 ${
                          isToday
                            ? 'border-[var(--primary)] bg-[var(--primary-soft)]/30'
                            : 'border-[var(--border)] bg-white'
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
                              const kind = title.startsWith('Application Open') || title.startsWith('Application Start')
                                ? 'App Opens'
                                : title.startsWith('Application Close') || title.startsWith('Application Closing') || title.startsWith('Application End')
                                  ? 'App Closes'
                                  : title.startsWith('Late Fee')
                                    ? 'Late Fee'
                                    : title.startsWith('Examination Start')
                                      ? 'Exam Starts'
                                      : title.startsWith('Examination End')
                                        ? 'Exam Ends'
                                        : title.startsWith('Examination')
                                          ? 'Examination'
                                          : title.startsWith('Paper')
                                            ? 'Paper'
                                            : 'Exam';

                              const cellCourses = e.targetCourse
                                ? e.targetCourse.split(', ').map((s) => s.trim()).filter(Boolean)
                                : [];
                              const cellBranches = e.targetBranch
                                ? e.targetBranch.split(', ').map((s) => s.trim()).filter(Boolean)
                                : [];
                              const isMultiCourse = cellCourses.length > 1;
                              const isMultiBranch = cellBranches.length > 1;
                              const isLateFee = kind === 'Late Fee';
                              const showCellMultiBranch = isMultiBranch && !isLateFee;

                              return (
                                <div
                                  key={e.id}
                                  className={`min-w-0 rounded border px-1.5 py-1 text-[10px] sm:px-2 sm:text-xs ${
                                    kind === 'App Opens'
                                      ? 'border-blue-200 bg-blue-50 text-blue-800'
                                      : kind === 'App Closes'
                                        ? 'border-rose-200 bg-rose-50 text-rose-800'
                                        : kind === 'Late Fee'
                                          ? 'border-amber-200 bg-amber-50 text-amber-800'
                                          : kind === 'Exam Starts' || kind === 'Examination'
                                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                            : kind === 'Exam Ends'
                                              ? 'border-teal-200 bg-teal-50 text-teal-800'
                                              : kind === 'Paper'
                                                ? 'border-purple-200 bg-purple-50 text-purple-800'
                                                : 'border-slate-200 bg-white/80 text-slate-700'
                                  }`}
                                  title={title}
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <p className="truncate font-medium">{title}</p>
                                    {(isMultiCourse || showCellMultiBranch) && (
                                      <span className="shrink-0 rounded bg-slate-900/10 px-1 py-0.5 text-[9px] font-bold tracking-tight text-slate-800">
                                        {isMultiCourse && showCellMultiBranch
                                          ? 'Multi'
                                          : isMultiCourse
                                            ? `${cellCourses.length} Courses`
                                            : `${cellBranches.length} Branches`}
                                      </span>
                                    )}
                                  </div>
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

      <Dialog
        open={!!selectedDate}
        onClose={() => setSelectedDate(null)}
        title={selectedDate ? `Events on ${formatDateFull(selectedDate)}` : ''}
        description={
          selectedDate
            ? `${selectedEvents.length} event${selectedEvents.length !== 1 ? 's' : ''} scheduled for this date.`
            : undefined
        }
        size="lg"
        footer={
          <Button variant="secondary" onClick={() => setSelectedDate(null)}>
            Close
          </Button>
        }
      >
        {selectedEvents.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--muted)]">
            No exam events scheduled on this date.
          </p>
        ) : (
          <div className="space-y-3.5">
            {selectedEvents.map((e) => {
              const title = e.title?.trim() || 'Untitled event';
              const kind = title.startsWith('Application Open') || title.startsWith('Application Start')
                ? 'App Opens'
                : title.startsWith('Application Close') || title.startsWith('Application Closing') || title.startsWith('Application End')
                  ? 'App Closes'
                  : title.startsWith('Late Fee')
                    ? 'Late Fee'
                    : title.startsWith('Examination Start')
                      ? 'Exam Starts'
                      : title.startsWith('Examination End')
                        ? 'Exam Ends'
                        : title.startsWith('Examination')
                          ? 'Examination'
                          : title.startsWith('Paper')
                            ? 'Paper'
                            : 'Exam';

              const cleanDesc = (e.description ?? '').replace(/\[ems_exam_id:\d+\]/g, '').trim();

              const courses = e.targetCourse
                ? e.targetCourse.split(', ').map((s) => s.trim()).filter(Boolean)
                : [];
              const branches = e.targetBranch
                ? e.targetBranch.split(', ').map((s) => s.trim()).filter(Boolean)
                : [];
              const colleges = e.targetCollege
                ? e.targetCollege.split(', ').map((s) => s.trim()).filter(Boolean)
                : [];

              const isLateFeeEvent = kind === 'Late Fee';
              const hasMultipleCourses = courses.length > 1;
              const hasMultipleBranches = branches.length > 1 && !isLateFeeEvent;

              return (
                <div
                  key={e.id}
                  className="space-y-3 rounded-lg border border-[var(--border)] bg-slate-50/50 p-4 transition hover:bg-slate-50"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
                      {hasMultipleCourses && (
                        <span className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                          {courses.length} Courses
                        </span>
                      )}
                      {hasMultipleBranches && (
                        <span className="inline-flex items-center rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                          {branches.length} Branches
                        </span>
                      )}
                    </div>
                    <span
                      className={`inline-flex items-center rounded px-2.5 py-1 text-xs font-semibold ${
                        kind === 'App Opens'
                          ? 'bg-blue-100 text-blue-800 border border-blue-200'
                          : kind === 'App Closes'
                            ? 'bg-rose-100 text-rose-800 border border-rose-200'
                            : kind === 'Late Fee'
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : kind === 'Exam Starts' || kind === 'Examination'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : kind === 'Exam Ends'
                                  ? 'bg-teal-100 text-teal-800 border border-teal-200'
                                  : kind === 'Paper'
                                    ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                    : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {kind}
                    </span>
                  </div>

                  <div className="grid gap-2.5 text-xs text-slate-600 sm:grid-cols-2">
                    <div>
                      <span className="font-semibold text-slate-700">Date: </span>
                      {e.eventDate}
                      {e.endDate && e.endDate !== e.eventDate ? ` → ${e.endDate}` : ''}
                    </div>

                    {(e.startTime || e.endTime) && (
                      <div>
                        <span className="font-semibold text-slate-700">Time: </span>
                        {e.startTime ?? '—'} {e.endTime ? `to ${e.endTime}` : ''}
                      </div>
                    )}

                    {colleges.length > 0 && (
                      <div className="sm:col-span-2">
                        <span className="font-semibold text-slate-700">College: </span>
                        {colleges.join(', ')}
                      </div>
                    )}

                    {courses.length > 0 && (
                      <div className="sm:col-span-2 rounded-md border border-amber-200/70 bg-amber-50/60 p-2.5">
                        <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-amber-900">
                          <span>Courses ({courses.length}):</span>
                          {hasMultipleCourses && (
                            <span className="rounded bg-amber-200/70 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                              Multi-Course Exam
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {courses.map((c) => (
                            <span
                              key={c}
                              className="inline-flex items-center rounded-md border border-amber-300/80 bg-white px-2 py-1 text-xs font-medium text-amber-900 shadow-2xs"
                            >
                              {c}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {branches.length > 0 && (
                      <div className="sm:col-span-2 rounded-md border border-blue-200/70 bg-blue-50/60 p-2.5">
                        <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-blue-900">
                          <span>Branches ({branches.length}):</span>
                          {hasMultipleBranches && (
                            <span className="rounded bg-blue-200/70 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-800">
                              Multi-Branch Exam
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {branches.map((b) => (
                            <span
                              key={b}
                              className="inline-flex items-center rounded-md border border-blue-300/80 bg-white px-2 py-1 text-xs font-medium text-blue-900 shadow-2xs"
                            >
                              {b}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {(e.targetBatch || e.targetYear || e.targetSemester) && (
                      <div className="sm:col-span-2">
                        <span className="font-semibold text-slate-700">Scope Batch/Semester: </span>
                        {e.targetBatch ? `Batch ${e.targetBatch}` : ''}
                        {e.targetYear ? ` · Y${e.targetYear}` : ''}
                        {e.targetSemester ? ` / S${e.targetSemester}` : ''}
                      </div>
                    )}
                  </div>

                  {cleanDesc && (
                    <p className="border-t border-slate-200/60 pt-2 text-xs text-[var(--muted)]">
                      {cleanDesc}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Dialog>
    </div>
  );
}

