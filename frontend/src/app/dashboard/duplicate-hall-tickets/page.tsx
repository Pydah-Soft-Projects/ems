'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiError, api } from '@/lib/api';
import { Exam, HallTicket } from '@/types/exam';
import { ExamFeeRecord } from '@/types/fee';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { Alert } from '@/components/ui/Alert';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock } from '@/components/ui/Spinner';
import { HallTicketDocument } from '@/components/exams/HallTicketDocument';
import { printA5HallTicket } from '@/lib/printA5HallTicket';
import { isDuplicateHallTicketFeeRecord } from '@/lib/upiConvenienceFee';
import { money } from '@/components/fees/money';
import { getStoredUser } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { AccessDenied } from '@/components/auth/AccessDenied';

type PageTab = 'raise' | 'approve';

const selectClass =
  'h-10 w-full rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)] disabled:cursor-not-allowed disabled:bg-[var(--surface-muted)] disabled:text-[var(--muted)]';

function uniqueSorted(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort(
    (a, b) => a.localeCompare(b),
  );
}

function examLabel(exam: Exam) {
  const scope = [
    exam.college,
    exam.course,
    exam.batch ? `Batch ${exam.batch}` : null,
    `Y${exam.yearOfStudy}/S${exam.semester}`,
  ]
    .filter(Boolean)
    .join(' · ');
  return scope ? `${exam.name} — ${scope}` : exam.name;
}

function rollKey(value: string) {
  return value.trim().toLowerCase();
}

function examBranches(exam: Exam) {
  return uniqueSorted([
    exam.branch,
    ...(exam.scopes ?? []).map((scope) => scope.branch),
  ]);
}

