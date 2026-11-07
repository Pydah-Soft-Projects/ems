/* eslint-disable react-hooks/set-state-in-effect */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Exam } from '@/types/exam';
import { Regulation } from '@/types/regulation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { LoadingBlock } from '@/components/ui/Spinner';
import { StatusFilter as StatusFilterBar } from '@/components/ui/SoftSearch';
import { Pagination } from '@/components/ui/Pagination';
import { ExamDatesEditor } from '@/components/exams/ExamDatesEditor';
import { getStoredUser } from '@/lib/auth';
import { can } from '@/lib/permissions';

type DatesFilter = 'all' | 'scheduled' | 'pending';

const filterTabs: { id: DatesFilter; label: string }[] = [
  { id: 'all', label: 'All notifications' },
  { id: 'scheduled', label: 'Dates scheduled' },
  { id: 'pending', label: 'Dates pending' },
];

function fmtDate(value: string | null | undefined) {
  if (!value) return '—';
  try {
    const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, y, m, d] = match;
      const dt = new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0);
      return dt.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    }
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return String(value);
  }
}

export default function ExamDatesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = getStoredUser();
  const canEdit = can(user, 'exams:edit') || can(user, 'exams:write');

  const [exams, setExams] = useState<Exam[]>([]);
  const [regulations, setRegulations] = useState<Regulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<DatesFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Academic filters
  const [selectedCollege, setSelectedCollege] = useState('all');
  const [selectedCourse, setSelectedCourse] = useState('all');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [selectedYear, setSelectedYear] = useState('all');
  const [selectedSemester, setSelectedSemester] = useState('all');

  // Currently editing exam (inline page mode)
  const [editingExam, setEditingExam] = useState<Exam | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [examData, regData] = await Promise.all([
        api.getExams(),
        api.getRegulations().catch(() => [] as Regulation[]),
      ]);
      setExams(examData);
      setRegulations(regData);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to load examinations.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Open inline editor if examId query param is passed
  const queryExamId = searchParams.get('examId');
  useEffect(() => {
    if (!queryExamId || exams.length === 0) return;
    const target = exams.find((e) => e.id === Number(queryExamId));
    if (target) {
      setEditingExam(target);
    }
  }, [queryExamId, exams]);

  // Scope filter options
  const availableColleges = useMemo(() => {
    const set = new Set<string>();
    exams.forEach((e) => {
      if (e.college?.trim()) set.add(e.college.trim());
      e.scopes?.forEach((s) => {
        if (s.college?.trim()) set.add(s.college.trim());
      });
    });
    return Array.from(set).sort();
  }, [exams]);

  const availableCourses = useMemo(() => {
    const set = new Set<string>();
    exams.forEach((e) => {
      if (e.course?.trim()) set.add(e.course.trim());
      e.scopes?.forEach((s) => {
        if (s.course?.trim()) set.add(s.course.trim());
      });
    });
    return Array.from(set).sort();
  }, [exams]);

  const availableBranches = useMemo(() => {
    const set = new Set<string>();
    exams.forEach((e) => {
      (e.branch || '').split(',').map((b) => b.trim()).filter(Boolean).forEach((b) => set.add(b));
      e.scopes?.forEach((s) => {
        (s.branch || '').split(',').map((b) => b.trim()).filter(Boolean).forEach((b) => set.add(b));
      });
    });
    return Array.from(set).sort();
  }, [exams]);

  const filteredExams = useMemo(() => {
    return exams.filter((exam) => {
      const totalSubjects = exam.examSubjects?.length ?? 0;
      const scheduledCount = (exam.examSubjects ?? []).filter((s) => !!s.examDate).length;
      const isFullyScheduled = totalSubjects > 0 && scheduledCount === totalSubjects;

      if (filter === 'scheduled' && !isFullyScheduled) return false;
      if (filter === 'pending' && isFullyScheduled) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchName = exam.name.toLowerCase().includes(q);
        const matchBranch = (exam.branch || '').toLowerCase().includes(q);
        const matchCourse = (exam.course || '').toLowerCase().includes(q);
        const matchSubject = (exam.examSubjects || []).some(
          (s) =>
            s.subject?.code.toLowerCase().includes(q) ||
            s.subject?.name.toLowerCase().includes(q),
        );
        if (!matchName && !matchBranch && !matchCourse && !matchSubject) return false;
      }

      if (selectedCollege !== 'all') {
        const target = selectedCollege.trim().toLowerCase();
        const examCol = exam.college?.trim().toLowerCase();
        const scCols = exam.scopes?.map((s) => s.college?.trim().toLowerCase()) || [];
        if (examCol !== target && !scCols.includes(target)) return false;
      }

      if (selectedCourse !== 'all') {
        const target = selectedCourse.trim().toLowerCase();
        const examCourse = exam.course?.trim().toLowerCase();
        const scCourses = exam.scopes?.map((s) => s.course?.trim().toLowerCase()) || [];
        if (examCourse !== target && !scCourses.includes(target)) return false;
      }

      if (selectedBranch !== 'all') {
        const target = selectedBranch.trim().toLowerCase();
        const rootBranches = (exam.branch || '').split(',').map((b) => b.trim().toLowerCase());
        const scBranches = exam.scopes?.flatMap((s) => (s.branch || '').split(',').map((b) => b.trim().toLowerCase())) || [];
        if (![...rootBranches, ...scBranches].includes(target)) return false;
      }

      if (selectedYear !== 'all') {
        const target = String(selectedYear);
        const examYear = String(exam.yearOfStudy);
        const scYears = exam.scopes?.map((s) => String(s.yearOfStudy)) || [];
        if (examYear !== target && !scYears.includes(target)) return false;
      }

      if (selectedSemester !== 'all') {
        const target = String(selectedSemester);
        const examSem = String(exam.semester);
        const scSems = exam.scopes?.map((s) => String(s.semester)) || [];
        if (examSem !== target && !scSems.includes(target)) return false;
      }

      return true;
    });
  }, [
    exams,
    filter,
    searchQuery,
    selectedCollege,
    selectedCourse,
    selectedBranch,
    selectedYear,
    selectedSemester,
  ]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [
    filter,
    searchQuery,
    selectedCollege,
    selectedCourse,
    selectedBranch,
    selectedYear,
    selectedSemester,
  ]);

  const paginatedExams = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredExams.slice(start, start + pageSize);
  }, [filteredExams, currentPage, pageSize]);

  const metrics = useMemo(() => {
    let total = exams.length;
    let scheduled = 0;
    let pending = 0;

    for (const exam of exams) {
      const totalSubs = exam.examSubjects?.length ?? 0;
      const sched = (exam.examSubjects ?? []).filter((s) => !!s.examDate).length;
      if (totalSubs > 0 && sched === totalSubs) {
        scheduled += 1;
      } else {
        pending += 1;
      }
    }
    return { total, scheduled, pending };
  }, [exams]);

  // If editing an exam, render the full inline page editor!
  if (editingExam) {
    return (
      <ExamDatesEditor
        exam={editingExam}
        onSave={async () => {
          await loadData();
          setEditingExam(null);
          router.push('/dashboard/exam-dates');
        }}
        onCancel={() => {
          setEditingExam(null);
          router.push('/dashboard/exam-dates');
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="External Exam Dates Notifications"
        description="Schedule and manage subject timetables, examination windows, and sessions for external fee notifications."
        action={
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="secondary"
              onClick={() => router.push('/dashboard/exams')}
            >
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
                  d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z"
                />
              </svg>
              External Fee Notifications
            </Button>
          </div>
        }
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {/* Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Total Fee Notifications
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{metrics.total}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
            Timetables Scheduled
          </p>
          <p className="mt-2 text-2xl font-bold text-emerald-900">
            {metrics.scheduled}
          </p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
            Dates Pending
          </p>
          <p className="mt-2 text-2xl font-bold text-amber-900">{metrics.pending}</p>
        </div>
      </div>

      <StatusFilterBar
        items={filterTabs}
        value={filter}
        onChange={setFilter}
      />

      {/* Scope Filter Controls */}
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
                d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z"
              />
            </svg>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Filter by Scope
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search exam or subject code..."
              className="w-64 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-[var(--primary)]"
            />
            {(selectedCollege !== 'all' ||
              selectedCourse !== 'all' ||
              selectedBranch !== 'all' ||
              selectedYear !== 'all' ||
              selectedSemester !== 'all' ||
              searchQuery) && (
              <Button
                variant="ghost"
                className="!px-2 !py-1 text-xs text-slate-500"
                onClick={() => {
                  setSelectedCollege('all');
                  setSelectedCourse('all');
                  setSelectedBranch('all');
                  setSelectedYear('all');
                  setSelectedSemester('all');
                  setSearchQuery('');
                }}
              >
                Reset filters
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              College
            </label>
            <select
              value={selectedCollege}
              onChange={(e) => setSelectedCollege(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-[var(--primary)]"
            >
              <option value="all">All Colleges</option>
              {availableColleges.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Course
            </label>
            <select
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-[var(--primary)]"
            >
              <option value="all">All Courses</option>
              {availableCourses.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Branch
            </label>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-[var(--primary)]"
            >
              <option value="all">All Branches</option>
              {availableBranches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Year
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-[var(--primary)]"
            >
              <option value="all">All Years</option>
              {[1, 2, 3, 4].map((y) => (
                <option key={y} value={y}>
                  Year {y}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Semester
            </label>
            <select
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-[var(--primary)]"
            >
              <option value="all">All Semesters</option>
              {[1, 2].map((s) => (
                <option key={s} value={s}>
                  Semester {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <Card>
        <CardHeader
          title="Dates Notifications List"
          description={`Showing ${filteredExams.length} of ${exams.length} external examination notification(s)`}
          action={
            !loading && filteredExams.length > 0 ? (
              <Pagination
                currentPage={currentPage}
                totalItems={filteredExams.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
              />
            ) : undefined
          }
        />
        <CardBody className="!p-0">
          {loading ? (
            <div className="py-16 text-center">
              <LoadingBlock />
            </div>
          ) : filteredExams.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm font-medium text-slate-900">
                No external examinations matching your filters
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Create an external fee notification first, then schedule dates here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-slate-50/80">
                    <th className="px-5 py-3.5 font-semibold text-slate-600">
                      Fee Notification Name
                    </th>
                    <th className="px-5 py-3.5 font-semibold text-slate-600">
                      Scope
                    </th>
                    <th className="px-5 py-3.5 font-semibold text-slate-600">
                      Examination Window
                    </th>
                    <th className="px-5 py-3.5 font-semibold text-slate-600">
                      Timetable Status
                    </th>
                    <th className="px-5 py-3.5 font-semibold text-slate-600">
                      Fee Status
                    </th>
                    <th className="px-5 py-3.5 text-right font-semibold text-slate-600">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {paginatedExams.map((exam) => {
                    const totalSubjects = exam.examSubjects?.length ?? 0;
                    const scheduledSubjects = (exam.examSubjects ?? []).filter(
                      (s) => !!s.examDate,
                    ).length;
                    const isFullyScheduled =
                      totalSubjects > 0 && scheduledSubjects === totalSubjects;

                    return (
                      <tr
                        key={exam.id}
                        className="transition hover:bg-slate-50/60"
                      >
                        <td className="px-5 py-4">
                          <p className="font-semibold text-slate-900">
                            {exam.name}
                          </p>
                          <p className="text-xs text-[var(--muted)]">
                            Reg: {regulations.find((r) => r.id === exam.regulationId)?.code ?? `#${exam.regulationId}`} ·{' '}
                            {(exam.allowedTypes ?? [exam.type])
                              .map((t) => t.replace(/_/g, ' '))
                              .join(' + ')}
                          </p>
                        </td>

                        <td className="px-5 py-4 text-slate-600">
                          <p className="font-medium text-slate-800">
                            {exam.college ? `${exam.college} · ` : ''}
                            {exam.course}
                          </p>
                          <p className="text-xs text-[var(--muted)]">
                            {exam.branch} · Batch {exam.batch} · Y{exam.yearOfStudy} S{exam.semester}
                          </p>
                        </td>

                        <td className="px-5 py-4 text-slate-700">
                          {exam.examinationStartDate && exam.examinationEndDate ? (
                            <div>
                              <p className="font-medium text-slate-900">
                                {fmtDate(exam.examinationStartDate)} → {fmtDate(exam.examinationEndDate)}
                              </p>
                              <p className="text-[11px] text-[var(--muted)]">
                                App: {fmtDate(exam.applicationStartDate)} → {fmtDate(exam.applicationEndDate)}
                              </p>
                            </div>
                          ) : (
                            <span className="inline-flex items-center text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md font-medium">
                              Dates Not Announced
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-4">
                          {isFullyScheduled ? (
                            <div>
                              <Badge variant="success">All {totalSubjects} Scheduled</Badge>
                            </div>
                          ) : scheduledSubjects > 0 ? (
                            <div>
                              <Badge variant="warning">
                                {scheduledSubjects} / {totalSubjects} Scheduled
                              </Badge>
                            </div>
                          ) : (
                            <div>
                              <Badge variant="default">0 / {totalSubjects} Scheduled</Badge>
                            </div>
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <Badge
                            variant={
                              exam.status === 'published'
                                ? 'success'
                                : exam.status === 'approved'
                                  ? 'success'
                                  : exam.status === 'pending_approval'
                                    ? 'warning'
                                    : exam.status === 'rejected'
                                      ? 'danger'
                                      : 'default'
                            }
                          >
                            {exam.status.replace(/_/g, ' ')}
                          </Badge>
                        </td>

                        <td className="px-5 py-4 text-right">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              className="!px-2.5 !py-1.5 text-xs"
                              onClick={() =>
                                router.push(`/dashboard/exams/${exam.id}?tab=subjects`)
                              }
                            >
                              View
                            </Button>
                            {canEdit ? (
                              <Button
                                variant="primary"
                                className="!px-3 !py-1.5 text-xs shadow-xs"
                                onClick={() => setEditingExam(exam)}
                              >
                                {scheduledSubjects > 0 ? 'Edit Dates' : 'Schedule Dates'}
                              </Button>
                            ) : null}
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
    </div>
  );
}
