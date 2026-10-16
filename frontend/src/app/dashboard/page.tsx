'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';
import { Exam } from '@/types/exam';
import { ExamFeeRecord } from '@/types/fee';
import { StatusBadge, Money } from '@/components/ui/StatusBadge';
import { LoadingBlock } from '@/components/ui/Spinner';
import { navigation, NavItem } from '@/config/navigation';
import { NavIcon } from '@/components/icons/NavIcon';

interface Stats {
  regulations: number;
  subjects: number;
  exams: number;
  pendingApprovals: number;
  published: number;
  unpaidFees: number;
  unpaidAmount: number;
  hallTicketReady: number;
}

export default function DashboardPage() {
  const user = getStoredUser();
  const [stats, setStats] = useState<Stats>({
    regulations: 0,
    subjects: 0,
    exams: 0,
    pendingApprovals: 0,
    published: 0,
    unpaidFees: 0,
    unpaidAmount: 0,
    hallTicketReady: 0,
  });
  const [pendingExams, setPendingExams] = useState<Exam[]>([]);
  const [unpaidRecords, setUnpaidRecords] = useState<ExamFeeRecord[]>([]);
  const [publishedExams, setPublishedExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartMode, setChartMode] = useState<'bars' | 'trends'>('bars');
  const [activeSectionFilter, setActiveSectionFilter] = useState<'all' | 'approvals' | 'fees' | 'exams' | 'workspaces'>('all');

  useEffect(() => {
    async function loadStats() {
      try {
        const [regulations, subjects, exams, feeRecords] = await Promise.all([
          api.getRegulations(),
          api.getSubjects(),
          api.getExams(),
          api
            .getFeeRecords({ status: 'pending' })
            .catch(() => [] as ExamFeeRecord[]),
        ]);
        const pending = exams.filter((e) => e.status === 'pending_approval');
        const published = exams.filter((e) => e.status === 'published');
        const hallReady = published.filter((e) => !e.hallTicketsReleasedAt);
        const unpaidAmount = feeRecords.reduce(
          (sum, r) => sum + Number(r.totalAmount || 0),
          0,
        );
        setPendingExams(pending.slice(0, 5));
        setUnpaidRecords(feeRecords.slice(0, 5));
        setPublishedExams(published.slice(0, 5));
        setStats({
          regulations: regulations.length,
          subjects: subjects.length,
          exams: exams.length,
          pendingApprovals: pending.length,
          published: published.length,
          unpaidFees: feeRecords.length,
          unpaidAmount,
          hallTicketReady: hallReady.length,
        });
      } catch {
        /* keep zeros */
      } finally {
        setLoading(false);
      }
    }
    void loadStats();
  }, []);

  const quickLinks = useMemo(
    () =>
      navigation
        .flatMap((g) => g.items)
        .filter(
          (item) =>
            !item.exact &&
            ![
              '/dashboard/subjects/mappings',
              '/dashboard/organization/students',
            ].includes(item.href),
        ),
    [],
  );

  const donePct = Math.round(
    (stats.published / Math.max(stats.exams || 1, 1)) * 100,
  );

  const currentDateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="space-y-5">
      {/* =================================================================== */}
      {/* Light-Themed Compact Welcome Banner                                 */}
      {/* =================================================================== */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs">
        <div className="flex items-center justify-between gap-3 mb-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live Examination Workspace
          </span>
          <span className="text-[11px] text-[var(--muted)] font-medium">
            {currentDateStr}
          </span>
        </div>

        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
          Welcome back, {user?.fullName ? user.fullName.split(' ')[0] : 'Administrator'}
        </h1>
      </div>

      {/* =================================================================== */}
      {/* Compact Top Metric Cards                                            */}
      {/* =================================================================== */}
      <section className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <CompactStatCard
          label="Pending approvals"
          value={stats.pendingApprovals}
          hint="Exams waiting for review"
          icon="exams"
          loading={loading}
          accent="primary"
          statusBadge="Action Needed"
        />
        <CompactStatCard
          label="Unpaid fees"
          value={stats.unpaidFees}
          hint={`₹${stats.unpaidAmount.toLocaleString('en-IN')} outstanding`}
          icon="fees"
          loading={loading}
          accent="danger"
          statusBadge="Collection"
        />
        <CompactStatCard
          label="Published exams"
          value={stats.published}
          hint="Open for enrollment"
          icon="exams"
          loading={loading}
          accent="success"
          statusBadge="Active"
        />
        <CompactStatCard
          label="Hall tickets pending"
          value={stats.hallTicketReady}
          hint="Published but not released"
          icon="duplicate-hall-tickets"
          loading={loading}
          accent="warning"
          statusBadge="Processing"
        />
      </section>

      {/* =================================================================== */}
      {/* Compact Mid Section: Workload Graph & Exam Lifecycle Donut          */}
      {/* =================================================================== */}
      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        {/* Workload Mix Column / Trend Graph */}
        <SectionCard
          title="Workload & Operational Mix"
          description="Live volume analysis across key administrative processes"
          icon="reports"
          iconTone="primary"
          action={
            <div className="inline-flex items-center rounded-lg bg-slate-100 p-0.5 border border-slate-200">
              <button
                type="button"
                onClick={() => setChartMode('bars')}
                className={`rounded-md px-2 py-0.5 text-xs font-semibold transition ${
                  chartMode === 'bars'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Pillars
              </button>
              <button
                type="button"
                onClick={() => setChartMode('trends')}
                className={`rounded-md px-2 py-0.5 text-xs font-semibold transition ${
                  chartMode === 'trends'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Curve Trend
              </button>
            </div>
          }
        >
          <div className="space-y-3.5">
            {chartMode === 'bars' ? (
              <WorkloadBarChart
                approvals={stats.pendingApprovals}
                fees={stats.unpaidFees}
                hallTickets={stats.hallTicketReady}
                published={stats.published}
                loading={loading}
              />
            ) : (
              <WorkloadTrendChart
                approvals={stats.pendingApprovals}
                fees={stats.unpaidFees}
                hallTickets={stats.hallTicketReady}
                published={stats.published}
                loading={loading}
              />
            )}

            {/* Compact Publishing Progress Bar */}
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-3.5 py-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                    Publish Completion
                  </p>
                  <p className="text-lg font-black text-slate-900 tracking-tight">
                    {loading ? '—' : `${donePct}%`}
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/80 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 border border-emerald-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                    {stats.published} / {stats.exams} Published
                  </span>
                </div>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200/80">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 shadow-2xs transition-all duration-700 ease-out"
                  style={{ width: `${Math.min(100, donePct)}%` }}
                />
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Examination Lifecycle Donut Graph */}
        <SectionCard
          title="Exam Readiness & Distribution"
          description="Status breakdown of all scheduled exams"
          icon="dashboard"
          iconTone="accent"
        >
          <DonutChart
            published={stats.published}
            hallTicketPending={stats.hallTicketReady}
            pendingApprovals={stats.pendingApprovals}
            total={stats.exams}
            loading={loading}
          />

          {/* Academic Scope Catalog Snapshot */}
          <div className="mt-4 pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                Academic Setup Scope
              </p>
              <span className="text-[9px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">
                Database Masters
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <MiniStatCard
                label="Regulations"
                value={stats.regulations}
                loading={loading}
                badge="Curricula"
                tone="primary"
              />
              <MiniStatCard
                label="Subjects"
                value={stats.subjects}
                loading={loading}
                badge="Total Mapped"
                tone="accent"
              />
              <MiniStatCard
                label="Examinations"
                value={stats.exams}
                loading={loading}
                badge="Scheduled"
                tone="success"
              />
            </div>
          </div>
        </SectionCard>
      </div>

      {/* =================================================================== */}
      {/* Below Sectional Cards Header & Filter Tabs                          */}
      {/* =================================================================== */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between pt-1">
        <div>
          <h2 className="text-base font-bold tracking-tight text-slate-900">
            Operations & Workspaces
          </h2>
          <p className="text-[11px] text-[var(--muted)]">
            Actionable queues and direct access to examination modules
          </p>
        </div>

        {/* Section Filter Pills */}
        <div className="flex flex-wrap items-center gap-1 p-0.5 rounded-lg bg-slate-100 border border-slate-200">
          {(
            [
              { id: 'all', label: 'All Modules' },
              { id: 'approvals', label: 'Approvals' },
              { id: 'fees', label: 'Unpaid Fees' },
              { id: 'exams', label: 'Published' },
              { id: 'workspaces', label: 'Workspaces' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSectionFilter(tab.id)}
              className={`rounded-md px-2 py-0.5 text-xs font-semibold transition ${
                activeSectionFilter === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* =================================================================== */}
      {/* Compact Below Sectional Cards Grid                                  */}
      {/* =================================================================== */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Sectional Card 1: Pending Approvals */}
        {(activeSectionFilter === 'all' || activeSectionFilter === 'approvals') && (
          <SectionCard
            title="Pending Approvals"
            description="Review exam setups and notifications awaiting approval"
            icon="exams"
            iconTone="primary"
            badge={
              !loading && stats.pendingApprovals > 0
                ? `${stats.pendingApprovals} to review`
                : undefined
            }
            action={
              <Link
                href="/dashboard/exams"
                className="group inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:border-[#0d1b3d] hover:bg-[#0d1b3d] hover:text-white"
              >
                <span>View all</span>
                <span className="transition-transform group-hover:translate-x-0.5">→</span>
              </Link>
            }
          >
            {loading ? (
              <LoadingBlock />
            ) : pendingExams.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-5 text-center">
                <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 mb-2 border border-emerald-100 shadow-2xs">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <p className="text-xs font-bold text-slate-900">All submissions approved</p>
                <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                  Every submitted examination has been reviewed.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingExams.map((exam) => (
                  <Link
                    key={exam.id}
                    href={`/dashboard/exams/${exam.id}`}
                    className="group flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-2.5 shadow-2xs transition-all duration-200 hover:border-slate-300 hover:shadow-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 transition group-hover:bg-[#0d1b3d] group-hover:text-white shadow-2xs">
                        <NavIcon name="exams" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-xs text-slate-900 truncate group-hover:text-[#0d1b3d] transition-colors">
                          {exam.name}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--muted)]">
                          <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[9px] font-bold text-slate-800">
                            {exam.course}
                          </span>
                          <span>·</span>
                          <span>Year {exam.yearOfStudy} / Sem {exam.semester}</span>
                          {exam.type ? (
                            <>
                              <span>·</span>
                              <span className="text-[9px] uppercase font-bold text-slate-500">
                                {exam.type}
                              </span>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <StatusBadge status={exam.status} />
                      <span className="text-slate-400 text-xs transition-transform group-hover:translate-x-0.5 group-hover:text-slate-700">
                        →
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </SectionCard>
        )}

        {/* Sectional Card 2: Unpaid Fees */}
        {(activeSectionFilter === 'all' || activeSectionFilter === 'fees') && (
          <SectionCard
            title="Unpaid Examination Fees"
            description="Recent pending student fee records requiring desk collection"
            icon="fees"
            iconTone="danger"
            badge={
              !loading && stats.unpaidFees > 0
                ? `${stats.unpaidFees} pending`
                : undefined
            }
            action={
              <Link
                href="/dashboard/fees"
                className="group inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 shadow-2xs transition hover:bg-rose-100 hover:border-rose-300"
              >
                <span>Fee desk</span>
                <span className="transition-transform group-hover:translate-x-0.5">→</span>
              </Link>
            }
          >
            {loading ? (
              <LoadingBlock />
            ) : unpaidRecords.length === 0 ? (
              <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/40 p-5 text-center">
                <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 mb-2 border border-emerald-200 shadow-2xs">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-xs font-bold text-emerald-950">Zero pending fees</p>
                <p className="mt-0.5 text-[11px] text-emerald-800">
                  All registered student fee records are settled.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {unpaidRecords.map((r) => (
                  <Link
                    key={r.id}
                    href={`/dashboard/fees/collect/${encodeURIComponent(r.studentRollNumber)}`}
                    className="group flex items-center justify-between gap-3 rounded-xl border border-rose-100/80 bg-white p-2.5 shadow-2xs transition-all duration-200 hover:border-rose-300 hover:shadow-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-700 border border-rose-200/70 font-mono text-[10px] font-bold transition group-hover:bg-rose-600 group-hover:text-white shadow-2xs">
                        PIN
                      </div>
                      <div className="min-w-0">
                        <p className="font-mono font-bold text-xs text-slate-900 truncate group-hover:text-rose-700 transition-colors">
                          {r.studentRollNumber}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[var(--muted)] truncate">
                          {r.exam?.name ?? `Exam #${r.examId}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className="inline-block rounded-md bg-rose-50 px-2 py-0.5 font-bold text-rose-700 border border-rose-200 text-xs">
                        <Money amount={r.totalAmount} />
                      </span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700 group-hover:bg-rose-600 group-hover:text-white transition">
                        Collect →
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </SectionCard>
        )}

        {/* Sectional Card 3: Published Exams */}
        {(activeSectionFilter === 'all' || activeSectionFilter === 'exams') && (
          <SectionCard
            title="Published & Enrollment-Ready"
            description="Active examination events open for hall tickets and scoring"
            icon="student-results"
            iconTone="success"
            badge={
              !loading && stats.published > 0
                ? `${stats.published} active`
                : undefined
            }
          >
            {loading ? (
              <LoadingBlock />
            ) : publishedExams.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-5 text-center">
                <p className="text-xs font-bold text-slate-900">No published exams</p>
                <p className="mt-0.5 text-[11px] text-[var(--muted)]">Publish an approved exam to open enrollment.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {publishedExams.map((exam) => (
                  <Link
                    key={exam.id}
                    href={`/dashboard/exams/${exam.id}?tab=hall-tickets`}
                    className="group flex items-center justify-between gap-3 rounded-xl border border-emerald-100/80 bg-white p-2.5 shadow-2xs transition-all duration-200 hover:border-emerald-300 hover:shadow-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200/70 transition group-hover:bg-emerald-600 group-hover:text-white shadow-2xs">
                        <NavIcon name="exams" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-xs text-slate-900 truncate group-hover:text-emerald-800 transition-colors">
                          {exam.name}
                        </p>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          {exam.hallTicketsReleasedAt ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100/70 px-2 py-0.2 rounded border border-emerald-200">
                              <span className="h-1 w-1 rounded-full bg-emerald-600" />
                              Tickets Released
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100/70 px-2 py-0.2 rounded border border-amber-200">
                              <span className="h-1 w-1 rounded-full bg-amber-500 animate-pulse" />
                              Tickets Pending Release
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 group-hover:bg-emerald-600 group-hover:text-white transition shadow-2xs">
                        Manage →
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </SectionCard>
        )}

        {/* Sectional Card 4: Portal Workspaces */}
        {(activeSectionFilter === 'all' || activeSectionFilter === 'workspaces') && (
          <SectionCard
            title="Portal Workspaces"
            description="Direct access to examination portals, finance desks & setups"
            icon="organization"
            iconTone="primary"
            badge={`${quickLinks.length} modules`}
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {quickLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex items-start gap-2.5 rounded-xl border border-slate-200/80 bg-white p-2.5 shadow-2xs transition-all duration-200 hover:border-[#0d1b3d] hover:shadow-xs"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 transition group-hover:bg-[#0d1b3d] group-hover:text-white shadow-2xs">
                    <NavIcon name={item.icon} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-xs text-slate-900 truncate group-hover:text-[#0d1b3d] transition-colors">
                        {item.label}
                      </p>
                      <svg
                        className="h-3 w-3 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-[#0d1b3d]"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </div>
                    <p className="mt-0.5 text-[10px] text-[var(--muted)] line-clamp-1 leading-snug">
                      {item.description}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </SectionCard>
        )}
      </div>
    </div>
  );
}

/* ========================================================================= */
/* Reusable Compact Section Card Container                                   */
/* ========================================================================= */

function SectionCard({
  title,
  description,
  icon,
  iconTone = 'primary',
  badge,
  action,
  children,
}: {
  title: string;
  description: string;
  icon?: NavItem['icon'];
  iconTone?: 'primary' | 'accent' | 'danger' | 'success' | 'warning';
  badge?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const toneClasses = {
    primary: 'bg-[#0d1b3d]/10 text-[#0d1b3d]',
    accent: 'bg-emerald-50 text-emerald-700',
    danger: 'bg-rose-50 text-rose-700',
    success: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-amber-50 text-amber-700',
  }[iconTone];

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs transition hover:shadow-sm flex flex-col justify-between">
      <div>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-2.5">
            {icon ? (
              <div className={`rounded-lg p-2 shrink-0 ${toneClasses} shadow-2xs`}>
                <NavIcon name={icon} />
              </div>
            ) : null}
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-bold tracking-tight text-slate-900">
                  {title}
                </h3>
                {badge ? (
                  <span className="rounded-full bg-slate-100 px-2 py-0.2 text-[9px] font-bold text-slate-700 border border-slate-200">
                    {badge}
                  </span>
                ) : null}
              </div>
              <p className="text-[11px] text-[var(--muted)] leading-tight mt-0.5">
                {description}
              </p>
            </div>
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}

/* ========================================================================= */
/* Compact Graphical Components                                              */
/* ========================================================================= */

function CompactStatCard({
  label,
  value,
  hint,
  icon,
  loading,
  accent = 'primary',
  statusBadge,
}: {
  label: string;
  value: number | string;
  hint: string;
  icon: NavItem['icon'];
  loading?: boolean;
  accent?: 'primary' | 'accent' | 'success' | 'warning' | 'danger';
  statusBadge?: string;
}) {
  const accents = {
    primary: {
      topBorder: 'border-t-[3px] border-t-[#0d1b3d]',
      badge: 'bg-[#0d1b3d]/10 text-[#0d1b3d]',
    },
    accent: {
      topBorder: 'border-t-[3px] border-t-indigo-600',
      badge: 'bg-indigo-50 text-indigo-700',
    },
    danger: {
      topBorder: 'border-t-[3px] border-t-rose-500',
      badge: 'bg-rose-50 text-rose-600',
    },
    success: {
      topBorder: 'border-t-[3px] border-t-emerald-500',
      badge: 'bg-emerald-50 text-emerald-700',
    },
    warning: {
      topBorder: 'border-t-[3px] border-t-amber-500',
      badge: 'bg-amber-50 text-amber-700',
    },
  }[accent];

  return (
    <div
      className={`group rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xs flex flex-col justify-between ${accents.topBorder}`}
    >
      <div>
        <div className="flex items-start justify-between">
          <div className={`rounded-lg p-2 ${accents.badge} shadow-2xs`}>
            <NavIcon name={icon} />
          </div>
          {statusBadge ? (
            <span className="inline-flex items-center rounded-full bg-slate-50 border border-slate-200/80 px-2 py-0.2 text-[9px] font-bold uppercase tracking-wider text-[var(--muted)]">
              {statusBadge}
            </span>
          ) : null}
        </div>
        <p className="mt-2.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
          {label}
        </p>
        <p className="mt-0.5 text-2xl font-black tracking-tight text-slate-900">
          {loading ? (
            <span className="inline-block h-7 w-14 animate-pulse rounded-md bg-slate-200" />
          ) : (
            value
          )}
        </p>
        <p className="text-[11px] text-[var(--muted)] font-medium truncate">{hint}</p>
      </div>
    </div>
  );
}

function WorkloadBarChart({
  approvals,
  fees,
  hallTickets,
  published,
  loading,
}: {
  approvals: number;
  fees: number;
  hallTickets: number;
  published: number;
  loading?: boolean;
}) {
  const maxVal = Math.max(approvals, fees, hallTickets, published, 10);
  const items = [
    {
      label: 'Approvals',
      sublabel: 'Review',
      value: approvals,
      gradient: 'from-[#0d1b3d] to-[#1e3a8a]',
      badgeColor: 'text-slate-800 bg-slate-100',
    },
    {
      label: 'Unpaid Fees',
      sublabel: 'Pending',
      value: fees,
      gradient: 'from-rose-600 to-rose-400',
      badgeColor: 'text-rose-700 bg-rose-50',
    },
    {
      label: 'Hall Tickets',
      sublabel: 'Release',
      value: hallTickets,
      gradient: 'from-amber-500 to-yellow-400',
      badgeColor: 'text-amber-800 bg-amber-50',
    },
    {
      label: 'Published',
      sublabel: 'Active',
      value: published,
      gradient: 'from-emerald-600 to-emerald-400',
      badgeColor: 'text-emerald-800 bg-emerald-50',
    },
  ];

  if (loading) {
    return <LoadingBlock />;
  }

  return (
    <div className="space-y-2">
      <div className="h-36 w-full flex items-end justify-between gap-2.5 sm:gap-4 pt-4 pb-1 px-1 border-b border-slate-100">
        {items.map((it) => {
          const heightPct = Math.max(
            Math.round((it.value / maxVal) * 100),
            it.value > 0 ? 12 : 5,
          );
          return (
            <div
              key={it.label}
              className="flex-1 flex flex-col items-center h-full justify-end group cursor-default"
            >
              <div className="flex flex-col items-center mb-1">
                <span
                  className={`text-[10px] font-bold px-2 py-0.2 rounded-full ${it.badgeColor} shadow-2xs border border-black/5`}
                >
                  {it.value}
                </span>
              </div>
              <div className="w-full max-w-[36px] bg-slate-100 rounded-t-lg h-full flex items-end overflow-hidden p-0.5">
                <div
                  className={`w-full bg-gradient-to-t ${it.gradient} rounded-t-md transition-all duration-700 ease-out shadow-xs`}
                  style={{ height: `${heightPct}%` }}
                />
              </div>
              <div className="text-center mt-1.5 w-full">
                <p className="text-[11px] font-bold text-slate-800 truncate">
                  {it.label}
                </p>
                <p className="text-[9px] text-[var(--muted)] hidden sm:block truncate">
                  {it.sublabel}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WorkloadTrendChart({
  approvals,
  fees,
  hallTickets,
  published,
  loading,
}: {
  approvals: number;
  fees: number;
  hallTickets: number;
  published: number;
  loading?: boolean;
}) {
  if (loading) {
    return <LoadingBlock />;
  }

  const data = [
    { label: 'Approvals', val: approvals, color: '#0d1b3d' },
    { label: 'Fees Due', val: fees, color: '#e11d48' },
    { label: 'Hall Tickets', val: hallTickets, color: '#f59e0b' },
    { label: 'Published', val: published, color: '#2e7d32' },
  ];
  const max = Math.max(approvals, fees, hallTickets, published, 10);

  const pts = data.map((d, i) => {
    const x = 30 + i * 110;
    const y = 100 - (d.val / max) * 75;
    return { x, y, ...d };
  });

  const curvePath = `M ${pts[0].x} ${pts[0].y} C ${pts[0].x + 45} ${pts[0].y}, ${pts[1].x - 45} ${pts[1].y}, ${pts[1].x} ${pts[1].y} C ${pts[1].x + 45} ${pts[1].y}, ${pts[2].x - 45} ${pts[2].y}, ${pts[2].x} ${pts[2].y} C ${pts[2].x + 45} ${pts[2].y}, ${pts[3].x - 45} ${pts[3].y}, ${pts[3].x} ${pts[3].y}`;
  const fillPath = `${curvePath} L ${pts[3].x} 115 L ${pts[0].x} 115 Z`;

  return (
    <div className="space-y-2">
      <div className="h-36 w-full pt-2 pb-1 px-1 border-b border-slate-100 flex flex-col justify-between">
        <svg className="w-full h-24 overflow-visible" viewBox="0 0 380 120">
          <defs>
            <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2e7d32" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#2e7d32" stopOpacity="0.0" />
            </linearGradient>
          </defs>
          <line x1="20" y1="30" x2="360" y2="30" stroke="#f1f5f9" strokeDasharray="4 4" />
          <line x1="20" y1="65" x2="360" y2="65" stroke="#f1f5f9" strokeDasharray="4 4" />
          <line x1="20" y1="100" x2="360" y2="100" stroke="#e2e8f0" />

          <path d={fillPath} fill="url(#trendGrad)" />
          <path d={curvePath} fill="none" stroke="#2e7d32" strokeWidth="2.5" strokeLinecap="round" />

          {pts.map((p) => (
            <g key={p.label}>
              <circle cx={p.x} cy={p.y} r="5" fill="#ffffff" stroke={p.color} strokeWidth="2.5" />
              <text x={p.x} y={p.y - 8} textAnchor="middle" className="text-[10px] font-bold fill-slate-800">
                {p.val}
              </text>
            </g>
          ))}
        </svg>

        <div className="flex justify-between px-5 text-center">
          {data.map((d) => (
            <div key={d.label}>
              <p className="text-[11px] font-bold text-slate-800">{d.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DonutChart({
  published,
  hallTicketPending,
  pendingApprovals,
  total,
  loading,
}: {
  published: number;
  hallTicketPending: number;
  pendingApprovals: number;
  total: number;
  loading?: boolean;
}) {
  const safeTotal = Math.max(total, 1);
  const released = Math.max(published - hallTicketPending, 0);

  const segments = [
    {
      label: 'Tickets Released',
      count: released,
      color: '#2e7d32',
      dotClass: 'bg-emerald-600',
    },
    {
      label: 'Tickets Pending',
      count: hallTicketPending,
      color: '#f59e0b',
      dotClass: 'bg-amber-500',
    },
    {
      label: 'Pending Approvals',
      count: pendingApprovals,
      color: '#0d1b3d',
      dotClass: 'bg-[#0d1b3d]',
    },
  ];

  const radius = 48;
  const circumference = 2 * Math.PI * radius; // ~301.59
  let accumulatedOffset = 0;

  if (loading) {
    return <LoadingBlock />;
  }

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4 py-1">
      <div className="relative w-32 h-32 shrink-0 flex items-center justify-center">
        <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 140 140">
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="#f1f5f9"
            strokeWidth="14"
          />
          {segments.map((seg, idx) => {
            const pct = seg.count / safeTotal;
            const strokeDash = pct * circumference;
            const currentOffset = accumulatedOffset;
            accumulatedOffset += strokeDash;
            return (
              <circle
                key={idx}
                cx="70"
                cy="70"
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth="14"
                strokeDasharray={`${strokeDash} ${circumference - strokeDash}`}
                strokeDashoffset={-currentOffset}
                className="transition-all duration-700 ease-out"
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          <span className="text-xl font-black text-slate-900 tracking-tight">
            {total > 0 ? `${Math.round((published / safeTotal) * 100)}%` : '0%'}
          </span>
          <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted)]">
            Readiness
          </span>
        </div>
      </div>

      <div className="flex-1 w-full space-y-1.5">
        {segments.map((seg) => {
          const share = Math.round((seg.count / safeTotal) * 100);
          return (
            <div
              key={seg.label}
              className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-1.5 text-xs shadow-2xs"
            >
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${seg.dotClass}`} />
                <span className="font-bold text-slate-800 text-[11px]">{seg.label}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-slate-900 text-xs">{seg.count}</span>
                <span className="text-[10px] font-semibold text-[var(--muted)]">({share}%)</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MiniStatCard({
  label,
  value,
  loading,
  badge,
  tone = 'primary',
}: {
  label: string;
  value: number;
  loading?: boolean;
  badge: string;
  tone?: 'primary' | 'accent' | 'success';
}) {
  const tones = {
    primary: 'border-slate-200/80 bg-slate-50/70',
    accent: 'border-indigo-100 bg-indigo-50/40',
    success: 'border-emerald-100 bg-emerald-50/40',
  }[tone];

  return (
    <div className={`rounded-xl border ${tones} p-2 text-center transition hover:shadow-2xs`}>
      <span className="inline-block text-[8px] font-bold uppercase tracking-wider text-[var(--muted)]">
        {badge}
      </span>
      <p className="text-base font-black text-slate-900 leading-tight mt-0.5">
        {loading ? '—' : value}
      </p>
      <p className="text-[9px] font-bold text-[var(--muted)] truncate">
        {label}
      </p>
    </div>
  );
}
