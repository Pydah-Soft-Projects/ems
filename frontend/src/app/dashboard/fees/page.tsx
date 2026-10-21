'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock } from '@/components/ui/Spinner';
import { SoftSearchField, StatusFilter, KpiTile } from '@/components/ui/SoftSearch';
import { ApiError, api } from '@/lib/api';
import { FeeStatusBadge, money } from '@/components/fees/CollectPaymentModal';
import { ExamFeeRecord } from '@/types/fee';
import { EligibleExamStudent, Exam } from '@/types/exam';

type StatusTab = 'all' | 'pending' | 'paid';

type ListStudent = {
  id: number;
  name: string;
  rollNumber: string;
  admissionNumber: string | null;
  section: string | null;
  studentStatus: string | null;
  college: string | null;
  course: string | null;
  branch: string | null;
  batch: string | null;
  currentYear: number;
  currentSemester: number;
  feeStatus?: string;
};

const PAGE_SIZE = 25;

const statusTabs: { id: StatusTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'paid', label: 'Paid' },
];

const selectClass =
  'h-10 w-full rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)] disabled:cursor-not-allowed disabled:bg-[var(--surface-muted)] disabled:text-[var(--muted)]';

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

function fromEligible(s: EligibleExamStudent): ListStudent {
  return {
    id: s.id,
    name: s.name,
    rollNumber: s.rollNumber,
    admissionNumber: s.admissionNumber,
    section: s.section,
    studentStatus: s.studentStatus,
    college: s.college,
    course: s.course,
    branch: s.branch,
    batch: s.batch,
    currentYear: s.currentYear,
    currentSemester: s.currentSemester,
  };
}

