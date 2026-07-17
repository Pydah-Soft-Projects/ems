'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Regulation } from '@/types/regulation';
import { Exam, ExamStatus } from '@/types/exam';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { TextareaField } from '@/components/ui/Field';
import { ExamTable } from '@/components/exams/ExamTable';
import { PublishExamModal } from '@/components/exams/PublishExamModal';
import { useToast } from '@/components/ui/Toast';
import { StatusFilter as StatusFilterBar } from '@/components/ui/SoftSearch';

type ExamStatusFilter = 'all' | ExamStatus;

const statusTabs: { id: ExamStatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Draft' },
  { id: 'pending_approval', label: 'Pending approval' },
  { id: 'approved', label: 'Approved' },
  { id: 'published', label: 'Published' },
  { id: 'rejected', label: 'Rejected' },
];

export default function ExamsPage() {
  const router = useRouter();
  const toast = useToast();
  const [regulations, setRegulations] = useState<Regulation[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [statusFilter, setStatusFilter] = useState<ExamStatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [selected, setSelected] = useState<Exam | null>(null);
  const [rejectRemarks, setRejectRemarks] = useState('');
  const [actionError, setActionError] = useState('');

  const loadRegulations = useCallback(async () => {
    try {
      setRegulations(await api.getRegulations());
    } catch {
      setActionError('Failed to load regulations.');
    }
  }, []);

  const loadExams = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getExams(
        statusFilter === 'all' ? undefined : statusFilter,
      );
      setExams(data);
    } catch {
      setActionError('Failed to load examinations.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void loadRegulations();
  }, [loadRegulations]);

  useEffect(() => {
    void loadExams();
  }, [loadExams]);

  const counts = useMemo(() => ({ total: exams.length }), [exams]);

  async function handleSubmit(exam: Exam) {
    setSaving(true);
    setActionError('');
    try {
      await api.submitExam(exam.id);
      toast.push('Examination submitted for approval.', 'success');
      await loadExams();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Failed to submit examination.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove(exam: Exam) {
    setSaving(true);
    setActionError('');
    try {
      await api.approveExam(exam.id);
      toast.push('Examination approved.', 'success');
      await loadExams();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Failed to approve examination.',
      );
    } finally {
      setSaving(false);
    }
  }

  function openReject(exam: Exam) {
    setSelected(exam);
    setRejectRemarks('');
    setActionError('');
    setRejectOpen(true);
  }

  async function confirmReject() {
    if (!selected) return;
    if (!rejectRemarks.trim()) {
      setActionError('Rejection remarks are required.');
      return;
    }
    setSaving(true);
    setActionError('');
    try {
      await api.rejectExam(selected.id, rejectRemarks.trim());
      setRejectOpen(false);
      setSelected(null);
      toast.push('Examination rejected.', 'warning');
      await loadExams();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Failed to reject examination.',
      );
    } finally {
      setSaving(false);
    }
  }

  function openPublish(exam: Exam) {
    setSelected(exam);
    setActionError('');
    setPublishOpen(true);
  }

  async function handleReleaseHallTickets(exam: Exam) {
    setSaving(true);
    setActionError('');
    try {
      await api.releaseHallTickets(exam.id);
      toast.push('Hall tickets released to students.', 'success');
      await loadExams();
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : 'Failed to release hall tickets.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function confirmPublish() {
    if (!selected) return;
    setSaving(true);
    setActionError('');
    try {
      await api.publishExam(selected.id, {});
      setPublishOpen(false);
      setSelected(null);
      toast.push('Examination published.', 'success');
      await loadExams();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Failed to publish examination.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Examinations"
        description="Create examinations from mapped subjects, submit for approval, and publish for student enrollment."
        action={
          <Button onClick={() => router.push('/dashboard/exams/new')}>
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
            New examination
          </Button>
        }
      />

      <StatusFilterBar
        items={statusTabs}
        value={statusFilter}
        onChange={setStatusFilter}
      />

      {actionError && !rejectOpen && !publishOpen ? (
        <Alert tone="danger">{actionError}</Alert>
      ) : null}

      <Card>
        <CardHeader
          title="Examinations"
          description={`${counts.total} examination${counts.total !== 1 ? 's' : ''}`}
        />
        <CardBody className="!p-0">
          <ExamTable
            exams={exams}
            regulations={regulations}
            loading={loading}
            onEdit={(exam) => router.push(`/dashboard/exams/${exam.id}/edit`)}
            onView={(exam) => router.push(`/dashboard/exams/${exam.id}`)}
            onSubmit={(exam) => void handleSubmit(exam)}
            onApprove={(exam) => void handleApprove(exam)}
            onReject={openReject}
            onPublish={openPublish}
            onReleaseHallTickets={(exam) => void handleReleaseHallTickets(exam)}
          />
        </CardBody>
      </Card>

      <ConfirmDialog
        open={rejectOpen}
        onClose={() => !saving && setRejectOpen(false)}
        onConfirm={confirmReject}
        title="Reject examination"
        description={
          selected ? `Provide remarks for "${selected.name}".` : undefined
        }
        confirmLabel={saving ? 'Rejecting…' : 'Reject'}
        tone="danger"
        loading={saving}
      >
        <TextareaField
          label="Rejection remarks"
          value={rejectRemarks}
          onChange={(e) => setRejectRemarks(e.target.value)}
          rows={4}
          placeholder="Rejection remarks..."
        />
        {actionError ? (
          <Alert tone="danger" className="mt-3">
            {actionError}
          </Alert>
        ) : null}
      </ConfirmDialog>

      <PublishExamModal
        open={publishOpen}
        exam={selected}
        saving={saving}
        error={actionError}
        onClose={() => {
          if (!saving) {
            setPublishOpen(false);
            setActionError('');
          }
        }}
        onPublish={confirmPublish}
      />
    </div>
  );
}
