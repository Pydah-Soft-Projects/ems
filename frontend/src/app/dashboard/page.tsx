'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';
import { Exam } from '@/types/exam';
import { ExamFeeRecord } from '@/types/fee';
import { PageHeader, StatCard } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { StatusBadge, Money } from '@/components/ui/StatusBadge';
import { LoadingBlock } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { navigation } from '@/config/navigation';
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

  const workloadTotal =
    stats.pendingApprovals + stats.unpaidFees + stats.hallTicketReady || 1;
  const donePct = Math.round(
    (stats.published / Math.max(stats.exams || 1, 1)) * 100,
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome back${user?.fullName ? `, ${user.fullName.split(' ')[0]}` : ''}`}
        description="Your examination workspace at a glance — approvals, collections, and readiness."
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Pending approvals"
          value={stats.pendingApprovals}
          hint="Exams waiting for review"
          icon="exams"
          loading={loading}
          accent="primary"
        />
        <StatCard
          label="Unpaid fees"
          value={stats.unpaidFees}
          hint={`₹${stats.unpaidAmount.toLocaleString('en-IN')} outstanding`}
          icon="fees"
          loading={loading}
          accent="accent"
        />
        <StatCard
          label="Published exams"
          value={stats.published}
          hint="Open for enrollment"
          icon="exams"
          loading={loading}
          accent="success"
        />
        <StatCard
          label="Hall tickets pending"
          value={stats.hallTicketReady}
          hint="Published but not released"
          icon="organization"
          loading={loading}
          accent="warning"
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader
            title="Workload mix"
            description="How attention is currently distributed"
          />
          <CardBody className="space-y-5">
            <ProgressRow
              label="Approvals"
              value={stats.pendingApprovals}
              total={workloadTotal}
              tone="primary"
            />
            <ProgressRow
              label="Fee collections"
              value={stats.unpaidFees}
              total={workloadTotal}
              tone="accent"
            />
            <ProgressRow
              label="Hall tickets"
              value={stats.hallTicketReady}
              total={workloadTotal}
              tone="warning"
            />
            <div className="rounded-[var(--radius)] bg-[var(--surface-subtle)] p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                Publish progress
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {loading ? '—' : `${donePct}%`}
              </p>
              <p className="text-sm text-[var(--muted)]">
                {stats.published} of {stats.exams} exams published
              </p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Catalog" description="Academic setup totals" />
          <CardBody className="grid gap-3">
            <MiniStat label="Regulations" value={stats.regulations} loading={loading} />
            <MiniStat label="Subjects" value={stats.subjects} loading={loading} />
            <MiniStat label="Examinations" value={stats.exams} loading={loading} />
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ActionList
          title="Pending approvals"
          description="Review and approve submissions"
          href="/dashboard/exams"
          linkLabel="View all"
          loading={loading}
          emptyTitle="No pending approvals"
          emptyDescription="Submitted examinations will appear here."
        >
          {pendingExams.map((exam) => (
            <Link
              key={exam.id}
              href={`/dashboard/exams/${exam.id}`}
              className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--surface-subtle)] px-4 py-3 transition hover:bg-[var(--primary-soft)]"
            >
              <div>
                <p className="font-semibold text-slate-900">{exam.name}</p>
                <p className="text-xs text-[var(--muted)]">
                  {exam.course} · Y{exam.yearOfStudy}/S{exam.semester}
                </p>
              </div>
              <StatusBadge status={exam.status} />
            </Link>
          ))}
        </ActionList>

        <ActionList
          title="Unpaid fees"
          description="Recent pending fee records"
          href="/dashboard/fees"
          linkLabel="Fee desk"
          loading={loading}
          emptyTitle="No unpaid fees"
          emptyDescription="Pending collections will show here."
        >
          {unpaidRecords.map((r) => (
            <Link
              key={r.id}
              href={`/dashboard/fees/collect/${encodeURIComponent(r.studentRollNumber)}`}
              className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--surface-subtle)] px-4 py-3 transition hover:bg-[var(--accent-soft)]"
            >
              <div>
                <p className="font-semibold text-slate-900">
                  {r.studentRollNumber}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  {r.exam?.name ?? `Exam #${r.examId}`}
                </p>
              </div>
              <Money amount={r.totalAmount} />
            </Link>
          ))}
        </ActionList>

        <ActionList
          title="Published exams"
          description="Enrollment-ready examinations"
          loading={loading}
          emptyTitle="No published exams"
          emptyDescription="Publish an approved exam to open enrollment."
        >
          {publishedExams.map((exam) => (
            <Link
              key={exam.id}
              href={`/dashboard/exams/${exam.id}?tab=hall-tickets`}
              className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--surface-subtle)] px-4 py-3 transition hover:bg-[var(--success-soft)]"
            >
              <div>
                <p className="font-semibold text-slate-900">{exam.name}</p>
                <p className="text-xs text-[var(--muted)]">
                  {exam.hallTicketsReleasedAt
                    ? 'Hall tickets released'
                    : 'Hall tickets not released'}
                </p>
              </div>
              <StatusBadge status={exam.status} />
            </Link>
          ))}
        </ActionList>

        <Card>
          <CardHeader title="Portal modules" description="Jump to a workspace" />
          <CardBody>
            <div className="grid gap-3 sm:grid-cols-2">
              {quickLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex items-start gap-4 rounded-2xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-sm)] transition hover:shadow-[var(--shadow-md)]"
                >
                  <div className="rounded-2xl bg-[var(--primary-soft)] p-2.5 text-[var(--primary)] transition group-hover:bg-[var(--primary)] group-hover:text-white">
                    <NavIcon name={item.icon} />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{item.label}</p>
                    <p className="mt-0.5 text-sm text-[var(--muted)]">
                      {item.description}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function ProgressRow({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: 'primary' | 'accent' | 'warning';
}) {
  const pct = Math.min(100, Math.round((value / Math.max(total, 1)) * 100));
  const bar = {
    primary: 'bg-[var(--primary)]',
    accent: 'bg-[var(--accent)]',
    warning: 'bg-[var(--warning)]',
  }[tone];
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="tabular-nums text-[var(--muted)]">{value}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
        <div
          className={`h-full rounded-full ${bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  loading,
}: {
  label: string;
  value: number;
  loading?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-[var(--surface-subtle)] px-4 py-3">
      <span className="text-sm font-medium text-[var(--muted)]">{label}</span>
      <span className="text-xl font-bold text-slate-900">
        {loading ? '—' : value}
      </span>
    </div>
  );
}

function ActionList({
  title,
  description,
  href,
  linkLabel,
  loading,
  emptyTitle,
  emptyDescription,
  children,
}: {
  title: string;
  description: string;
  href?: string;
  linkLabel?: string;
  loading?: boolean;
  emptyTitle: string;
  emptyDescription: string;
  children: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children : [children];
  const hasItems = items.filter(Boolean).length > 0;
  return (
    <Card>
      <CardHeader
        title={title}
        description={description}
        action={
          href && linkLabel ? (
            <Link
              href={href}
              className="text-sm font-semibold text-[var(--primary)]"
            >
              {linkLabel}
            </Link>
          ) : undefined
        }
      />
      <CardBody className="space-y-2">
        {loading ? (
          <LoadingBlock />
        ) : !hasItems ? (
          <EmptyState title={emptyTitle} description={emptyDescription} />
        ) : (
          children
        )}
      </CardBody>
    </Card>
  );
}
