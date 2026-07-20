'use client';

import { Exam, ExamAnalytics } from '@/types/exam';
import { money } from '@/components/fees/money';
import { ExamHallTicketsPanel } from '@/components/exams/ExamHallTicketsPanel';
import { Alert } from '@/components/ui/Alert';
import { LoadingBlock } from '@/components/ui/Spinner';
import { StatusBadge } from '@/components/ui/StatusBadge';

function fmtDate(value: string | null | undefined) {
  if (!value) return '—';
  try {
    return new Date(`${value}T12:00:00`).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return value;
  }
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

function slabLabel(
  s: { fromDay: number; toDay: number | null; amount: number | string },
  isLast: boolean,
  appEnd?: string | null,
) {
  const to =
    s.toDay != null
      ? `Day ${s.toDay}`
      : isLast
        ? `application end${appEnd ? ` (${fmtDate(appEnd)})` : ''}`
        : '—';
  return `Day ${s.fromDay} → ${to} · ₹${s.amount}`;
}

function MetricCard({
  label,
  value,
  hint,
  accent = 'slate',
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: 'slate' | 'indigo' | 'emerald' | 'amber' | 'rose';
}) {
  const accents = {
    slate: 'from-slate-500/10 to-slate-500/5 border-slate-200/80',
    indigo: 'from-indigo-500/10 to-indigo-500/5 border-indigo-200/80',
    emerald: 'from-emerald-500/10 to-emerald-500/5 border-emerald-200/80',
    amber: 'from-amber-500/10 to-amber-500/5 border-amber-200/80',
    rose: 'from-rose-500/10 to-rose-500/5 border-rose-200/80',
  };
  return (
    <div
      className={`rounded-2xl border bg-gradient-to-br p-4 shadow-[var(--shadow-sm)] ${accents[accent]}`}
    >
      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-1.5 text-xl font-bold text-slate-900">{value}</p>
      {hint ? (
        <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{hint}</p>
      ) : null}
    </div>
  );
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow-sm)]">
      <div className="border-b border-[var(--border)] bg-slate-50/80 px-5 py-4">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        {description ? (
          <p className="mt-0.5 text-xs text-[var(--muted)]">{description}</p>
        ) : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function TimelineItem({
  label,
  range,
  active,
}: {
  label: string;
  range: string;
  active?: boolean;
}) {
  return (
    <div className="relative flex gap-4 pb-6 last:pb-0">
      <div className="flex flex-col items-center">
        <span
          className={`mt-1 h-3 w-3 rounded-full ring-4 ${
            active
              ? 'bg-[var(--primary)] ring-[var(--primary-soft)]'
              : 'bg-slate-300 ring-slate-100'
          }`}
        />
        <span className="mt-1 w-px flex-1 bg-[var(--border)]" />
      </div>
      <div className="min-w-0 flex-1 pb-1">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">
          {label}
        </p>
        <p className="mt-1 text-sm font-semibold text-slate-900">{range}</p>
      </div>
    </div>
  );
}

export function ExamOverviewPanel({ exam }: { exam: Exam }) {
  const types = exam.allowedTypes?.length ? exam.allowedTypes : [exam.type];
  const branches = exam.scopes?.length
    ? [...new Set(exam.scopes.map((s) => s.branch))]
    : exam.branch
      ? [exam.branch]
      : [];
  const paperCount = exam.examSubjects?.length ?? 0;
  const sortedSlabs = [...(exam.lateFeeSlabs ?? [])].sort(
    (a, b) => a.fromDay - b.fromDay,
  );

  /** Papers a student of this branch/section sits for (same rules as application). */
  function paperCountForScope(branch: string, section?: string | null) {
    const wantedBranch = branch.trim().toLowerCase();
    const wantedSection = (section ?? '').trim().toLowerCase();
    return (exam.examSubjects ?? []).filter((es) => {
      const b = (es.branch ?? '').trim().toLowerCase();
      const s = (es.section ?? '').trim().toLowerCase();
      if (b && wantedBranch && b !== wantedBranch) return false;
      if (s && s !== wantedSection) return false;
      return true;
    }).length;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Status"
          value={exam.status.replace(/_/g, ' ')}
          accent="indigo"
        />
        <MetricCard
          label="Papers"
          value={String(paperCount)}
          hint={`${branches.length} branch${branches.length === 1 ? '' : 'es'} scoped`}
          accent="emerald"
        />
        <MetricCard
          label="Enrollment"
          value={types.map((t) => t.replace(/_/g, ' ')).join(' · ')}
          accent="amber"
        />
        <MetricCard
          label="Hall tickets"
          value={exam.hallTicketsReleasedAt ? 'Released' : 'Pending'}
          hint={
            exam.hallTicketsReleasedAt
              ? fmtDateTime(exam.hallTicketsReleasedAt)
              : 'Not released yet'
          }
          accent={exam.hallTicketsReleasedAt ? 'emerald' : 'slate'}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SectionCard
          title="Academic scope"
          description="College, programme, batch, and branch coverage"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">
                College
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {exam.college ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">
                Programme
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {exam.course}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">
                Batch · Year · Sem
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {exam.batch} · Y{exam.yearOfStudy} · S{exam.semester}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">
                Default package fee
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {exam.packageFee != null ? `₹${exam.packageFee}` : 'Not set'}
              </p>
            </div>
          </div>
          <div className="mt-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">
              Branches & sections
            </p>
            <div className="flex flex-wrap gap-2">
              {(exam.scopes?.length
                ? exam.scopes.map((s) =>
                    s.section ? `${s.branch} · ${s.section}` : s.branch,
                  )
                : branches
              ).map((label) => (
                <span
                  key={label}
                  className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
          {(exam.packageFees?.length ?? 0) > 0 ? (
            <div className="mt-4">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">
                Branch / section package fees
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {exam.packageFees!.map((pf, idx) => {
                  const papers = paperCountForScope(pf.branch, pf.section);
                  return (
                    <div
                      key={idx}
                      className="rounded-xl border border-[var(--border)] bg-slate-50/60 px-3 py-2.5"
                    >
                      <p className="text-xs font-medium text-slate-800">
                        {pf.branch}
                        {pf.section
                          ? ` · Section ${pf.section}`
                          : ' · whole branch'}
                      </p>
                      <p className="mt-0.5 text-sm font-bold text-emerald-700">
                        ₹{pf.amount}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                        {papers} paper{papers === 1 ? '' : 's'}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </SectionCard>

        <SectionCard title="Schedule" description="Key dates for this examination">
          <TimelineItem
            label="Application window"
            range={`${fmtDate(exam.applicationStartDate)} → ${fmtDate(exam.applicationEndDate)}`}
            active
          />
          <TimelineItem
            label="Examination period"
            range={`${fmtDate(exam.examinationStartDate)} → ${fmtDate(exam.examinationEndDate)}`}
          />
          <TimelineItem
            label="Late fee starts"
            range={fmtDate(exam.lateFeeStartDate)}
          />
        </SectionCard>
      </div>

      {sortedSlabs.length > 0 ? (
        <SectionCard
          title="Late fee slabs"
          description="Counted from the late fee start date"
        >
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sortedSlabs.map((s, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-amber-200/80 bg-amber-50/50 px-4 py-3"
              >
                <p className="text-xs font-semibold text-amber-900">
                  Slab {idx + 1}
                  {idx === sortedSlabs.length - 1 ? ' (last)' : ''}
                </p>
                <p className="mt-1 text-sm font-bold text-slate-900">
                  {slabLabel(s, idx === sortedSlabs.length - 1, exam.applicationEndDate)}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      {exam.rejectionRemarks ? (
        <Alert tone="danger">Rejection remarks: {exam.rejectionRemarks}</Alert>
      ) : null}

      {exam.instructions ? (
        <SectionCard title="Instructions" description="Shown to students during application">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {exam.instructions}
          </p>
        </SectionCard>
      ) : null}
    </div>
  );
}

function SessionBadge({ session }: { session?: string | null }) {
  if (!session) {
    return (
      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
        —
      </span>
    );
  }
  const isFn = session.toUpperCase() === 'FN';
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        isFn
          ? 'bg-sky-100 text-sky-800'
          : 'bg-orange-100 text-orange-800'
      }`}
    >
      {session}
    </span>
  );
}

export function ExamSubjectsPanel({ exam }: { exam: Exam }) {
  const subjects = exam.examSubjects ?? [];
  if (!subjects.length) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-slate-50/50 px-6 py-12 text-center">
        <p className="text-sm font-medium text-slate-700">No subjects configured</p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Edit the examination to add branch-wise papers and fees.
        </p>
      </div>
    );
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
  const ordered = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));

  const groupLabel = (key: string) => {
    const sep = key.lastIndexOf('|');
    const branch = key.slice(0, sep);
    const section = key.slice(sep + 1);
    if (!branch) return 'Common papers (all branches)';
    return section ? `${branch} · Section ${section}` : branch;
  };

  const totalFee = subjects.reduce((sum, es) => sum + Number(es.fee || 0), 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Total papers" value={String(subjects.length)} accent="indigo" />
        <MetricCard
          label="Groups"
          value={String(ordered.length)}
          hint="Branch / section combinations"
          accent="emerald"
        />
        <MetricCard
          label="Subject-wise total"
          value={money(totalFee)}
          hint="Sum of all configured paper fees"
          accent="amber"
        />
      </div>

      {ordered.map(([key, list]) => (
        <section
          key={key || '__common'}
          className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow-sm)]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-gradient-to-r from-slate-50 to-white px-5 py-3.5">
            <div>
              <h3 className="text-sm font-bold text-slate-900">{groupLabel(key)}</h3>
              <p className="text-xs text-[var(--muted)]">
                {list.length} paper{list.length === 1 ? '' : 's'}
              </p>
            </div>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
              {money(list.reduce((s, es) => s + Number(es.fee || 0), 0))} total
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-slate-50/80 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                  <th className="px-5 py-3">Code</th>
                  <th className="px-5 py-3">Subject</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Session</th>
                  <th className="px-5 py-3">Timing</th>
                  <th className="px-5 py-3 text-right">Fee</th>
                </tr>
              </thead>
              <tbody>
                {list.map((es) => {
                  const timing =
                    es.startTime && es.endTime
                      ? `${es.startTime} – ${es.endTime}${es.durationMinutes ? ` · ${es.durationMinutes}m` : ''}`
                      : es.startTime
                        ? `from ${es.startTime}`
                        : es.durationMinutes
                          ? `${es.durationMinutes} min`
                          : '—';
                  return (
                    <tr
                      key={es.id}
                      className="border-b border-[var(--border)] last:border-0 hover:bg-slate-50/60"
                    >
                      <td className="px-5 py-3 font-semibold text-slate-900">
                        {es.subject?.code ?? es.subjectId}
                      </td>
                      <td className="max-w-xs px-5 py-3 text-slate-700">
                        {es.subject?.name ?? '—'}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {fmtDate(es.examDate)}
                      </td>
                      <td className="px-5 py-3">
                        <SessionBadge session={es.session} />
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-600">{timing}</td>
                      <td className="px-5 py-3 text-right">
                        <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                          {money(Number(es.fee))}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-gradient-to-br from-white to-slate-50/80 px-4 py-3.5 shadow-[var(--shadow-sm)]">
      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
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
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Eligible" value={String(analytics.eligibleCount)} />
        <Stat label="Enrolled" value={String(analytics.enrolledCount)} />
        <Stat label="Paid" value={String(analytics.paidCount)} />
        <Stat label="Payment due" value={String(analytics.pendingPaymentCount)} />
        <Stat label="Not enrolled" value={String(analytics.notEnrolledCount)} />
        <Stat label="Est. / student" value={money(analytics.estimatedPerStudent)} />
        <Stat label="Estimated total" value={money(analytics.estimatedRevenue)} />
        <Stat label="Collected" value={money(analytics.collectedRevenue)} />
      </div>
      {analytics.byScope.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow-sm)]">
          <div className="border-b border-[var(--border)] bg-slate-50/80 px-5 py-3">
            <h3 className="text-sm font-bold text-slate-900">By scope</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="bg-white text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Course</th>
                  <th className="px-4 py-3 font-semibold">Branch</th>
                  <th className="px-4 py-3 font-semibold">Y/S</th>
                  <th className="px-4 py-3 font-semibold">Eligible</th>
                  <th className="px-4 py-3 font-semibold">Enrolled</th>
                  <th className="px-4 py-3 font-semibold">Paid</th>
                  <th className="px-4 py-3 font-semibold">Due</th>
                  <th className="px-4 py-3 font-semibold">Est.</th>
                  <th className="px-4 py-3 font-semibold">Collected</th>
                </tr>
              </thead>
              <tbody>
                {analytics.byScope.map((row) => (
                  <tr
                    key={`${row.course}-${row.branch}-${row.yearOfStudy}-${row.semester}`}
                    className="border-t border-[var(--border)] hover:bg-slate-50/60"
                  >
                    <td className="px-4 py-2.5">{row.course}</td>
                    <td className="px-4 py-2.5">{row.branch}</td>
                    <td className="px-4 py-2.5">
                      Y{row.yearOfStudy}/S{row.semester}
                    </td>
                    <td className="px-4 py-2.5">{row.eligible}</td>
                    <td className="px-4 py-2.5">{row.enrolled}</td>
                    <td className="px-4 py-2.5">{row.paid}</td>
                    <td className="px-4 py-2.5">{row.pendingPayment}</td>
                    <td className="px-4 py-2.5">{money(row.estimatedRevenue)}</td>
                    <td className="px-4 py-2.5">{money(row.collectedRevenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