export default function DuplicateHallTicketsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = getStoredUser();
  const canRaise =
    can(user, 'exams:duplicate_hall_tickets:raise') ||
    can(user, 'fees:collect') ||
    can(user, 'exams:hall_tickets');
  const canPrint =
    can(user, 'exams:duplicate_hall_tickets:print') ||
    can(user, 'exams:hall_tickets');
  const tabFromUrl: PageTab =
    searchParams.get('tab') === 'approve' ? 'approve' : 'raise';
  const activeTab: PageTab =
    tabFromUrl === 'approve' && canPrint
      ? 'approve'
      : tabFromUrl === 'raise' && canRaise
        ? 'raise'
        : canRaise
          ? 'raise'
          : 'approve';

  const [exams, setExams] = useState<Exam[]>([]);
  const [tickets, setTickets] = useState<HallTicket[]>([]);
  const [duplicateRecords, setDuplicateRecords] = useState<ExamFeeRecord[]>([]);
  const [settingsFee, setSettingsFee] = useState(250);
  const [loadingExams, setLoadingExams] = useState(true);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [error, setError] = useState('');
  const [redirectingRoll, setRedirectingRoll] = useState<string | null>(null);
  const [previewTicket, setPreviewTicket] = useState<HallTicket | null>(null);
  const [printingKey, setPrintingKey] = useState<string | null>(null);

  const [examId, setExamId] = useState('');
  const [collegeFilter, setCollegeFilter] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [search, setSearch] = useState('');

  const selectedExam = useMemo(
    () => exams.find((exam) => String(exam.id) === examId) ?? null,
    [exams, examId],
  );

  const liveDuplicateFee = Number(
    selectedExam?.duplicateHallTicketFee ?? settingsFee ?? 250,
  ) || Number(settingsFee ?? 250) || 250;

  useEffect(() => {
    let mounted = true;
    setLoadingExams(true);
    Promise.all([
      api.getExams('published'),
      api.getPaymentSettings().catch(() => ({ duplicateHallTicketFee: 250 })),
    ])
      .then(([examRows, settings]) => {
        if (!mounted) return;
        setExams(
          [...(examRows || [])].sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
          ),
        );
        setSettingsFee(Number(settings?.duplicateHallTicketFee ?? 250) || 250);
      })
      .catch((err) => {
        if (!mounted) return;
        setExams([]);
        setError(
          err instanceof ApiError
            ? err.message
            : 'Failed to load examinations.',
        );
      })
      .finally(() => {
        if (mounted) setLoadingExams(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!examId) {
      setTickets([]);
      setLoadingTickets(false);
      return;
    }
    let mounted = true;
    setLoadingTickets(true);
    setError('');
    api
      .getExamHallTickets(Number(examId))
      .then((result) => {
        if (!mounted) return;
        setTickets(result.tickets || []);
      })
      .catch((err) => {
        if (!mounted) return;
        setTickets([]);
        setError(
          err instanceof ApiError
            ? err.message
            : 'Failed to load hall tickets.',
        );
      })
      .finally(() => {
        if (mounted) setLoadingTickets(false);
      });
    return () => {
      mounted = false;
    };
  }, [examId]);

  const loadDuplicateRecords = useCallback(async () => {
    setLoadingRecords(true);
    try {
      const records = await api.getDuplicateHallTicketFeeRecords({
        examId: examId ? Number(examId) : undefined,
        status: activeTab === 'approve' ? 'paid' : undefined,
      });
      setDuplicateRecords(
        (records || []).filter((record) =>
          isDuplicateHallTicketFeeRecord(record.feeBreakdown),
        ),
      );
    } catch (err) {
      setDuplicateRecords([]);
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to load duplicate hall ticket requests.',
      );
    } finally {
      setLoadingRecords(false);
    }
  }, [activeTab, examId]);

  useEffect(() => {
    if (activeTab === 'raise' && !examId) {
      setDuplicateRecords([]);
      setLoadingRecords(false);
      return;
    }
    void loadDuplicateRecords();
  }, [activeTab, examId, loadDuplicateRecords]);

  const collegeOptions = useMemo(
    () => uniqueSorted(exams.map((exam) => exam.college)),
    [exams],
  );

  const courseOptions = useMemo(
    () =>
      uniqueSorted(
        exams
          .filter((exam) => !collegeFilter || exam.college === collegeFilter)
          .map((exam) => exam.course),
      ),
    [collegeFilter, exams],
  );

  const branchOptions = useMemo(
    () =>
      uniqueSorted(
        exams
          .filter(
            (exam) =>
              (!collegeFilter || exam.college === collegeFilter) &&
              (!courseFilter || exam.course === courseFilter),
          )
          .flatMap((exam) => examBranches(exam)),
      ),
    [collegeFilter, courseFilter, exams],
  );

  const batchOptions = useMemo(
    () =>
      uniqueSorted(
        exams
          .filter(
            (exam) =>
              (!collegeFilter || exam.college === collegeFilter) &&
              (!courseFilter || exam.course === courseFilter) &&
              (!branchFilter || examBranches(exam).includes(branchFilter)),
          )
          .map((exam) => exam.batch),
      ),
    [branchFilter, collegeFilter, courseFilter, exams],
  );

  const filteredExams = useMemo(
    () =>
      exams.filter((exam) => {
        if (collegeFilter && (exam.college || '') !== collegeFilter) return false;
        if (courseFilter && (exam.course || '') !== courseFilter) return false;
        if (branchFilter && !examBranches(exam).includes(branchFilter)) return false;
        if (batchFilter && (exam.batch || '') !== batchFilter) return false;
        return true;
      }),
    [batchFilter, branchFilter, collegeFilter, courseFilter, exams],
  );

  const duplicateByRoll = useMemo(() => {
    const map = new Map<string, ExamFeeRecord[]>();
    for (const record of duplicateRecords) {
      const key = rollKey(record.studentRollNumber);
      const list = map.get(key) ?? [];
      list.push(record);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    }
    return map;
  }, [duplicateRecords]);

  const query = search.trim().toLowerCase();

  const raiseRows = useMemo(() => {
    return tickets.filter((ticket) => {
      if (branchFilter && (ticket.branch || '') !== branchFilter) return false;
      if (!query) return true;
      return (
        ticket.studentName.toLowerCase().includes(query) ||
        ticket.studentRollNumber.toLowerCase().includes(query) ||
        ticket.examType.toLowerCase().includes(query)
      );
    });
  }, [branchFilter, query, tickets]);

  const approveRows = useMemo(() => {
    return duplicateRecords.filter((record) => {
      if (record.status !== 'paid') return false;
      const exam = record.exam;
      if (collegeFilter && (exam?.college || '') !== collegeFilter) return false;
      if (courseFilter && (exam?.course || '') !== courseFilter) return false;
      if (branchFilter && (exam?.branch || '') !== branchFilter) return false;
      if (batchFilter && (exam?.batch || '') !== batchFilter) return false;
      if (!query) return true;
      return (
        record.studentName.toLowerCase().includes(query) ||
        record.studentRollNumber.toLowerCase().includes(query) ||
        String(exam?.name || '').toLowerCase().includes(query)
      );
    });
  }, [
    batchFilter,
    branchFilter,
    collegeFilter,
    courseFilter,
    duplicateRecords,
    query,
  ]);

  function setTab(next: PageTab) {
    if (next === 'raise' && !canRaise) return;
    if (next === 'approve' && !canPrint) return;
    router.replace(
      next === 'approve'
        ? '/dashboard/duplicate-hall-tickets?tab=approve'
        : '/dashboard/duplicate-hall-tickets',
    );
  }

  function clearFilters() {
    setExamId('');
    setCollegeFilter('');
    setCourseFilter('');
    setBranchFilter('');
    setBatchFilter('');
    setSearch('');
  }

  async function handleRaiseRequest(ticket: HallTicket) {
    setError('');
    setRedirectingRoll(ticket.studentRollNumber);
    try {
      const record = await api.createDuplicateHallTicketFeeRecord(
        ticket.examId,
        ticket.studentRollNumber,
        ticket.studentName,
      );
      router.push(
        `/dashboard/fees/collect/${encodeURIComponent(ticket.studentRollNumber)}?examId=${ticket.examId}&from=duplicate-hall-tickets&feeRecordId=${record.id}`,
      );
    } catch (err) {
      setRedirectingRoll(null);
      setError(
        err instanceof ApiError
          ? err.message
          : 'Unable to prepare the duplicate hall ticket fee.',
      );
    }
  }

  async function resolveTicket(
    examIdValue: number,
    studentRollNumber: string,
  ): Promise<HallTicket | null> {
    const fromLoaded = tickets.find(
      (ticket) =>
        ticket.examId === examIdValue &&
        rollKey(ticket.studentRollNumber) === rollKey(studentRollNumber),
    );
    if (fromLoaded) return fromLoaded;
    const result = await api.getExamHallTickets(examIdValue);
    return (
      (result.tickets || []).find(
        (ticket) =>
          rollKey(ticket.studentRollNumber) === rollKey(studentRollNumber),
      ) ?? null
    );
  }

  async function handlePrintDuplicate(
    examIdValue: number,
    studentRollNumber: string,
  ) {
    const key = `${examIdValue}:${studentRollNumber}`;
    setPrintingKey(key);
    setError('');
    try {
      const ticket = await resolveTicket(examIdValue, studentRollNumber);
      if (!ticket) {
        setError('Hall ticket not found for this student.');
        return;
      }
      printA5HallTicket(ticket, {
        collegeName: ticket.college || undefined,
        copies: ['duplicate'],
      });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Unable to print the duplicate hall ticket.',
      );
    } finally {
      setPrintingKey(null);
    }
  }

  async function handlePreview(
    examIdValue: number,
    studentRollNumber: string,
  ) {
    setError('');
    try {
      const ticket = await resolveTicket(examIdValue, studentRollNumber);
      if (!ticket) {
        setError('Hall ticket not found for this student.');
        return;
      }
      setPreviewTicket(ticket);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Unable to preview the hall ticket.',
      );
    }
  }

  const tabItems = [
    ...(canRaise
      ? [{ id: 'raise' as const, label: 'Raise request', count: raiseRows.length }]
      : []),
    ...(canPrint
      ? [{ id: 'approve' as const, label: 'Approvals', count: approveRows.length }]
      : []),
  ];

  const loadingList =
    activeTab === 'raise' ? loadingTickets : loadingRecords;

  return (
    <PermissionGate
      user={user}
      privilege={[
        'exams:duplicate_hall_tickets:raise',
        'exams:duplicate_hall_tickets:print',
        'exams:hall_tickets',
        'fees:collect',
      ]}
      fallback={
        <AccessDenied description="You need duplicate hall ticket privileges (raise and/or print), or legacy hall ticket / fee collection access." />
      }
    >
      <div className="space-y-6">
      <PageHeader
        title="Duplicate hall tickets"
        description="Raise a paid duplicate request from students who already have a hall ticket, then print the duplicate copy from Approvals. No separate approval step is required."
      />

      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white px-4 py-3 text-sm text-slate-700 shadow-[var(--shadow-sm)]">
        Duplicate hall ticket fee: <strong>{money(liveDuplicateFee)}</strong>
        {selectedExam?.duplicateHallTicketFee != null &&
        selectedExam.duplicateHallTicketFee !== ''
          ? ' (exam-specific)'
          : ' (from Settings)'}
        . Click a student on Raise request to collect this fee, then print from Approvals.
      </div>

      <Tabs
        activeId={activeTab}
        items={tabItems}
        onChange={(id) => setTab(id as PageTab)}
      />

      <Card>
        <CardBody className="space-y-5">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))]">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-600">
                Examination
              </span>
              <select
                className={selectClass}
                value={examId}
                onChange={(event) => setExamId(event.target.value)}
                disabled={loadingExams || filteredExams.length === 0}
              >
                <option value="">
                  {activeTab === 'raise'
                    ? 'Select examination'
                    : 'All examinations'}
                </option>
                {filteredExams.map((exam) => (
                  <option key={exam.id} value={String(exam.id)}>
                    {examLabel(exam)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-600">College</span>
              <select
                className={selectClass}
                value={collegeFilter}
                onChange={(event) => {
                  setCollegeFilter(event.target.value);
                  setCourseFilter('');
                  setBranchFilter('');
                  setBatchFilter('');
                }}
              >
                <option value="">All colleges</option>
                {collegeOptions.map((college) => (
                  <option key={college} value={college}>
                    {college}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-600">Course</span>
              <select
                className={selectClass}
                value={courseFilter}
                onChange={(event) => {
                  setCourseFilter(event.target.value);
                  setBranchFilter('');
                  setBatchFilter('');
                }}
              >
                <option value="">All courses</option>
                {courseOptions.map((course) => (
                  <option key={course} value={course}>
                    {course}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-600">Branch</span>
              <select
                className={selectClass}
                value={branchFilter}
                onChange={(event) => {
                  setBranchFilter(event.target.value);
                  setBatchFilter('');
                }}
              >
                <option value="">All branches</option>
                {branchOptions.map((branch) => (
                  <option key={branch} value={branch}>
                    {branch}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-600">Batch</span>
              <select
                className={selectClass}
                value={batchFilter}
                onChange={(event) => setBatchFilter(event.target.value)}
              >
                <option value="">All batches</option>
                {batchOptions.map((batch) => (
                  <option key={batch} value={batch}>
                    {batch}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_auto]">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-600">Search</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className={selectClass}
                placeholder="Student name, PIN, or exam"
              />
            </label>
            <div className="flex items-end">
              <Button type="button" variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card>
        <CardBody className="!p-0">
          {loadingExams || loadingList ? (
            <LoadingBlock
              label={
                activeTab === 'raise'
                  ? 'Loading students with hall tickets…'
                  : 'Loading paid duplicate requests…'
              }
            />
          ) : activeTab === 'raise' && !examId ? (
            <div className="px-5 py-8">
              <EmptyState
                title="Select an examination"
                description="Choose an examination to list students who already have a paid hall ticket, then click a student to collect the duplicate hall ticket fee."
              />
            </div>
          ) : activeTab === 'raise' && raiseRows.length === 0 ? (
            <div className="px-5 py-8">
              <EmptyState
                title="No students found"
                description="No paid hall tickets match the selected filters. Duplicate requests can only be raised for students who already have an original hall ticket."
              />
            </div>
          ) : activeTab === 'approve' && approveRows.length === 0 ? (
            <div className="px-5 py-8">
              <EmptyState
                title="No paid duplicate requests"
                description="After the duplicate hall ticket fee is collected, the student appears here so you can print the duplicate copy. No approval step is required."
              />
            </div>
          ) : activeTab === 'raise' ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-slate-50 text-[0.6875rem] uppercase tracking-wide text-[var(--muted)]">
                    <th className="px-5 py-3 font-semibold">Student</th>
                    <th className="px-5 py-3 font-semibold">Branch / type</th>
                    <th className="px-5 py-3 font-semibold">Fee</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {raiseRows.map((ticket) => {
                    const history =
                      duplicateByRoll.get(rollKey(ticket.studentRollNumber)) ??
                      [];
                    const latest = history[0];
                    const status =
                      latest?.status === 'paid'
                        ? 'paid'
                        : latest?.status === 'pending'
                          ? 'pending'
                          : 'new';
                    const busy = redirectingRoll === ticket.studentRollNumber;
                    return (
                      <tr
                        key={ticket.applicationId}
                        className="cursor-pointer border-b border-[var(--border)] last:border-b-0 hover:bg-slate-50/70"
                        onClick={() => void handleRaiseRequest(ticket)}
                      >
                        <td className="px-5 py-4 align-top">
                          <p className="font-semibold text-slate-900">
                            {ticket.studentName}
                          </p>
                          <p className="mt-1 font-mono text-[0.6875rem] text-[var(--muted)]">
                            {ticket.studentRollNumber}
                          </p>
                        </td>
                        <td className="px-5 py-4 align-top">
                          <p className="font-medium text-slate-800">
                            {ticket.branch || '—'}
                          </p>
                          <p className="mt-1 text-[0.6875rem] capitalize text-[var(--muted)]">
                            {ticket.examType.replace(/_/g, ' ')} ·{' '}
                            {ticket.papers.length} paper
                            {ticket.papers.length === 1 ? '' : 's'}
                          </p>
                        </td>
                        <td className="px-5 py-4 align-top font-medium text-slate-800">
                          {money(liveDuplicateFee)}
                        </td>
                        <td className="px-5 py-4 align-top">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold ${
                              status === 'paid'
                                ? 'bg-emerald-100 text-emerald-700'
                                : status === 'pending'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {status === 'paid'
                              ? 'Paid — can request again'
                              : status === 'pending'
                                ? 'Fee pending'
                                : 'Not requested'}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right align-top">
                          <Button
                            type="button"
                            size="sm"
                            loading={busy}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleRaiseRequest(ticket);
                            }}
                          >
                            Pay fee
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-slate-50 text-[0.6875rem] uppercase tracking-wide text-[var(--muted)]">
                    <th className="px-5 py-3 font-semibold">Student</th>
                    <th className="px-5 py-3 font-semibold">Examination</th>
                    <th className="px-5 py-3 font-semibold">Paid on</th>
                    <th className="px-5 py-3 font-semibold">Amount</th>
                    <th className="px-5 py-3 text-right font-semibold">Print</th>
                  </tr>
                </thead>
                <tbody>
                  {approveRows.map((record) => {
                    if (record.examId == null) return null;
                    const examId = record.examId;
                    const printKey = `${examId}:${record.studentRollNumber}`;
                    const paidAt =
                      record.payments
                        ?.map((payment) => payment.paidAt)
                        .filter(Boolean)
                        .sort()
                        .at(-1) || record.createdAt;
                    return (
                      <tr
                        key={record.id}
                        className="border-b border-[var(--border)] last:border-b-0"
                      >
                        <td className="px-5 py-4 align-top">
                          <p className="font-semibold text-slate-900">
                            {record.studentName}
                          </p>
                          <p className="mt-1 font-mono text-[0.6875rem] text-[var(--muted)]">
                            {record.studentRollNumber}
                          </p>
                        </td>
                        <td className="px-5 py-4 align-top">
                          <p className="font-medium text-slate-800">
                            {record.exam?.name || `Exam #${record.examId}`}
                          </p>
                          <p className="mt-1 text-[0.6875rem] text-[var(--muted)]">
                            {[
                              record.exam?.college,
                              record.exam?.course,
                              record.exam?.branch,
                              record.exam?.batch,
                            ]
                              .filter(Boolean)
                              .join(' · ') || '—'}
                          </p>
                        </td>
                        <td className="px-5 py-4 align-top text-[var(--muted)]">
                          {new Date(paidAt).toLocaleString('en-IN', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </td>
                        <td className="px-5 py-4 align-top font-medium text-slate-800">
                          {money(record.totalAmount)}
                        </td>
                        <td className="px-5 py-4 text-right align-top">
                          <div className="inline-flex gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                void handlePreview(
                                  examId,
                                  record.studentRollNumber,
                                )
                              }
                            >
                              Preview
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              loading={printingKey === printKey}
                              onClick={() =>
                                void handlePrintDuplicate(
                                  examId,
                                  record.studentRollNumber,
                                )
                              }
                            >
                              Print
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Dialog
        open={Boolean(previewTicket)}
        onClose={() => setPreviewTicket(null)}
        title="Duplicate hall ticket preview"
        size="lg"
        footer={
          previewTicket ? (
            <Button
              type="button"
              onClick={() =>
                printA5HallTicket(previewTicket, {
                  collegeName: previewTicket.college || undefined,
                  copies: ['duplicate'],
                })
              }
            >
              Print duplicate
            </Button>
          ) : null
        }
      >
        {previewTicket ? (
          <div className="overflow-auto rounded-xl border border-[var(--border)] bg-slate-100 p-4">
            <div className="mx-auto w-[210mm] max-w-full">
              <HallTicketDocument ticket={previewTicket} />
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
    </PermissionGate>
  );
}
