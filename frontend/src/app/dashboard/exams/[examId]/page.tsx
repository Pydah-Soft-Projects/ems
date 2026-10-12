'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Exam, ExamAnalytics } from '@/types/exam';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Tabs } from '@/components/ui/Tabs';
import { LoadingBlock } from '@/components/ui/Spinner';
import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  ExamAnalyticsPanel,
  ExamHallTicketsTab,
  ExamOverviewPanel,
  ExamSubjectsPanel,
} from '@/components/exams/ExamDetailPanels';
import { ExamResultsPanel } from '@/components/exams/ExamResultsPanel';
import { PublishExamModal } from '@/components/exams/PublishExamModal';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { TextareaField } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { getStoredUser } from '@/lib/auth';
import { can } from '@/lib/permissions';

type DetailTab = 'overview' | 'subjects' | 'analytics' | 'hall-tickets' | 'results';

export default function ExamDetailPage() {
  const params = useParams<{ examId: string }>();
  const searchParams = useSearchParams();
  const examId = Number(params.examId);
  const router = useRouter();
  const toast = useToast();
  const tabParam = (searchParams.get('tab') as DetailTab) || 'overview';

  const [exam, setExam] = useState<Exam | null>(null);
  const [analytics, setAnalytics] = useState<ExamAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [error, setError] = useState('');
  const [analyticsError, setAnalyticsError] = useState('');
  const [saving, setSaving] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [rejectRemarks, setRejectRemarks] = useState('');

  const loadExam = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setExam(await api.getExam(examId));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to load examination.',
      );
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    if (!Number.isFinite(examId)) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError('');
      try {
        const next = await api.getExam(examId);
        if (!cancelled) setExam(next);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : 'Failed to load examination.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [examId]);

  useEffect(() => {
    if (!exam || tabParam !== 'analytics') return;
    if (!can(getStoredUser(), 'exams:analytics')) return;
    let cancelled = false;
    const run = async () => {
      setAnalyticsLoading(true);
      setAnalyticsError('');
      try {
        const next = await api.getExamAnalytics(exam.id);
        if (!cancelled) setAnalytics(next);
      } catch (err) {
        if (!cancelled) {
          setAnalyticsError(
            err instanceof ApiError
              ? err.message
              : 'Failed to load exam analytics.',
          );
        }
      } finally {
        if (!cancelled) setAnalyticsLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [exam, tabParam]);

  async function handleSubmit() {
    if (!exam) return;
    setSaving(true);
    try {
      await api.submitExam(exam.id);
      toast.push('Submitted for approval.', 'success');
      await loadExam();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to submit examination.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    if (!exam) return;
    setSaving(true);
    try {
      await api.approveExam(exam.id);
      toast.push('Examination approved.', 'success');
      await loadExam();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to approve examination.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function confirmReject() {
    if (!exam) return;
    if (!rejectRemarks.trim()) {
      setError('Rejection remarks are required.');
      return;
    }
    setSaving(true);
    try {
      await api.rejectExam(exam.id, rejectRemarks.trim());
      setRejectOpen(false);
      toast.push('Examination rejected.', 'warning');
      await loadExam();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to reject examination.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function confirmPublish() {
    if (!exam) return;
    setSaving(true);
    try {
      await api.publishExam(exam.id, {});
      setPublishOpen(false);
      toast.push('Examination published.', 'success');
      await loadExam();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to publish examination.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleReleaseHallTickets() {
    if (!exam) return;
    setSaving(true);
    try {
      await api.releaseHallTickets(exam.id);
      toast.push('Hall tickets released.', 'success');
      await loadExam();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to release hall tickets.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingBlock label="Loading examination…" />;
  if (!exam) {
    return (
      <Alert tone="danger">
        {error || 'Examination not found.'}{' '}
        <Link href="/dashboard/exams" className="underline">
          Back to list
        </Link>
      </Alert>
    );
  }

  const staff = getStoredUser();
  const canEdit = can(staff, 'exams:edit');
  const types = exam.allowedTypes?.length ? exam.allowedTypes : [exam.type];

  const tabs = [
    {
      id: 'overview' as const,
      label: 'Overview',
      href: `/dashboard/exams/${exam.id}?tab=overview`,
    },
    {
      id: 'subjects' as const,
      label: 'Subjects',
      href: `/dashboard/exams/${exam.id}?tab=subjects`,
      count: exam.examSubjects?.length,
    },
    ...(can(staff, 'exams:analytics')
      ? [
          {
            id: 'analytics' as const,
            label: 'Analytics',
            href: `/dashboard/exams/${exam.id}?tab=analytics`,
          },
        ]
      : []),
    ...(can(staff, 'exams:hall_tickets')
      ? [
          {
            id: 'hall-tickets' as const,
            label: 'Hall tickets',
            href: `/dashboard/exams/${exam.id}?tab=hall-tickets`,
          },
        ]
      : []),
    ...(can(staff, 'exams:results')
      ? [
          {
            id: 'results' as const,
            label: 'Results',
            href: `/dashboard/exams/${exam.id}?tab=results`,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-gradient-to-br from-[#0d1b3d] via-[#13294f] to-[#1d5c2f] p-6 text-white shadow-[var(--shadow-md)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StatusBadge status={exam.status} />
              <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                {types.map((t) => t.replace(/_/g, ' ')).join(' · ')}
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {exam.name}
            </h1>
            <p className="mt-2 text-sm text-slate-200">
              {exam.college ?? '—'} · {exam.course} ·{' '}
              {exam.scopes?.length
                ? (() => {
                    const batches = [...new Set(exam.scopes.map((s) => s.batch).filter(Boolean))].join(', ') || exam.batch;
                    const years = [...new Set(exam.scopes.map((s) => s.yearOfStudy).filter(Boolean))].sort((a, b) => a - b);
                    const sems = [...new Set(exam.scopes.map((s) => s.semester).filter(Boolean))].sort((a, b) => a - b);
                    const yrStr = years.length > 0 ? `Y${years.join(', ')}` : `Y${exam.yearOfStudy}`;
                    const semStr = sems.length > 0 ? `S${sems.join(', ')}` : `S${exam.semester}`;
                    return `Batch: ${batches} · ${yrStr} / ${semStr}`;
                  })()
                : `Batch ${exam.batch} · Y${exam.yearOfStudy} S${exam.semester}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => router.push('/dashboard/exams')}>
              Back
            </Button>
            {canEdit ? (
              <Button
                variant="secondary"
                onClick={() => router.push(`/dashboard/exams/${exam.id}/edit`)}
              >
                Edit
              </Button>
            ) : null}
            {(exam.status === 'draft' || exam.status === 'rejected') &&
            can(staff, 'exams:submit') ? (
              <Button onClick={() => void handleSubmit()} loading={saving}>
                Submit
              </Button>
            ) : null}
            {exam.status === 'pending_approval' && can(staff, 'exams:approve') ? (
              <>
                <Button
                  variant="success"
                  onClick={() => void handleApprove()}
                  loading={saving}
                >
                  Approve
                </Button>
                <Button variant="danger" onClick={() => setRejectOpen(true)}>
                  Reject
                </Button>
              </>
            ) : null}
            {exam.status === 'approved' && can(staff, 'exams:publish') ? (
              <Button onClick={() => setPublishOpen(true)}>Publish</Button>
            ) : null}
            {exam.status === 'published' &&
            !exam.hallTicketsReleasedAt &&
            can(staff, 'exams:hall_tickets') ? (
              <Button
                variant="warning"
                onClick={() => void handleReleaseHallTickets()}
                loading={saving}
              >
                Release hall tickets
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Tabs activeId={tabParam} items={tabs} />

      <div className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)] sm:p-6">
          {tabParam === 'overview' ? (
            <ExamOverviewPanel
              exam={exam}
              canEditSlabs={canEdit}
              onEditSlabs={() => router.push(`/dashboard/exams/${exam.id}/edit?step=3#late-fee-slabs`)}
            />
          ) : null}
          {tabParam === 'subjects' ? <ExamSubjectsPanel exam={exam} /> : null}
          {tabParam === 'analytics' && can(staff, 'exams:analytics') ? (
            <ExamAnalyticsPanel
              analytics={analytics}
              loading={analyticsLoading}
              error={analyticsError}
            />
          ) : null}
          {tabParam === 'hall-tickets' && can(staff, 'exams:hall_tickets') ? (
            <ExamHallTicketsTab exam={exam} />
          ) : null}
          {tabParam === 'results' && can(staff, 'exams:results') ? (
            <ExamResultsPanel exam={exam} />
          ) : null}
      </div>

      <ConfirmDialog
        open={rejectOpen}
        onClose={() => !saving && setRejectOpen(false)}
        onConfirm={confirmReject}
        title="Reject examination"
        confirmLabel="Reject"
        tone="danger"
        loading={saving}
      >
        <TextareaField
          label="Rejection remarks"
          value={rejectRemarks}
          onChange={(e) => setRejectRemarks(e.target.value)}
          rows={4}
        />
      </ConfirmDialog>

      <PublishExamModal
        open={publishOpen}
        exam={exam}
        saving={saving}
        error={error}
        onClose={() => {
          if (!saving) setPublishOpen(false);
        }}
        onPublish={confirmPublish}
      />
    </div>
  );
}
