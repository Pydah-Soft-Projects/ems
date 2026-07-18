'use client';

import { Exam, ExamAnalytics } from '@/types/exam';
import { money } from '@/components/fees/money';
import { ExamHallTicketsPanel } from '@/components/exams/ExamHallTicketsPanel';
import { Alert } from '@/components/ui/Alert';
import { LoadingBlock } from '@/components/ui/Spinner';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AcademicScopeSummary } from '@/components/ui/AcademicScopeSummary';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-subtle)] px-3.5 py-3 shadow-[var(--shadow-sm)]">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-1 text-base font-bold text-slate-900">{value}</p>
    </div>
  );
}

export function ExamOverviewPanel({ exam }: { exam: Exam }) {
  const types = exam.allowedTypes?.length ? exam.allowedTypes : [exam.type];
  return (
    <div className="space-y-4 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <p className="flex items-center gap-2">
          <span className="text-[var(--muted)]">Status:</span>
          <StatusBadge status={exam.status} />
        </p>
        <p>
          <span className="text-[var(--muted)]">Enrollment types:</span>{' '}
          {types.map((t) => t.replace(/_/g, ' ')).join(' + ')}
        </p>
        <div className="sm:col-span-2">
          <AcademicScopeSummary
            collegeName={exam.college}
            programmeName={exam.course}
            branchNames={
              exam.scopes?.length
                ? exam.scopes.map((s) =>
                    `${s.branch}${s.section ? ` (${s.section})` : ''}`,
                  )
                : exam.branch
            }
            batchYear={exam.batch}
            year={exam.yearOfStudy}
            semester={exam.semester}
          />
        </div>
        <p>
          <span className="text-[var(--muted)]">Package fee:</span>{' '}
          {exam.packageFee ?? '—'}
        </p>
        {(exam.packageFees?.length ?? 0) > 0 && (
          <div className="sm:col-span-2">
            <span className="text-[var(--muted)]">
              Branch / section package fees:
            </span>
            <ul className="mt-1 space-y-0.5 text-[var(--muted)]">
              {exam.packageFees!.map((pf, idx) => (
                <li key={idx}>
                  {pf.branch}
                  {pf.section ? ` · Section ${pf.section}` : ' · whole branch'}
                  : {pf.amount}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p>
          <span className="text-[var(--muted)]">Application:</span>{' '}
          {exam.applicationStartDate ?? '—'} → {exam.applicationEndDate ?? '—'}
        </p>
        <p>
          <span className="text-[var(--muted)]">Examination:</span>{' '}
          {exam.examinationStartDate ?? '—'} → {exam.examinationEndDate ?? '—'}
        </p>
        <p>
          <span className="text-[var(--muted)]">Hall tickets:</span>{' '}
          {exam.hallTicketsReleasedAt
            ? `Released ${new Date(exam.hallTicketsReleasedAt).toLocaleString()}`
            : 'Not released'}
        </p>
      </div>
      {exam.rejectionRemarks ? (
        <Alert tone="danger">Rejection remarks: {exam.rejectionRemarks}</Alert>
      ) : null}
      {(exam.lateFeeSlabs?.length ?? 0) > 0 ? (
        <div>
          <p className="mb-2 font-medium text-slate-800">Late fee slabs</p>
          <ul className="space-y-1 text-[var(--muted)]">
            {exam.lateFeeSlabs.map((s, idx) => (
              <li key={idx}>
                Day {s.fromDay}–{s.toDay}: {s.amount}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {exam.instructions ? (
        <p className="text-[var(--muted)]">{exam.instructions}</p>
      ) : null}
    </div>
  );
}

function paperTiming(es: {
  session?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  durationMinutes?: number | null;
}) {
  const parts: string[] = [];
  if (es.session) parts.push(es.session);
  if (es.startTime && es.endTime) {
    parts.push(`${es.startTime}–${es.endTime}`);
  } else if (es.startTime) {
    parts.push(`from ${es.startTime}`);
  }
  if (es.durationMinutes) parts.push(`${es.durationMinutes} min`);
  return parts.join(' · ');
}

export function ExamSubjectsPanel({ exam }: { exam: Exam }) {
  const subjects = exam.examSubjects ?? [];
  if (!subjects.length) {
    return <p className="text-sm text-[var(--muted)]">No subjects configured.</p>;
  }
  const groups = new Map<string, typeof subjects>();
  for (const es of subjects) {
    const branch = es.branch?.trim() || '';
    const section = es.section?.trim() || '';
    const key = `${branch}|${section}`;
    const list = groups.get(key) ?? [];
    list.push(es);
    groups.set(key, list);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const groupLabel = (key: string) => {
    const sep = key.lastIndexOf('|');
    const branch = key.slice(0, sep);
    const section = key.slice(sep + 1);
    if (!branch) return 'All branches (common papers)';
    return section ? `${branch} · Section ${section}` : branch;
  };
  return (
    <div className="space-y-3">
      {ordered.map(([key, list]) => (
        <div
          key={key || '__common'}
          className="rounded-[var(--radius)] border border-[var(--border)]"
        >
          <p className="border-b border-[var(--border)] bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700">
            {groupLabel(key)}
          </p>
          <ul className="space-y-1 p-3 text-sm">
            {list.map((es) => {
              const timing = paperTiming(es);
              return (
                <li key={es.id} className="flex justify-between gap-3">
                  <span>
                    {es.subject?.code ?? es.subjectId} —{' '}
                    {es.subject?.name ?? ''}
                  </span>
                  <span className="text-right text-[var(--muted)]">
                    {es.examDate ?? '—'}
                    {timing ? ` · ${timing}` : ''} · Fee: {es.fee}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function ExamAnalyticsPanel({
  analytics,
  loading,
  error,
}: {
  analytics: ExamAnalytics | null;
  loading?: boolean;
  error?: string;
}) {
  if (loading) return <LoadingBlock label="Loading analytics…" />;
  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!analytics) {
    return <p className="text-sm text-[var(--muted)]">No analytics available.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <Stat label="Eligible" value={String(analytics.eligibleCount)} />
        <Stat label="Enrolled" value={String(analytics.enrolledCount)} />
        <Stat label="Not enrolled" value={String(analytics.notEnrolledCount)} />
        <Stat label="Paid" value={String(analytics.paidCount)} />
        <Stat label="Payment due" value={String(analytics.pendingPaymentCount)} />
        <Stat label="Est. / student" value={money(analytics.estimatedPerStudent)} />
        <Stat label="Estimated total" value={money(analytics.estimatedRevenue)} />
        <Stat label="Collected" value={money(analytics.collectedRevenue)} />
      </div>
      {analytics.byScope.length > 0 ? (
        <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)]">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="bg-slate-50 text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2 font-semibold">Course</th>
                <th className="px-3 py-2 font-semibold">Branch</th>
                <th className="px-3 py-2 font-semibold">Y/S</th>
                <th className="px-3 py-2 font-semibold">Eligible</th>
                <th className="px-3 py-2 font-semibold">Enrolled</th>
                <th className="px-3 py-2 font-semibold">Paid</th>
                <th className="px-3 py-2 font-semibold">Due</th>
                <th className="px-3 py-2 font-semibold">Not in</th>
                <th className="px-3 py-2 font-semibold">Est.</th>
                <th className="px-3 py-2 font-semibold">Collected</th>
              </tr>
            </thead>
            <tbody>
              {analytics.byScope.map((row) => (
                <tr
                  key={`${row.course}-${row.branch}-${row.yearOfStudy}-${row.semester}`}
                  className="border-t border-[var(--border)]"
                >
                  <td className="px-3 py-2">{row.course}</td>
                  <td className="px-3 py-2">{row.branch}</td>
                  <td className="px-3 py-2">
                    Y{row.yearOfStudy}/S{row.semester}
                  </td>
                  <td className="px-3 py-2">{row.eligible}</td>
                  <td className="px-3 py-2">{row.enrolled}</td>
                  <td className="px-3 py-2">{row.paid}</td>
                  <td className="px-3 py-2">{row.pendingPayment}</td>
                  <td className="px-3 py-2">{row.notEnrolled}</td>
                  <td className="px-3 py-2">{money(row.estimatedRevenue)}</td>
                  <td className="px-3 py-2">{money(row.collectedRevenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export function ExamHallTicketsTab({ exam }: { exam: Exam }) {
  if (exam.status !== 'published') {
    return (
      <Alert tone="info">
        Hall tickets become available after the examination is published.
      </Alert>
    );
  }
  return <ExamHallTicketsPanel exam={exam} />;
}
