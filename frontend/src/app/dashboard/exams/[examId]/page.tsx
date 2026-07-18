'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Exam, ExamAnalytics } from '@/types/exam';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
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
    if (Number.isFinite(examId)) void loadExam();
  }, [examId, loadExam]);

  useEffect(() => {
    if (!exam || tabParam !== 'analytics') return;
    setAnalyticsLoading(true);
    setAnalyticsError('');
    api
      .getExamAnalytics(exam.id)
      .then(setAnalytics)
      .catch((err) =>
        setAnalyticsError(
          err instanceof ApiError
            ? err.message
            : 'Failed to load exam analytics.',
        ),
      )
      .finally(() => setAnalyticsLoading(false));
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

  const canEdit = exam.status === 'draft' || exam.status === 'rejected';

  return (
    <div className="space-y-6">
      <PageHeader
        title={exam.name}
        description="Overview, subjects, analytics, hall tickets, and results."
        action={
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
            {exam.status === 'draft' || exam.status === 'rejected' ? (
              <Button onClick={() => void handleSubmit()} loading={saving}>
                Submit
              </Button>
            ) : null}
            {exam.status === 'pending_approval' ? (
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
            {exam.status === 'approved' ? (
              <Button onClick={() => setPublishOpen(true)}>Publish</Button>
            ) : null}
            {exam.status === 'published' && !exam.hallTicketsReleasedAt ? (
              <Button
                variant="warning"
                onClick={() => void handleReleaseHallTickets()}
                loading={saving}
              >
                Release hall tickets
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="flex items-center gap-2">
        <StatusBadge status={exam.status} />
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Tabs
        activeId={tabParam}
        items={[
          {
            id: 'overview',
            label: 'Overview',
            href: `/dashboard/exams/${exam.id}?tab=overview`,
          },
          {
            id: 'subjects',
            label: 'Subjects',
            href: `/dashboard/exams/${exam.id}?tab=subjects`,
            count: exam.examSubjects?.length,
          },
          {
            id: 'analytics',
            label: 'Analytics',
            href: `/dashboard/exams/${exam.id}?tab=analytics`,
          },
          {
            id: 'hall-tickets',
            label: 'Hall tickets',
            href: `/dashboard/exams/${exam.id}?tab=hall-tickets`,
          },
          {
            id: 'results',
            label: 'Results',
            href: `/dashboard/exams/${exam.id}?tab=results`,
          },
        ]}
      />

      <Card>
        <CardBody>
          {tabParam === 'overview' ? <ExamOverviewPanel exam={exam} /> : null}
          {tabParam === 'subjects' ? <ExamSubjectsPanel exam={exam} /> : null}
          {tabParam === 'analytics' ? (
            <ExamAnalyticsPanel
              analytics={analytics}
              loading={analyticsLoading}
              error={analyticsError}
            />
          ) : null}
          {tabParam === 'hall-tickets' ? (
            <ExamHallTicketsTab exam={exam} />
          ) : null}
          {tabParam === 'results' ? <ExamResultsPanel exam={exam} /> : null}
        </CardBody>
      </Card>

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
