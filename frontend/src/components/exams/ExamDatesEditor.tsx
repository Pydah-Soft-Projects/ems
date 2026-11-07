/* eslint-disable react-hooks/set-state-in-effect */

'use client';

import { useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Exam, ExamSession, ExamSubjectDateInput } from '@/types/exam';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';

interface SubjectScheduleState {
  id?: number;
  subjectId: number;
  code: string;
  name: string;
  branch: string;
  section: string;
  examDate: string;
  session: ExamSession | '';
  startTime: string;
  endTime: string;
  durationMinutes: string;
}

function computeDuration(start: string, end: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff > 0 ? diff : null;
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  const resY = dt.getFullYear();
  const resM = String(dt.getMonth() + 1).padStart(2, '0');
  const resD = String(dt.getDate()).padStart(2, '0');
  return `${resY}-${resM}-${resD}`;
}

function nextWorkingDate(dateStr: string): string {
  let next = addDays(dateStr, 1);
  const [y, m, d] = next.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getDay() === 0) {
    // Skip Sunday
    next = addDays(next, 1);
  }
  return next;
}

function fmtDate(value: string | null | undefined) {
  if (!value) return '—';
  try {
    const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, y, m, d] = match;
      const dt = new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0);
      return dt.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    }
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return String(value);
  }
}

interface ExamDatesEditorProps {
  exam: Exam;
  onSave?: (updated: Exam) => void;
  onCancel: () => void;
}

