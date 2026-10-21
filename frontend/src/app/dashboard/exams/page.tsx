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
import { getStoredUser } from '@/lib/auth';
import { can } from '@/lib/permissions';

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
  const user = getStoredUser();
  const canWrite = can(user, 'exams:write');
  const [regulations, setRegulations] = useState<Regulation[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [statusFilter, setStatusFilter] = useState<ExamStatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncingEvents, setSyncingEvents] = useState(false);
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
      setActionError('Failed to load external examinations.');
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

  // Scope filters: College, Course, Branch, Year, Semester
  const [selectedCollege, setSelectedCollege] = useState('all');
  const [selectedCourse, setSelectedCourse] = useState('all');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [selectedYear, setSelectedYear] = useState('all');
  const [selectedSemester, setSelectedSemester] = useState('all');

  useEffect(() => {
    if (!user?.isSuperAdmin && user?.collegeNames && user.collegeNames.length === 1) {
      setSelectedCollege(user.collegeNames[0]);
    }
  }, [user]);

  // Available options derived from exams and regulations
  const availableColleges = useMemo(() => {
    const set = new Set<string>();
    exams.forEach((e) => {
      if (e.college?.trim()) set.add(e.college.trim());
      e.scopes?.forEach((s) => {
        if (s.college?.trim()) set.add(s.college.trim());
      });
    });
    regulations.forEach((r) => {
      r.scopes?.forEach((s) => {
        if (s.collegeName?.trim()) set.add(s.collegeName.trim());
      });
    });
    let list = Array.from(set).sort();
    if (!user?.isSuperAdmin && Array.isArray(user?.collegeNames) && user.collegeNames.length > 0) {
      const allowed = new Set(user.collegeNames);
      list = list.filter((c) => allowed.has(c));
    }
    return list;
  }, [exams, regulations, user]);

  const availableCourses = useMemo(() => {
    const set = new Set<string>();
    const isTargetCollege = (c?: string | null) =>
      !selectedCollege ||
      selectedCollege === 'all' ||
      c?.trim().toLowerCase() === selectedCollege.trim().toLowerCase();

    exams.forEach((e) => {
      if (isTargetCollege(e.college)) {
        if (e.course?.trim()) set.add(e.course.trim());
      }
      e.scopes?.forEach((s) => {
        if (isTargetCollege(s.college)) {
          if (s.course?.trim()) set.add(s.course.trim());
        }
      });
    });

    regulations.forEach((r) => {
      r.scopes?.forEach((s) => {
        if (isTargetCollege(s.collegeName)) {
          if (s.courseName?.trim()) set.add(s.courseName.trim());
        }
      });
    });

    let list = Array.from(set).sort();
    if (!user?.isSuperAdmin && Array.isArray(user?.courseNames) && user.courseNames.length > 0) {
      const allowed = new Set(user.courseNames);
      list = list.filter((c) => allowed.has(c));
    }
    return list;
  }, [exams, regulations, selectedCollege, user]);

  const availableBranches = useMemo(() => {
    const set = new Set<string>();
    const isTargetCollege = (c?: string | null) =>
      !selectedCollege ||
      selectedCollege === 'all' ||
      c?.trim().toLowerCase() === selectedCollege.trim().toLowerCase();
    const isTargetCourse = (c?: string | null) =>
      !selectedCourse ||
      selectedCourse === 'all' ||
      c?.trim().toLowerCase() === selectedCourse.trim().toLowerCase();

    const addBranches = (raw?: string | null) => {
      if (!raw) return;
      raw
        .split(',')
        .map((b) => b.trim())
        .filter(Boolean)
        .forEach((b) => set.add(b));
    };

    exams.forEach((e) => {
      const matchCollege = isTargetCollege(e.college);
      const matchCourse = isTargetCourse(e.course);
      if (matchCollege && matchCourse) {
        addBranches(e.branch);
      }
      e.scopes?.forEach((s) => {
        const scCollegeMatch = isTargetCollege(s.college || e.college);
        const scCourseMatch = isTargetCourse(s.course || e.course);
        if (scCollegeMatch && scCourseMatch) {
          addBranches(s.branch);
        }
      });
    });

    let list = Array.from(set).sort();
    if (!user?.isSuperAdmin && Array.isArray(user?.branchNames) && user.branchNames.length > 0) {
      const allowed = new Set(user.branchNames);
      list = list.filter((b) => allowed.has(b));
    }
    return list;
  }, [exams, selectedCollege, selectedCourse, user]);

  // Keep branch and course in sync if available options change
  useEffect(() => {
    if (selectedCourse !== 'all' && !availableCourses.includes(selectedCourse)) {
      setSelectedCourse('all');
    }
  }, [availableCourses, selectedCourse]);

  useEffect(() => {
    if (selectedBranch !== 'all' && !availableBranches.includes(selectedBranch)) {
      setSelectedBranch('all');
    }
  }, [availableBranches, selectedBranch]);

  const availableYears = useMemo(() => {
    const set = new Set<number>();
    exams.forEach((e) => {
      if (e.yearOfStudy) set.add(Number(e.yearOfStudy));
      e.scopes?.forEach((s) => {
        if (s.yearOfStudy) set.add(Number(s.yearOfStudy));
      });
    });
    if (set.size === 0) {
      return [1, 2, 3, 4];
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [exams]);

  const availableSemesters = useMemo(() => {
    const set = new Set<number>();
    exams.forEach((e) => {
      if (e.semester) set.add(Number(e.semester));
      e.scopes?.forEach((s) => {
        if (s.semester) set.add(Number(s.semester));
      });
    });
    if (set.size === 0) {
      return [1, 2];
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [exams]);

  const filteredExams = useMemo(() => {
    return exams.filter((exam) => {
      // 1. College filter
      if (selectedCollege && selectedCollege !== 'all') {
        const target = selectedCollege.trim().toLowerCase();
        const examCol = exam.college?.trim().toLowerCase();
        const scCols =
          exam.scopes
            ?.map((s) => s.college?.trim().toLowerCase())
            .filter(Boolean) || [];
        if (examCol !== target && !scCols.includes(target)) {
          return false;
        }
      }

      // 2. Course filter
      if (selectedCourse && selectedCourse !== 'all') {
        const target = selectedCourse.trim().toLowerCase();
        const examCourse = exam.course?.trim().toLowerCase();
        const scCourses =
          exam.scopes
            ?.map((s) => s.course?.trim().toLowerCase())
            .filter(Boolean) || [];
        if (examCourse !== target && !scCourses.includes(target)) {
          return false;
        }
      }

      // 3. Branch filter
      if (selectedBranch && selectedBranch !== 'all') {
        const target = selectedBranch.trim().toLowerCase();
        const rootBranches = (exam.branch || '')
          .split(',')
          .map((b) => b.trim().toLowerCase())
          .filter(Boolean);
        const scBranches =
          exam.scopes?.flatMap((s) =>
            (s.branch || '')
              .split(',')
              .map((b) => b.trim().toLowerCase())
              .filter(Boolean),
          ) || [];
        const allExamBranches = [...rootBranches, ...scBranches];
        if (!allExamBranches.includes(target)) {
          return false;
        }
      }

      // 4. Year filter
      if (selectedYear && selectedYear !== 'all') {
        const target = String(selectedYear);
        const examYear = String(exam.yearOfStudy);
        const scYears = exam.scopes?.map((s) => String(s.yearOfStudy)) || [];
        if (examYear !== target && !scYears.includes(target)) {
          return false;
        }
      }

      // 5. Semester filter
      if (selectedSemester && selectedSemester !== 'all') {
        const target = String(selectedSemester);
        const examSem = String(exam.semester);
        const scSems = exam.scopes?.map((s) => String(s.semester)) || [];
        if (examSem !== target && !scSems.includes(target)) {
          return false;
        }
      }

      return true;
    });
  }, [
    exams,
    selectedCollege,
    selectedCourse,
    selectedBranch,
    selectedYear,
    selectedSemester,
  ]);

  const hasActiveScopeFilters =
    selectedCollege !== 'all' ||
    selectedCourse !== 'all' ||
    selectedBranch !== 'all' ||
    selectedYear !== 'all' ||
    selectedSemester !== 'all';

  const handleResetFilters = () => {
    setSelectedCollege('all');
    setSelectedCourse('all');
    setSelectedBranch('all');
    setSelectedYear('all');
    setSelectedSemester('all');
  };

  const counts = useMemo(
    () => ({
      total: exams.length,
      filtered: filteredExams.length,
    }),
    [exams.length, filteredExams.length],
  );

  async function handleSyncCalendar() {
    setSyncingEvents(true);
    setActionError('');
    try {
      const res = await api.syncSdmsEvents();
      toast.push(
        `Calendar notifications updated for ${res.syncedExams ?? 0} published examination(s) (${res.totalCreated ?? 0} events synced).`,
        'success',
      );
      await loadExams();
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : 'Failed to update calendar notifications.',
      );
    } finally {
      setSyncingEvents(false);
    }
  }

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
        title="External Examinations"
        description="Create external examinations from mapped subjects, submit for approval, and publish for student enrollment."
        action={
          <div className="flex flex-wrap items-center gap-2.5">
            {statusFilter === 'published' && canWrite ? (
              <Button
                variant="secondary"
                onClick={() => void handleSyncCalendar()}
                disabled={syncingEvents}
              >
                <svg
                  className={`h-4 w-4 ${syncingEvents ? 'animate-spin' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                  />
                </svg>
                {syncingEvents ? 'Updating...' : 'Update calendar & notifications'}
              </Button>
            ) : null}
            {canWrite ? (
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
                New external examination
              </Button>
            ) : undefined}
          </div>
        }
      />

      <StatusFilterBar
        items={statusTabs}
        value={statusFilter}
        onChange={setStatusFilter}
      />

      {/* Academic Filters: College, Course, Branch, Year, Semester */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 text-[var(--primary)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
              />
            </svg>
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Academic Filters
            </span>
            {hasActiveScopeFilters && (
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-800">
                Filtered: {filteredExams.length} of {exams.length}
              </span>
            )}
          </div>

          {hasActiveScopeFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-xs font-medium text-slate-500 hover:text-rose-600 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <span>✕</span> Reset filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* 1. College */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
              College
            </label>
            <select
              value={selectedCollege}
              onChange={(e) => setSelectedCollege(e.target.value)}
              className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-800 focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] transition-all cursor-pointer truncate"
              title={selectedCollege !== 'all' ? selectedCollege : 'All Colleges'}
            >
              <option value="all">All Colleges</option>
              {availableColleges.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Course */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
              Course
            </label>
            <select
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
              className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-800 focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] transition-all cursor-pointer truncate"
              title={selectedCourse !== 'all' ? selectedCourse : 'All Courses'}
            >
              <option value="all">All Courses</option>
              {availableCourses.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Branch */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
              Branch
            </label>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-800 focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] transition-all cursor-pointer truncate"
              title={selectedBranch !== 'all' ? selectedBranch : 'All Branches'}
            >
              <option value="all">All Branches</option>
              {availableBranches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* 4. Year */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
              Year
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-800 focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] transition-all cursor-pointer"
            >
              <option value="all">All Years</option>
              {availableYears.map((y) => (
                <option key={y} value={String(y)}>
                  Year {y}
                </option>
              ))}
            </select>
          </div>

          {/* 5. Semester */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
              Semester
            </label>
            <select
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(e.target.value)}
              className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-800 focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] transition-all cursor-pointer"
            >
              <option value="all">All Semesters</option>
              {availableSemesters.map((s) => (
                <option key={s} value={String(s)}>
                  Sem {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {actionError && !rejectOpen && !publishOpen ? (
        <Alert tone="danger">{actionError}</Alert>
      ) : null}

      <Card>
        <CardHeader
          title={statusFilter === 'published' ? 'Published examinations' : 'Examinations'}
          description={
            hasActiveScopeFilters
              ? `${filteredExams.length} of ${exams.length} examination${exams.length !== 1 ? 's' : ''} (filtered)`
              : `${counts.total} examination${counts.total !== 1 ? 's' : ''}`
          }
          action={
            statusFilter === 'published' && canWrite ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleSyncCalendar()}
                disabled={syncingEvents}
              >
                <svg
                  className={`h-3.5 w-3.5 ${syncingEvents ? 'animate-spin' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                  />
                </svg>
                {syncingEvents ? 'Updating...' : 'Update calendar & notifications'}
              </Button>
            ) : undefined
          }
        />
        <CardBody className="!p-0">
          <ExamTable
            exams={filteredExams}
            regulations={regulations}
            loading={loading}
            user={user}
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
