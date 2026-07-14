'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Regulation } from '@/types/regulation';
import {
  Exam,
  CreateExamInput,
  UpdateExamInput,
  ExamStatus,
  ExamAnalytics,
} from '@/types/exam';
import { money } from '@/components/fees/money';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ExamForm } from '@/components/exams/ExamForm';
import { ExamTable } from '@/components/exams/ExamTable';
import { PublishExamModal } from '@/components/exams/PublishExamModal';
import { ExamHallTicketsPanel } from '@/components/exams/ExamHallTicketsPanel';

type StatusFilter = 'all' | ExamStatus;

const selectClass =
  'rounded-[var(--radius)] border border-[var(--border)] bg-white px-3.5 py-2 text-sm outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]';

const statusTabs: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Draft' },
  { id: 'pending_approval', label: 'Pending approval' },
  { id: 'approved', label: 'Approved' },
  { id: 'published', label: 'Published' },
  { id: 'rejected', label: 'Rejected' },
];

export default function ExamsPage() {
  const [regulations, setRegulations] = useState<Regulation[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [selected, setSelected] = useState<Exam | null>(null);
  const [rejectRemarks, setRejectRemarks] = useState('');
  const [actionError, setActionError] = useState('');
  const [analytics, setAnalytics] = useState<ExamAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState('');

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

  const counts = useMemo(() => {
    // when filtered, we only have current list — keep simple
    return { total: exams.length };
  }, [exams]);

  function openCreate() {
    setSelected(null);
    setActionError('');
    setFormOpen(true);
  }

  function openEdit(exam: Exam) {
    setSelected(exam);
    setActionError('');
    setFormOpen(true);
  }

  function openView(exam: Exam) {
    setSelected(exam);
    setActionError('');
    setAnalytics(null);
    setAnalyticsError('');
    setViewOpen(true);
    setAnalyticsLoading(true);
    api
      .getExamAnalytics(exam.id)
      .then((data) => setAnalytics(data))
      .catch((err) =>
        setAnalyticsError(
          err instanceof ApiError
            ? err.message
            : 'Failed to load exam analytics.',
        ),
      )
      .finally(() => setAnalyticsLoading(false));
  }

  async function handleSave(data: CreateExamInput) {
    setSaving(true);
    setActionError('');
    try {
      if (selected) {
        const update: UpdateExamInput = { ...data };
        delete (update as { submitForApproval?: boolean }).submitForApproval;
        await api.updateExam(selected.id, update);
      } else {
        await api.createExam(data);
      }
      setFormOpen(false);
      setSelected(null);
      await loadExams();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Failed to save examination.',
      );
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(exam: Exam) {
    setSaving(true);
    setActionError('');
    try {
      await api.submitExam(exam.id);
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
          <Button onClick={openCreate}>
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

      <div className="flex flex-wrap items-center gap-2">
        {statusTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setStatusFilter(tab.id)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              statusFilter === tab.id
                ? 'bg-[var(--primary)] text-white'
                : 'border border-[var(--border)] bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {actionError && !formOpen && !rejectOpen && !publishOpen && (
        <div className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          {actionError}
        </div>
      )}

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
            onEdit={openEdit}
            onView={openView}
            onSubmit={(exam) => void handleSubmit(exam)}
            onApprove={(exam) => void handleApprove(exam)}
            onReject={openReject}
            onPublish={openPublish}
            onReleaseHallTickets={(exam) => void handleReleaseHallTickets(exam)}
          />
        </CardBody>
      </Card>

      <Modal
        open={formOpen}
        onClose={() => !saving && setFormOpen(false)}
        title={selected ? 'Edit examination' : 'Create examination'}
        description="Scope → mapped subjects & fees → dates → review. Only draft/rejected exams can be edited."
        size="xl"
      >
        {actionError && (
          <div className="mb-3 rounded-[var(--radius)] bg-[var(--danger-soft)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
            {actionError}
          </div>
        )}
        <ExamForm
          regulations={regulations}
          initial={selected}
          onSubmit={handleSave}
          onCancel={() => setFormOpen(false)}
          loading={saving}
        />
      </Modal>

      <Modal
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        title={selected?.name ?? 'Examination'}
        description="Details and enrollment analytics"
        size="xl"
      >
        {selected && (
          <div className="space-y-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <p>
                <span className="text-[var(--muted)]">Status:</span>{' '}
                <strong>{selected.status.replace(/_/g, ' ')}</strong>
              </p>
              <p>
                <span className="text-[var(--muted)]">Enrollment types:</span>{' '}
                {(selected.allowedTypes?.length
                  ? selected.allowedTypes
                  : [selected.type]
                )
                  .map((t) => t.replace(/_/g, ' '))
                  .join(' + ')}
              </p>
              <p className="sm:col-span-2">
                <span className="text-[var(--muted)]">Scope:</span>{' '}
                {selected.college ? `${selected.college} / ` : ''}
                {selected.course} / {selected.batch} / Y{selected.yearOfStudy} / S
                {selected.semester}
              </p>
              {(selected.scopes?.length ?? 0) > 0 ? (
                <div className="sm:col-span-2">
                  <p className="mb-1 text-[var(--muted)]">Branches & sections</p>
                  <ul className="space-y-1 rounded-[var(--radius)] border border-[var(--border)] p-3">
                    {selected.scopes!.map((s, i) => (
                      <li key={s.id ?? `${s.branch}-${s.section}-${i}`}>
                        {s.branch}
                        {s.section ? ` · ${s.section}` : ' · all sections'}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p>
                  <span className="text-[var(--muted)]">Branch:</span>{' '}
                  {selected.branch}
                </p>
              )}
              <p>
                <span className="text-[var(--muted)]">Package fee:</span>{' '}
                {selected.packageFee ?? '—'}
              </p>
              <p>
                <span className="text-[var(--muted)]">Application:</span>{' '}
                {selected.applicationStartDate ?? '—'} →{' '}
                {selected.applicationEndDate ?? '—'}
              </p>
              <p>
                <span className="text-[var(--muted)]">Examination:</span>{' '}
                {selected.examinationStartDate ?? '—'} →{' '}
                {selected.examinationEndDate ?? '—'}
              </p>
              <p>
                <span className="text-[var(--muted)]">Hall tickets:</span>{' '}
                {selected.hallTicketsReleasedAt
                  ? `Released ${new Date(selected.hallTicketsReleasedAt).toLocaleString()}`
                  : 'Not released'}
              </p>
            </div>
            {selected.rejectionRemarks && (
              <p className="text-red-600">
                Rejection remarks: {selected.rejectionRemarks}
              </p>
            )}
            <div>
              <p className="mb-2 font-medium text-slate-800">Subjects</p>
              <ul className="space-y-1 rounded-[var(--radius)] border border-[var(--border)] p-3">
                {(selected.examSubjects ?? []).map((es) => (
                  <li key={es.id} className="flex justify-between gap-3">
                    <span>
                      {es.subject?.code ?? es.subjectId} —{' '}
                      {es.subject?.name ?? ''}
                    </span>
                    <span className="text-[var(--muted)]">
                      {es.examDate ?? '—'} · Fee: {es.fee}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            {(selected.lateFeeSlabs?.length ?? 0) > 0 && (
              <div>
                <p className="mb-2 font-medium text-slate-800">Late fee slabs</p>
                <ul className="space-y-1 text-[var(--muted)]">
                  {selected.lateFeeSlabs.map((s, idx) => (
                    <li key={idx}>
                      Day {s.fromDay}–{s.toDay}: {s.amount}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {selected.instructions && (
              <p className="text-[var(--muted)]">{selected.instructions}</p>
            )}

            {selected.status === 'published' && (
              <ExamHallTicketsPanel exam={selected} />
            )}

            <div>
              <p className="mb-2 font-medium text-slate-800">Analytics</p>
              {analyticsLoading ? (
                <p className="text-[var(--muted)]">Loading analytics…</p>
              ) : analyticsError ? (
                <p className="text-[var(--danger)]">{analyticsError}</p>
              ) : analytics ? (
                <div className="space-y-3">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Stat
                      label="Eligible"
                      value={String(analytics.eligibleCount)}
                    />
                    <Stat
                      label="Enrolled"
                      value={String(analytics.enrolledCount)}
                    />
                    <Stat
                      label="Not enrolled"
                      value={String(analytics.notEnrolledCount)}
                    />
                    <Stat label="Paid" value={String(analytics.paidCount)} />
                    <Stat
                      label="Payment due"
                      value={String(analytics.pendingPaymentCount)}
                    />
                    <Stat
                      label="Est. / student"
                      value={money(analytics.estimatedPerStudent)}
                    />
                    <Stat
                      label="Estimated total"
                      value={money(analytics.estimatedRevenue)}
                    />
                    <Stat
                      label="Collected"
                      value={money(analytics.collectedRevenue)}
                    />
                  </div>
                  {analytics.byScope.length > 0 && (
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
                              <td className="px-3 py-2">
                                {row.pendingPayment}
                              </td>
                              <td className="px-3 py-2">{row.notEnrolled}</td>
                              <td className="px-3 py-2">
                                {money(row.estimatedRevenue)}
                              </td>
                              <td className="px-3 py-2">
                                {money(row.collectedRevenue)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setViewOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={rejectOpen}
        onClose={() => !saving && setRejectOpen(false)}
        title="Reject examination"
        description={selected ? `Provide remarks for "${selected.name}".` : undefined}
      >
        <textarea
          value={rejectRemarks}
          onChange={(e) => setRejectRemarks(e.target.value)}
          rows={4}
          className={selectClass}
          placeholder="Rejection remarks..."
        />
        {actionError && (
          <div className="mt-3 rounded-[var(--radius)] bg-[var(--danger-soft)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
            {actionError}
          </div>
        )}
        <div className="mt-5 flex justify-end gap-3">
          <Button
            variant="secondary"
            onClick={() => setRejectOpen(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void confirmReject()} disabled={saving}>
            {saving ? 'Rejecting...' : 'Reject'}
          </Button>
        </div>
      </Modal>

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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