export function ExamDatesEditor({
  exam,
  onSave,
  onCancel,
}: ExamDatesEditorProps) {
  const toast = useToast();

  const [examinationStartDate, setExaminationStartDate] = useState(
    exam.examinationStartDate || '',
  );
  const [examinationEndDate, setExaminationEndDate] = useState(
    exam.examinationEndDate || '',
  );
  const [savingDates, setSavingDates] = useState(false);
  const [editorError, setEditorError] = useState('');
  const [startDateError, setStartDateError] = useState('');
  const [endDateError, setEndDateError] = useState('');

  const appEndDateStr = useMemo(() => {
    if (!exam.applicationEndDate) return '';
    return String(exam.applicationEndDate).slice(0, 10);
  }, [exam.applicationEndDate]);

  const minExamStartDate = useMemo(() => {
    if (!appEndDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(appEndDateStr)) return undefined;
    return addDays(appEndDateStr, 1);
  }, [appEndDateStr]);

  function validateStart(val: string, currentEnd = examinationEndDate) {
    if (!val) {
      setStartDateError('Examination start date is required.');
      return false;
    }
    if (appEndDateStr && val <= appEndDateStr) {
      setStartDateError(
        `Examination start date must be strictly after application closing date (${fmtDate(appEndDateStr)}). Earliest allowed: ${fmtDate(minExamStartDate)}.`,
      );
      return false;
    }
    if (currentEnd && val > currentEnd) {
      setStartDateError('Examination start date cannot be after examination end date.');
      return false;
    }
    setStartDateError('');
    return true;
  }

  function validateEnd(val: string, currentStart = examinationStartDate) {
    if (!val) {
      setEndDateError('');
      return true;
    }
    if (currentStart && val < currentStart) {
      setEndDateError('Examination end date cannot be earlier than examination start date.');
      return false;
    }
    if (appEndDateStr && val <= appEndDateStr) {
      setEndDateError(
        `Examination end date must be strictly after application closing date (${fmtDate(appEndDateStr)}).`,
      );
      return false;
    }
    setEndDateError('');
    return true;
  }

  // Bulk timing inline state
  const [bulkSession, setBulkSession] = useState<ExamSession>('FN');
  const [bulkStartTime, setBulkStartTime] = useState('10:00');
  const [bulkEndTime, setBulkEndTime] = useState('13:00');

  const [subjectRows, setSubjectRows] = useState<SubjectScheduleState[]>(() => {
    return (exam.examSubjects ?? []).map((es) => {
      const start = es.startTime || '';
      const end = es.endTime || '';
      const duration = es.durationMinutes
        ? String(es.durationMinutes)
        : computeDuration(start, end) != null
          ? String(computeDuration(start, end))
          : '';

      return {
        id: es.id,
        subjectId: es.subjectId,
        code: es.subject?.code || String(es.subjectId),
        name: es.subject?.name || '',
        branch: es.branch || '',
        section: es.section || '',
        examDate: es.examDate || '',
        session: es.session || '',
        startTime: start,
        endTime: end,
        durationMinutes: duration,
      };
    });
  });

  const groupedRows = useMemo(() => {
    const map = new Map<string, SubjectScheduleState[]>();
    for (const r of subjectRows) {
      const key = `${r.branch || 'Common'}${r.section ? ` · Sec ${r.section}` : ''}`;
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [subjectRows]);

  function handleAutoFillDates() {
    setEditorError('');
    if (!examinationStartDate) {
      const msg = 'Please set an Examination Start Date first before auto-filling dates.';
      setEditorError(msg);
      setStartDateError('Examination start date is required.');
      return;
    }
    if (appEndDateStr && examinationStartDate <= appEndDateStr) {
      const msg = `Examination start date (${fmtDate(examinationStartDate)}) must be strictly after the application closing date (${fmtDate(appEndDateStr)}). Earliest allowed: ${fmtDate(minExamStartDate)}.`;
      setEditorError(msg);
      setStartDateError(msg);
      return;
    }
    if (examinationEndDate && examinationStartDate > examinationEndDate) {
      const msg = 'Examination start date cannot be after examination end date.';
      setEditorError(msg);
      setStartDateError(msg);
      return;
    }

    setStartDateError('');
    setEndDateError('');
    let currentDate = examinationStartDate;
    setSubjectRows((prev) => {
      return prev.map((row, idx) => {
        const assignedDate = idx === 0 ? currentDate : nextWorkingDate(currentDate);
        currentDate = assignedDate;
        return {
          ...row,
          examDate: assignedDate,
          session: row.session || 'FN',
          startTime: row.startTime || '10:00',
          endTime: row.endTime || '13:00',
          durationMinutes: row.durationMinutes || '180',
        };
      });
    });
    if (!examinationEndDate && subjectRows.length > 0) {
      setExaminationEndDate(currentDate);
    }
    toast.push('Auto-filled sequential dates skipping Sundays.', 'success');
  }

  function handleApplyBulkTimings() {
    const diff = computeDuration(bulkStartTime, bulkEndTime);
    setSubjectRows((prev) =>
      prev.map((r) => ({
        ...r,
        session: bulkSession,
        startTime: bulkStartTime,
        endTime: bulkEndTime,
        durationMinutes: diff ? String(diff) : r.durationMinutes,
      })),
    );
    toast.push('Applied timings to all papers.', 'success');
  }

  function handleClearAllDates() {
    setSubjectRows((prev) =>
      prev.map((r) => ({
        ...r,
        examDate: '',
        session: '',
        startTime: '',
        endTime: '',
        durationMinutes: '',
      })),
    );
  }

  async function handleSaveDates() {
    setEditorError('');

    if (!examinationStartDate) {
      const msg = 'Examination start date is required.';
      setEditorError(msg);
      setStartDateError(msg);
      return;
    }

    if (appEndDateStr && examinationStartDate <= appEndDateStr) {
      const msg = `Examination start date (${fmtDate(examinationStartDate)}) must be strictly after application closing date (${fmtDate(appEndDateStr)}). Earliest allowed is ${fmtDate(minExamStartDate)}.`;
      setEditorError(msg);
      setStartDateError(msg);
      return;
    }

    if (examinationEndDate && examinationStartDate > examinationEndDate) {
      const msg = 'Examination start date cannot be after examination end date.';
      setEditorError(msg);
      setEndDateError('End date must be on or after start date.');
      return;
    }

    if (examinationEndDate && appEndDateStr && examinationEndDate <= appEndDateStr) {
      const msg = `Examination end date (${fmtDate(examinationEndDate)}) must be after application closing date (${fmtDate(appEndDateStr)}).`;
      setEditorError(msg);
      setEndDateError(msg);
      return;
    }

    for (const r of subjectRows) {
      if (r.examDate) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(r.examDate)) {
          setEditorError(`Invalid date format for ${r.code}`);
          return;
        }
        if (appEndDateStr && r.examDate <= appEndDateStr) {
          setEditorError(
            `Subject ${r.code} date (${fmtDate(r.examDate)}) cannot be on or before application closing date (${fmtDate(appEndDateStr)}).`,
          );
          return;
        }
        if (examinationStartDate && r.examDate < examinationStartDate) {
          setEditorError(`Subject ${r.code} date (${fmtDate(r.examDate)}) is before exam start date (${fmtDate(examinationStartDate)}).`);
          return;
        }
        if (examinationEndDate && r.examDate > examinationEndDate) {
          setEditorError(`Subject ${r.code} date (${fmtDate(r.examDate)}) is after exam end date (${fmtDate(examinationEndDate)}).`);
          return;
        }
      }
      if (r.startTime && r.endTime) {
        const d = computeDuration(r.startTime, r.endTime);
        if (d == null) {
          setEditorError(`End time must be after start time for ${r.code}`);
          return;
        }
      }
    }

    setSavingDates(true);
    try {
      const payloadSubjects: ExamSubjectDateInput[] = subjectRows.map((r) => {
        const duration = r.durationMinutes
          ? parseInt(r.durationMinutes, 10)
          : computeDuration(r.startTime, r.endTime) ?? null;

        return {
          id: r.id,
          subjectId: r.subjectId,
          branch: r.branch || null,
          section: r.section || null,
          examDate: r.examDate || null,
          session: (r.session as ExamSession) || null,
          startTime: r.startTime || null,
          endTime: r.endTime || null,
          durationMinutes: duration,
        };
      });

      const updated = await api.updateExamDates(exam.id, {
        examinationStartDate: examinationStartDate || null,
        examinationEndDate: examinationEndDate || null,
        subjects: payloadSubjects,
      });

      toast.push('External exam dates notification saved successfully.', 'success');
      onSave?.(updated);
    } catch (err) {
      setEditorError(
        err instanceof ApiError
          ? err.message
          : 'Failed to save examination dates notification.',
      );
    } finally {
      setSavingDates(false);
    }
  }

  const scheduledCount = subjectRows.filter((r) => !!r.examDate).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Schedule Dates Notification · ${exam.name}`}
        description="Set the examination window, sessions, and individual subject timetables inline for this notification."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={onCancel} disabled={savingDates}>
              ← Back to Notifications
            </Button>
            <Button variant="primary" onClick={() => void handleSaveDates()} loading={savingDates}>
              Save Dates Notification
            </Button>
          </div>
        }
      />

      {editorError ? <Alert tone="danger">{editorError}</Alert> : null}

      {/* Scope Info Banner */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
          <div>
            <span className="font-semibold text-slate-500 uppercase tracking-wider block text-[10px]">
              Course & Branch
            </span>
            <p className="mt-0.5 font-bold text-slate-800">{exam.course} · {exam.branch}</p>
          </div>
          <div>
            <span className="font-semibold text-slate-500 uppercase tracking-wider block text-[10px]">
              Academic Scope
            </span>
            <p className="mt-0.5 font-bold text-slate-800">
              Batch {exam.batch} · Year {exam.yearOfStudy} · Semester {exam.semester}
            </p>
          </div>
          <div>
            <span className="font-semibold text-slate-500 uppercase tracking-wider block text-[10px]">
              Application Window
            </span>
            <p className="mt-0.5 font-bold text-slate-800">
              {fmtDate(exam.applicationStartDate)} → {fmtDate(exam.applicationEndDate)}
            </p>
          </div>
          <div>
            <span className="font-semibold text-slate-500 uppercase tracking-wider block text-[10px]">
              Timetable Progress
            </span>
            <p className="mt-0.5 font-bold text-emerald-700">
              {scheduledCount} / {subjectRows.length} Papers Scheduled
            </p>
          </div>
        </div>
      </div>

      {/* Examination Dates Window Card */}
      <Card>
        <CardHeader
          title="Examination Dates Window"
          description="Overall examination start and end dates encompassing all subject timetables."
        />
        <CardBody className="space-y-4">
          {appEndDateStr ? (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-xs text-amber-900">
              <span className="font-semibold">Fee Application Closing Date:</span>
              <span className="font-bold underline">{fmtDate(appEndDateStr)}</span>
              <span className="text-amber-700">
                — Examination start date must be scheduled on or after <span className="font-bold">{fmtDate(minExamStartDate)}</span>.
              </span>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Examination Start Date"
              type="date"
              value={examinationStartDate}
              min={minExamStartDate}
              error={startDateError}
              hint={
                appEndDateStr
                  ? `Must be strictly after application closing date (${fmtDate(appEndDateStr)}). Earliest allowed: ${fmtDate(minExamStartDate)}.`
                  : 'Start date of the overall examination window.'
              }
              onChange={(e) => {
                const val = e.target.value;
                setExaminationStartDate(val);
                validateStart(val);
                if (examinationEndDate) {
                  validateEnd(examinationEndDate, val);
                }
              }}
              required
            />
            <Input
              label="Examination End Date"
              type="date"
              value={examinationEndDate}
              min={examinationStartDate || minExamStartDate}
              error={endDateError}
              hint={
                examinationStartDate
                  ? `Must be on or after exam start date (${fmtDate(examinationStartDate)}).`
                  : appEndDateStr
                    ? `Must be after ${fmtDate(appEndDateStr)}.`
                    : 'End date of the overall examination window.'
              }
              onChange={(e) => {
                const val = e.target.value;
                setExaminationEndDate(val);
                validateEnd(val);
                if (examinationStartDate) {
                  validateStart(examinationStartDate, val);
                }
              }}
              required
            />
          </div>
        </CardBody>
      </Card>

      {/* Subject Timetable Card */}
      <Card>
        <CardHeader
          title={`Subject Timetable (${subjectRows.length} papers)`}
          description="Configure exam dates, sessions, and start/end timings for each paper."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                className="!px-3 !py-1.5 text-xs font-semibold"
                onClick={handleAutoFillDates}
                title="Automatically assign consecutive dates starting from examination start date"
              >
                Auto-fill Sequential Dates
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="!px-3 !py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                onClick={handleClearAllDates}
              >
                Clear All Dates
              </Button>
            </div>
          }
        />
        <CardBody className="space-y-6">
          {/* Quick Bulk Timings Toolbar */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Quick Timings Setup:
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={bulkSession}
                onChange={(e) => setBulkSession(e.target.value as ExamSession)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium outline-none focus:border-[var(--primary)]"
              >
                <option value="FN">FN (Forenoon)</option>
                <option value="AN">AN (Afternoon)</option>
              </select>
              <input
                type="time"
                value={bulkStartTime}
                onChange={(e) => setBulkStartTime(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium outline-none focus:border-[var(--primary)]"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="time"
                value={bulkEndTime}
                onChange={(e) => setBulkEndTime(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium outline-none focus:border-[var(--primary)]"
              />
              <Button
                type="button"
                variant="secondary"
                className="!px-3 !py-1.5 text-xs"
                onClick={handleApplyBulkTimings}
              >
                Apply to All Papers
              </Button>
            </div>
          </div>

          {/* Grouped Timetable Tables */}
          {groupedRows.map(([groupName, rows]) => (
            <div key={groupName} className="space-y-3 rounded-xl border border-slate-200 overflow-hidden">
              <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  {groupName}
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  {rows.length} paper{rows.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="py-2.5 px-4">Subject</th>
                      <th className="py-2.5 px-4 w-44">Exam Date</th>
                      <th className="py-2.5 px-4 w-32">Session</th>
                      <th className="py-2.5 px-4 w-32">Start Time</th>
                      <th className="py-2.5 px-4 w-32">End Time</th>
                      <th className="py-2.5 px-4 w-28">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row) => {
                      const globalIndex = subjectRows.findIndex(
                        (r) =>
                          r.subjectId === row.subjectId &&
                          r.branch === row.branch &&
                          r.section === row.section,
                      );

                      const updateRow = (patch: Partial<SubjectScheduleState>) => {
                        setSubjectRows((prev) => {
                          const next = [...prev];
                          next[globalIndex] = { ...next[globalIndex], ...patch };
                          return next;
                        });
                      };

                      return (
                        <tr
                          key={`${row.subjectId}|${row.branch}|${row.section}`}
                          className="hover:bg-slate-50/80 transition"
                        >
                          <td className="py-3 px-4">
                            <p className="font-bold text-slate-900">{row.code}</p>
                            <p className="text-[11px] text-[var(--muted)]">{row.name}</p>
                          </td>
                          <td className="py-3 px-4">
                            <input
                              type="date"
                              value={row.examDate}
                              min={examinationStartDate || minExamStartDate}
                              max={examinationEndDate || undefined}
                              onChange={(e) => {
                                const nextDateVal = e.target.value;
                                updateRow({ examDate: nextDateVal });
                                if (nextDateVal && appEndDateStr && nextDateVal <= appEndDateStr) {
                                  toast.push(
                                    `Date for ${row.code} must be after application closing date (${fmtDate(appEndDateStr)}).`,
                                    'danger',
                                  );
                                } else if (nextDateVal && examinationStartDate && nextDateVal < examinationStartDate) {
                                  toast.push(
                                    `Date for ${row.code} cannot be before exam start date (${fmtDate(examinationStartDate)}).`,
                                    'danger',
                                  );
                                } else if (nextDateVal && examinationEndDate && nextDateVal > examinationEndDate) {
                                  toast.push(
                                    `Date for ${row.code} cannot be after exam end date (${fmtDate(examinationEndDate)}).`,
                                    'danger',
                                  );
                                }
                              }}
                              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                            />
                          </td>
                          <td className="py-3 px-4">
                            <select
                              value={row.session}
                              onChange={(e) =>
                                updateRow({ session: e.target.value as ExamSession | '' })
                              }
                              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                            >
                              <option value="">Auto</option>
                              <option value="FN">FN (Forenoon)</option>
                              <option value="AN">AN (Afternoon)</option>
                            </select>
                          </td>
                          <td className="py-3 px-4">
                            <input
                              type="time"
                              value={row.startTime}
                              onChange={(e) => {
                                const start = e.target.value;
                                const d = computeDuration(start, row.endTime);
                                updateRow({
                                  startTime: start,
                                  durationMinutes: d ? String(d) : row.durationMinutes,
                                });
                              }}
                              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                            />
                          </td>
                          <td className="py-3 px-4">
                            <input
                              type="time"
                              value={row.endTime}
                              onChange={(e) => {
                                const end = e.target.value;
                                const d = computeDuration(row.startTime, end);
                                updateRow({
                                  endTime: end,
                                  durationMinutes: d ? String(d) : row.durationMinutes,
                                });
                              }}
                              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                            />
                          </td>
                          <td className="py-3 px-4">
                            <input
                              type="number"
                              min={1}
                              value={row.durationMinutes}
                              onChange={(e) => updateRow({ durationMinutes: e.target.value })}
                              placeholder="mins"
                              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </CardBody>
      </Card>

      {/* Bottom Action Footer */}
      <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-[var(--border)]">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={savingDates}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={() => void handleSaveDates()}
          loading={savingDates}
        >
          Save Dates Notification
        </Button>
      </div>
    </div>
  );
}

