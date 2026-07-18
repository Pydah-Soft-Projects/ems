'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import {
  StudentResultsResponse,
  StudentSubjectResult,
} from '@/types/results';
import { PageHeader } from '@/components/ui/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { LoadingBlock } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Card, CardBody } from '@/components/ui/Card';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white px-3.5 py-3 shadow-[var(--shadow-sm)]">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-1 text-base font-bold text-slate-900">{value}</p>
    </div>
  );
}

function AttemptHistory({ subject }: { subject: StudentSubjectResult }) {
  return (
    <div className="mt-1 space-y-0.5 text-[11px] text-[var(--muted)]">
      {subject.attempts.map((a) => (
        <p key={a.attemptNumber}>
          Attempt {a.attemptNumber}
          {a.examType ? ` · ${a.examType.replace(/_/g, ' ')}` : ''}
          {a.examName ? ` · ${a.examName}` : ''}: {a.grade} —{' '}
          <span className={a.passed ? 'text-emerald-600' : 'text-rose-600'}>
            {a.passed ? 'Pass' : 'Fail'}
          </span>
        </p>
      ))}
    </div>
  );
}

export default function StudentResultsPage() {
  const [data, setData] = useState<StudentResultsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await api.getStudentResults());
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to load results.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Results"
        description="Semester-wise results with supply attempt history."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? (
        <LoadingBlock label="Loading results…" />
      ) : !data || data.semesters.length === 0 ? (
        <EmptyState
          title="No results yet"
          description="Your results will appear here once they are published."
        />
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-4">
            <Stat label="Semesters" value={String(data.summary.semesters)} />
            <Stat
              label="Semesters passed"
              value={String(data.summary.semestersPassed)}
            />
            <Stat
              label="Active backlogs"
              value={String(data.summary.totalBacklogs)}
            />
            <Stat
              label="Credits earned"
              value={String(data.summary.totalCreditsEarned)}
            />
          </div>

          {data.semesters.map((sem) => {
            const semKey = `${sem.yearOfStudy}-${sem.semester}`;
            return (
              <Card key={semKey}>
                <CardBody>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        Year {sem.yearOfStudy} · Semester {sem.semester}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {sem.cleared}/{sem.totalSubjects} subjects cleared ·{' '}
                        {sem.creditsEarned} credits
                      </p>
                    </div>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                        sem.status === 'passed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {sem.status === 'passed'
                        ? 'Semester passed'
                        : `${sem.backlogs} backlog${sem.backlogs === 1 ? '' : 's'}`}
                    </span>
                  </div>

                  <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)]">
                    <table className="w-full min-w-[560px] text-left text-xs">
                      <thead className="bg-slate-50 text-[var(--muted)]">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Code</th>
                          <th className="px-3 py-2 font-semibold">Subject</th>
                          <th className="px-3 py-2 font-semibold">Grade</th>
                          <th className="px-3 py-2 font-semibold">Result</th>
                          <th className="px-3 py-2 font-semibold">Credits</th>
                          <th className="px-3 py-2 font-semibold">Attempts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sem.subjects.map((sub) => {
                          const rowKey = `${semKey}|${sub.subjectCode}`;
                          const open = expanded.has(rowKey);
                          return (
                            <Fragment key={rowKey}>
                              <tr className="border-t border-[var(--border)]">
                                <td className="px-3 py-2 font-medium">
                                  {sub.subjectCode}
                                </td>
                                <td className="px-3 py-2">{sub.subjectName}</td>
                                <td className="px-3 py-2 font-semibold">
                                  {sub.grade}
                                </td>
                                <td className="px-3 py-2">
                                  <span
                                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                      sub.passed
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : 'bg-rose-50 text-rose-700'
                                    }`}
                                  >
                                    {sub.passed ? 'Pass' : 'Fail'}
                                  </span>
                                </td>
                                <td className="px-3 py-2">{sub.credits}</td>
                                <td className="px-3 py-2">
                                  {sub.attemptCount > 1 ? (
                                    <button
                                      type="button"
                                      onClick={() => toggle(rowKey)}
                                      className="font-semibold text-[var(--primary)] underline-offset-2 hover:underline"
                                    >
                                      {sub.attemptCount} attempts{' '}
                                      {open ? '▴' : '▾'}
                                    </button>
                                  ) : (
                                    '1'
                                  )}
                                </td>
                              </tr>
                              {open ? (
                                <tr className="border-t border-dashed border-[var(--border)] bg-slate-50/60">
                                  <td colSpan={6} className="px-3 py-2">
                                    <AttemptHistory subject={sub} />
                                  </td>
                                </tr>
                              ) : null}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