export default function FeesPage() {
  const router = useRouter();

  const [exams, setExams] = useState<Exam[]>([]);
  const [loadingExams, setLoadingExams] = useState(true);
  const [examsError, setExamsError] = useState('');
  const [examId, setExamId] = useState('');
  const [collectionType, setCollectionType] = useState<'EXAM' | 'REVALUATION'>('EXAM');
  const [revaluationId, setRevaluationId] = useState('');
  const [revaluations, setRevaluations] = useState<Array<{ id: number; title: string; regulationCode: string; status: string }>>([]);
  const [revaluationStudents, setRevaluationStudents] = useState<ListStudent[]>([]);

  const [eligible, setEligible] = useState<EligibleExamStudent[]>([]);
  const [searchResults, setSearchResults] = useState<ListStudent[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchTotalPages, setSearchTotalPages] = useState(1);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentError, setStudentError] = useState('');

  const [branch, setBranch] = useState('');
  const [section, setSection] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  const [records, setRecords] = useState<ExamFeeRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [recordsError, setRecordsError] = useState('');
  const [statusTab, setStatusTab] = useState<StatusTab>('pending');

  const selectedExam = useMemo(
    () => exams.find((e) => String(e.id) === examId) ?? null,
    [exams, examId],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setLoadingExams(true);
    setExamsError('');
    api
      .getExams('published')
      .then((rows) => {
        setExams(
          [...rows].sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
          ),
        );
      })
      .catch((err) => {
        setExams([]);
        setExamsError(
          err instanceof ApiError ? err.message : 'Failed to load examinations.',
        );
      })
      .finally(() => setLoadingExams(false));
  }, []);

  useEffect(() => {
    if (exams.length === 1 && !examId) {
      setExamId(String(exams[0].id));
    }
  }, [exams, examId]);

  useEffect(() => {
    api.getRevaluationNotifications()
      .then((rows) => setRevaluations(rows.filter((row) => row.status === 'published')))
      .catch(() => setRevaluations([]));
  }, []);

  useEffect(() => {
    api.getRevaluationNotifications()
      .then((rows) => setRevaluations(rows.filter((row) => row.status === 'published')))
      .catch(() => setRevaluations([]));
  }, []);

  const loadEligible = useCallback(async () => {
    if (!examId) {
      setEligible([]);
      setLoadingStudents(false);
      return;
    }
    setLoadingStudents(true);
    setStudentError('');
    try {
      const res = await api.getExamEligibleStudents(parseInt(examId, 10));
      setEligible(res.students);
      setSearchResults([]);
      setSearchTotal(0);
      setSearchTotalPages(1);
    } catch (err) {
      setEligible([]);
      setStudentError(
        err instanceof ApiError
          ? err.message
          : 'Failed to load eligible students.',
      );
    } finally {
      setLoadingStudents(false);
    }
  }, [examId]);

  useEffect(() => {
    void loadEligible();
  }, [loadEligible]);

  const loadSearchStudents = useCallback(async () => {
    if (examId || !debouncedSearch) {
      if (!examId) {
        setSearchResults([]);
        setSearchTotal(0);
        setSearchTotalPages(1);
        setStudentError('');
        setLoadingStudents(false);
      }
      return;
    }
    setLoadingStudents(true);
    setStudentError('');
    try {
      const res = await api.getSdmsStudents({
        search: debouncedSearch,
        page,
        limit: PAGE_SIZE,
      });
      setSearchResults(
        res.items
          .map((s) => {
            const roll = (s.pinNo || s.admissionNumber || '').trim();
            if (!roll) return null;
            return {
              id: s.id,
              name: s.studentName,
              rollNumber: roll,
              admissionNumber: s.admissionNumber,
              section: s.section,
              studentStatus: s.studentStatus,
              college: s.college,
              course: s.course,
              branch: s.branch,
              batch: s.batch,
              currentYear: s.currentYear,
              currentSemester: s.currentSemester,
            } satisfies ListStudent;
          })
          .filter((s): s is ListStudent => s !== null),
      );
      setSearchTotal(res.total);
      setSearchTotalPages(Math.max(1, res.totalPages || 1));
    } catch (err) {
      setSearchResults([]);
      setSearchTotal(0);
      setSearchTotalPages(1);
      setStudentError(
        err instanceof ApiError ? err.message : 'Student search failed.',
      );
    } finally {
      setLoadingStudents(false);
    }
  }, [examId, debouncedSearch, page]);

  useEffect(() => {
    void loadSearchStudents();
  }, [loadSearchStudents]);

  const loadRecords = useCallback(async () => {
    setLoadingRecords(true);
    setRecordsError('');
    try {
      setRecords(
        await api.getFeeRecords(collectionType === 'REVALUATION'
          ? { feeType: 'REVALUATION', revaluationNotificationId: revaluationId ? Number(revaluationId) : undefined }
          : examId ? { examId: parseInt(examId, 10), feeType: 'EXAM' } : { feeType: 'EXAM' }),
      );
    } catch (err) {
      setRecords([]);
      setRecordsError(
        err instanceof ApiError ? err.message : 'Failed to load fee records.',
      );
    } finally {
      setLoadingRecords(false);
    }
  }, [examId, collectionType, revaluationId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (collectionType !== 'REVALUATION' || !revaluationId) {
      setRevaluationStudents([]);
      return;
    }
    api.getRevaluationStudents(Number(revaluationId))
      .then((rows) => setRevaluationStudents(rows.map((row) => ({ id: row.id, name: row.name, rollNumber: row.rollNumber, admissionNumber: row.admissionNumber, section: row.section, studentStatus: row.studentStatus, feeStatus: row.feeStatus, college: row.college, course: row.course, branch: row.branch, batch: row.batch, currentYear: row.currentYear, currentSemester: row.currentSemester }))))
      .catch(() => setRevaluationStudents([]));
  }, [collectionType, revaluationId]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const scopedBranches = useMemo(() => {
    const fromScopes = selectedExam ? (selectedExam.scopes ?? [])
      .map((s) => s.branch)
      .filter(Boolean) : [];
    const fromStudents = (collectionType === 'REVALUATION' ? revaluationStudents : eligible)
      .map((s) => s.branch)
      .filter((b): b is string => Boolean(b));
    const set = new Set<string>([
      ...fromScopes,
      ...fromStudents,
      ...(selectedExam?.branch ? [selectedExam.branch] : []),
    ]);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [selectedExam, eligible, collectionType, revaluationStudents]);

  const scopedSections = useMemo(() => {
    const fromScopes = selectedExam ? (selectedExam.scopes ?? [])
      .filter((s) => !branch || s.branch === branch)
      .map((s) => s.section)
      .filter((s): s is string => Boolean(s)) : [];
    const fromStudents = (collectionType === 'REVALUATION' ? revaluationStudents : eligible)
      .filter((s) => !branch || s.branch === branch)
      .map((s) => s.section)
      .filter((s): s is string => Boolean(s));
    return [...new Set([...fromScopes, ...fromStudents])].sort((a, b) =>
      a.localeCompare(b),
    );
  }, [selectedExam, eligible, branch, collectionType, revaluationStudents]);

  const filteredEligible = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    return eligible
      .filter((s) => {
        if (branch && (s.branch || '') !== branch) return false;
        if (section && (s.section || '') !== section) return false;
        if (!q) return true;
        const hay = [s.name, s.rollNumber, s.admissionNumber || '']
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
      .map(fromEligible);
  }, [eligible, branch, section, debouncedSearch]);

  const examMode = Boolean(examId);
  const searchingFreely = !examMode && Boolean(debouncedSearch);
  const filteredRevaluationStudents = revaluationStudents.filter((student) => {
    if (branch && student.branch !== branch) return false;
    if (section && student.section !== section) return false;
    const query = debouncedSearch.toLowerCase();
    return !query || [student.name, student.rollNumber, student.admissionNumber || ''].join(' ').toLowerCase().includes(query);
  });

  const total = collectionType === 'REVALUATION'
    ? filteredRevaluationStudents.length
    : examMode
    ? filteredEligible.length
    : searchingFreely
      ? searchTotal
      : 0;
  const totalPages = collectionType === 'REVALUATION'
    ? Math.max(1, Math.ceil(total / PAGE_SIZE))
    : examMode
    ? Math.max(1, Math.ceil(total / PAGE_SIZE))
    : searchingFreely
      ? searchTotalPages
      : 1;
  const safePage = Math.min(page, totalPages);
  const pageStudents = collectionType === 'REVALUATION'
    ? filteredRevaluationStudents.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
    : examMode
    ? filteredEligible.slice(
        (safePage - 1) * PAGE_SIZE,
        safePage * PAGE_SIZE,
      )
    : searchingFreely
      ? searchResults
      : [];

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const visibleRecords = useMemo(
    () =>
      statusTab === 'all'
        ? records
        : records.filter((record) => record.status === statusTab),
    [records, statusTab],
  );

  const summary = useMemo(() => {
    const pending = records.filter((record) => record.status === 'pending');
    const paid = records.filter((record) => record.status === 'paid');
    return {
      pendingCount: pending.length,
      pendingAmount: pending.reduce(
        (sum, record) => sum + Number(record.totalAmount || 0),
        0,
      ),
      paidCount: paid.length,
      paidAmount: paid.reduce(
        (sum, record) => sum + Number(record.totalAmount || 0),
        0,
      ),
    };
  }, [records]);

  const hasScopedFilters = Boolean(branch || section || search.trim());

  function openCollect(roll: string) {
    if (!roll) return;
    router.push(`/dashboard/fees/collect/${encodeURIComponent(roll)}`);
  }

  function onExamChange(nextId: string) {
    setExamId(nextId);
    setBranch('');
    setSection('');
    setPage(1);
    if (!nextId) {
      setEligible([]);
    } else {
      setSearchResults([]);
      setSearchTotal(0);
      setSearchTotalPages(1);
    }
  }

  function clearScopedFilters() {
    setBranch('');
    setSection('');
    setSearch('');
    setDebouncedSearch('');
    setPage(1);
  }

  const rangeStart = total === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, total);

  const examScopeSummary = selectedExam
    ? [
        selectedExam.college,
        selectedExam.course,
        selectedExam.batch ? `Batch ${selectedExam.batch}` : null,
        `Year ${selectedExam.yearOfStudy} · Sem ${selectedExam.semester}`,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  const showStudentList = collectionType === 'REVALUATION' || examMode || searchingFreely;
  const listNoun = collectionType === 'REVALUATION' ? 'revaluation student' : examMode ? 'eligible student' : 'student';

  return (
    <div className="space-y-8">
      <PageHeader
        title="Fees & Payments"
        description="Select an examination for eligible students, or search anytime by name, PIN, or admission number — then select who to collect from."
      />

      <Card className="overflow-hidden">
        <CardBody className="space-y-5">
          <div>
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--primary)]">
              Fee collection
            </p>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900">
              Students
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
              Examination loads eligible students (branch/section stay in that
              exam&apos;s scope). Search works with or without an exam selected.
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-600">Fee type</span>
              <select value={collectionType} onChange={(e) => { setCollectionType(e.target.value as 'EXAM' | 'REVALUATION'); setExamId(''); setRevaluationId(''); setEligible([]); setPage(1); }} className={selectClass}>
                <option value="EXAM">Examination</option>
                <option value="REVALUATION">Revaluation</option>
              </select>
            </label>
            <label className="block space-y-1.5 lg:col-span-1">
              <span className="text-xs font-medium text-slate-600">
                {collectionType === 'REVALUATION' ? 'Revaluation' : 'Examination'}
              </span>
              {collectionType === 'REVALUATION' ? <select value={revaluationId} onChange={(e) => setRevaluationId(e.target.value)} className={selectClass}>
                <option value="">All revaluations</option>
                {revaluations.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.regulationCode}</option>)}
              </select> : <select
                value={examId}
                onChange={(e) => onExamChange(e.target.value)}
                className={selectClass}
                disabled={loadingExams}
              >
                <option value="">
                  {loadingExams
                    ? 'Loading examinations…'
                    : 'All — search by name / PIN'}
                </option>
                {exams.map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {examLabel(exam)}
                  </option>
                ))}
              </select>}
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-600">Branch</span>
              <select
                value={branch}
                onChange={(e) => {
                  setBranch(e.target.value);
                  setSection('');
                  setPage(1);
                }}
                className={selectClass}
                disabled={!selectedExam || scopedBranches.length === 0}
              >
                <option value="">All branches in exam</option>
                {scopedBranches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-600">Section</span>
              <select
                value={section}
                onChange={(e) => {
                  setSection(e.target.value);
                  setPage(1);
                }}
                className={selectClass}
                disabled={!selectedExam || scopedSections.length === 0}
              >
                <option value="">All sections</option>
                {scopedSections.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-600">Search</span>
              <SoftSearchField
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Name, PIN, roll, or admission…"
                aria-label="Search students by name, PIN, roll, or admission number"
                autoComplete="off"
              />
            </label>
          </div>

          {selectedExam && examScopeSummary ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3">
              <div>
                <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Exam scope
                </p>
                <p className="mt-0.5 text-sm font-medium text-slate-800">
                  {examScopeSummary}
                </p>
                {scopedBranches.length > 1 ? (
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {scopedBranches.length} branches in this examination
                  </p>
                ) : null}
              </div>
              {hasScopedFilters ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearScopedFilters}
                >
                  Clear filters
                </Button>
              ) : null}
            </div>
          ) : search.trim() && !examMode ? (
            <div className="flex flex-wrap items-center justify-end gap-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearScopedFilters}
              >
                Clear search
              </Button>
            </div>
          ) : null}

          {examsError ? <Alert tone="danger">{examsError}</Alert> : null}
          {studentError ? <Alert tone="danger">{studentError}</Alert> : null}

          {!showStudentList ? (
            <EmptyState
              title="Find a student"
              description="Select a published examination to list eligible students, or search by name, PIN, roll, or admission number."
            />
          ) : loadingStudents ? (
            <LoadingBlock
              label={
                examMode
                  ? 'Loading eligible students…'
                  : 'Searching students…'
              }
            />
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
                <p className="text-xs text-[var(--muted)]">
                  {total === 0
                    ? examMode
                      ? 'No eligible students match these filters'
                      : 'No students matched that search'
                    : `Showing ${rangeStart}–${rangeEnd} of ${total} ${listNoun}${total !== 1 ? 's' : ''}`}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <span className="min-w-[4.5rem] text-center text-xs font-medium tabular-nums text-slate-600">
                    {safePage} / {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>

              {pageStudents.length === 0 ? (
                <EmptyState
                  title={examMode ? 'No eligible students' : 'No students found'}
                  description={
                    examMode
                      ? hasScopedFilters
                        ? 'Try another branch, section, or search within this examination.'
                        : 'No students are eligible for this examination yet.'
                      : 'Try a different name, PIN, roll, or admission number.'
                  }
                />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                  <table className="w-full min-w-[880px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-slate-50/90 text-[0.6875rem] uppercase tracking-wide text-[var(--muted)]">
                        <th className="px-4 py-3 font-semibold">Student</th>
                        <th className="px-4 py-3 font-semibold">PIN / Adm.</th>
                        <th className="px-4 py-3 font-semibold">Programme</th>
                        <th className="px-4 py-3 font-semibold">Batch</th>
                        <th className="px-4 py-3 font-semibold">Year / Sem</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 text-right font-semibold">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageStudents.map((s) => (
                        <tr
                          key={s.id}
                          className="cursor-pointer border-t border-[var(--border)] transition hover:bg-[var(--primary-soft)]/50"
                          onClick={() => openCollect(s.rollNumber)}
                        >
                          <td className="px-4 py-3.5">
                            <p className="font-semibold tracking-tight text-slate-900">
                              {s.name}
                            </p>
                            {s.section ? (
                              <p className="mt-0.5 text-xs text-[var(--muted)]">
                                Section {s.section}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3.5 font-mono text-xs tabular-nums">
                            <span className="font-medium text-slate-800">
                              {s.rollNumber || '—'}
                            </span>
                            {s.admissionNumber ? (
                              <span className="mt-0.5 block text-[var(--muted)]">
                                {s.admissionNumber}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-3.5">
                            <p className="text-sm text-slate-800">
                              {s.course || selectedExam?.course || '—'}
                              {s.branch ? ` · ${s.branch}` : ''}
                            </p>
                            {s.college || selectedExam?.college ? (
                              <p className="mt-0.5 text-xs text-[var(--muted)]">
                                {s.college || selectedExam?.college}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3.5 text-sm text-slate-700">
                            {s.batch || selectedExam?.batch || '—'}
                          </td>
                          <td className="px-4 py-3.5 tabular-nums text-sm text-slate-700">
                            Y{s.currentYear} / S{s.currentSemester}
                          </td>
                          <td className="px-4 py-3.5 text-xs text-slate-600">
                            {collectionType === 'REVALUATION'
                              ? s.feeStatus === 'paid'
                                ? 'Paid'
                                : s.feeStatus === 'pending'
                                  ? 'Pending'
                                  : 'Not applied'
                              : s.studentStatus || '—'}
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <Button
                              type="button"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                openCollect(s.rollNumber);
                              }}
                            >
                              Select
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>

      <section className="grid gap-4 sm:grid-cols-2">
        <KpiTile
          label="Outstanding"
          value={money(summary.pendingAmount)}
          hint={`${summary.pendingCount} record${summary.pendingCount !== 1 ? 's' : ''}${examId ? ' for this exam' : ''}`}
          tone="warning"
        />
        <KpiTile
          label="Collected"
          value={money(summary.paidAmount)}
          hint={`${summary.paidCount} record${summary.paidCount !== 1 ? 's' : ''}${examId ? ' for this exam' : ''}`}
          tone="success"
        />
      </section>

      <Card>
        <CardHeader
          title="Payment ledger"
          description={
            loadingRecords
              ? 'Loading…'
              : `${visibleRecords.length} ${statusTab === 'all' ? '' : `${statusTab} `}record${visibleRecords.length !== 1 ? 's' : ''}${selectedExam ? ` · ${selectedExam.name}` : ''}`
          }
          action={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <StatusFilter
                items={statusTabs}
                value={statusTab}
                onChange={setStatusTab}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void loadRecords()}
                disabled={loadingRecords}
              >
                Refresh
              </Button>
            </div>
          }
        />
        <CardBody className="space-y-4 !pt-0">
          {recordsError ? <Alert tone="danger">{recordsError}</Alert> : null}

          {loadingRecords ? (
            <LoadingBlock label="Loading fee records…" />
          ) : visibleRecords.length === 0 ? (
            <EmptyState
              title={
                records.length === 0
                  ? examId
                    ? 'No payment activity for this exam'
                    : 'No payment activity yet'
                  : `No ${statusTab} fee records`
              }
              description={
                records.length === 0
                  ? 'Fee records appear when students apply for the examination. Select an eligible student above to collect at the desk.'
                  : `There are currently no fee records with ${statusTab} status.`
              }
            />
          ) : (
            <div className="-mx-6 overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-sm">
                <thead>
                  <tr className="text-[0.6875rem] uppercase tracking-wide text-[var(--muted)]">
                    <th className="px-6 py-3 font-semibold">Student</th>
                    <th className="px-4 py-3 font-semibold">Examination</th>
                    <th className="px-4 py-3 font-semibold">Base</th>
                    <th className="px-4 py-3 font-semibold">Late</th>
                    <th className="px-4 py-3 font-semibold">Total</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-6 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRecords.map((record) => (
                    <tr
                      key={record.id}
                      className="cursor-pointer border-t border-[var(--border)] transition hover:bg-[var(--primary-soft)]/50"
                      onClick={() => openCollect(record.studentRollNumber)}
                    >
                      <td className="px-6 py-4 align-top">
                        <p className="font-semibold tracking-tight text-slate-900">
                          {record.studentName}
                        </p>
                        <p className="mt-0.5 font-mono text-xs tabular-nums text-[var(--muted)]">
                          {record.studentRollNumber}
                        </p>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <p className="font-medium text-slate-900">
                          {record.exam?.name ?? `Exam #${record.examId}`}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--muted)]">
                          {record.exam
                            ? `${record.exam.college ? `${record.exam.college} · ` : ''}${record.exam.course} / ${record.exam.branch}`
                            : '—'}
                        </p>
                      </td>
                      <td className="px-4 py-4 align-top tabular-nums">
                        {money(record.baseFee)}
                      </td>
                      <td className="px-4 py-4 align-top tabular-nums">
                        {money(record.lateFee)}
                      </td>
                      <td className="px-4 py-4 align-top font-semibold tabular-nums">
                        {money(record.totalAmount)}
                      </td>
                      <td className="px-4 py-4 align-top">
                        <FeeStatusBadge status={record.status} />
                      </td>
                      <td className="px-6 py-4 align-top text-right">
                        <Button
                          type="button"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            openCollect(record.studentRollNumber);
                          }}
                        >
                          Collect
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
