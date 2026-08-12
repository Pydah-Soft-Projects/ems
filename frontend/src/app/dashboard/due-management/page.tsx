'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import type { Exam } from '@/types/exam';
import type { SdmsStudent } from '@/types/sdms';

const STORAGE_KEY = 'ems_due_management_overrides_v1';
const PAGE_SIZE = 50;
const selectClass =
  'h-10 w-full rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)] disabled:cursor-not-allowed disabled:bg-[var(--surface-muted)] disabled:text-[var(--muted)]';

function studentRowKey(student: SdmsStudent) {
  const uniqueId = student.id != null ? String(student.id) : null;
  const pin = String(student.pinNo || '').trim();
  const admission = String(student.admissionNumber || '').trim();
  const composite = [student.studentName, student.college, student.course, student.branch, student.batch, student.section, pin, admission]
    .filter(Boolean)
    .join('|');
  return uniqueId || composite || `fallback-${Math.random().toString(36).slice(2)}`;
}

function DueToggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-[0.6875rem] font-semibold transition ${
        checked
          ? 'border-amber-200 bg-amber-50 text-amber-700'
          : 'border-emerald-200 bg-emerald-50 text-emerald-700'
      }`}
    >
      <span
        className={`h-4 w-7 rounded-full p-0.5 transition ${
          checked ? 'bg-amber-400' : 'bg-emerald-400'
        }`}
      >
        <span
          className={`block h-3 w-3 rounded-full bg-white transition ${
            checked ? 'translate-x-3' : 'translate-x-0'
          }`}
        />
      </span>
      {checked ? 'Has due' : 'Clear'}
    </button>
  );
}

export default function DueManagementPage() {
  const [students, setStudents] = useState<SdmsStudent[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [studentError, setStudentError] = useState('');
  const [selectedExamId, setSelectedExamId] = useState('');
  const [collegeFilter, setCollegeFilter] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [search, setSearch] = useState('');
  const [dueStatusFilter, setDueStatusFilter] = useState<'all' | 'clear' | 'due'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [serverTotalPages, setServerTotalPages] = useState(1);
  const [serverTotal, setServerTotal] = useState(0);
  const [restrictionEnabled, setRestrictionEnabled] = useState(true);
  const [manualDueMap, setManualDueMap] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    if (Object.keys(manualDueMap).length) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(manualDueMap));
    }
  }, [manualDueMap]);

  useEffect(() => {
    let mounted = true;

    const loadSettings = async () => {
      try {
        const settings = await api.getPaymentSettings();
        if (!mounted) return;
        setRestrictionEnabled(settings.restrictExamApplyOnFeeDues !== false);
      } catch {
        if (!mounted) return;
        setRestrictionEnabled(true);
      }
    };

    void loadSettings();

    return () => {
      mounted = false;
    };
  }, []);

  const selectedExam = useMemo(
    () => exams.find((exam) => String(exam.id) === selectedExamId) ?? null,
    [exams, selectedExamId],
  );

  const studentRequestFilters = useMemo(() => {
    const examCollege = selectedExam?.college ?? undefined;
    const examCourse = selectedExam?.course ?? undefined;
    const examBranch = selectedExam?.branch ?? undefined;
    const examBatch = selectedExam?.batch ?? undefined;

    return {
      college: collegeFilter || examCollege || undefined,
      course: courseFilter || examCourse || undefined,
      branch: branchFilter || examBranch || undefined,
      batch: batchFilter || examBatch || undefined,
      currentYear: selectedExam?.yearOfStudy || undefined,
      currentSemester: selectedExam?.semester || undefined,
      section: sectionFilter || undefined,
      search: search || undefined,
      page: currentPage,
      limit: PAGE_SIZE,
    };
  }, [batchFilter, branchFilter, collegeFilter, courseFilter, currentPage, search, sectionFilter, selectedExam]);

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      setLoading(true);
      setStudentError('');

      try {
        const [examRows, studentRes] = await Promise.all([
          api.getExams('published'),
          api.getSdmsStudents(studentRequestFilters),
        ]);

        if (!mounted) return;
        setStudents(studentRes.items || []);
        setServerTotal(studentRes.total || 0);
        setServerTotalPages(Math.max(1, studentRes.totalPages || 1));
        setExams(examRows || []);
      } catch (error: unknown) {
        if (!mounted) return;
        setStudents([]);
        setServerTotal(0);
        setServerTotalPages(1);
        setExams([]);
        setStudentError(
          error instanceof Error ? error.message : 'Failed to load student due data.',
        );
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void loadData();

    return () => {
      mounted = false;
    };
  }, [studentRequestFilters]);

  const collegeOptions = useMemo(
    () => [...new Set(students.map((student) => student.college).filter(Boolean))].sort(),
    [students],
  );

  const courseOptions = useMemo(() => {
    const list = students
      .filter((student) => !collegeFilter || student.college === collegeFilter)
      .map((student) => student.course)
      .filter(Boolean);
    return [...new Set(list)].sort();
  }, [collegeFilter, students]);

  const branchOptions = useMemo(() => {
    const list = students
      .filter(
        (student) =>
          (!collegeFilter || student.college === collegeFilter) &&
          (!courseFilter || student.course === courseFilter),
      )
      .map((student) => student.branch)
      .filter(Boolean);
    return [...new Set(list)].sort();
  }, [collegeFilter, courseFilter, students]);

  const batchOptions = useMemo(() => {
    const list = students
      .filter(
        (student) =>
          (!collegeFilter || student.college === collegeFilter) &&
          (!courseFilter || student.course === courseFilter) &&
          (!branchFilter || student.branch === branchFilter),
      )
      .map((student) => student.batch)
      .filter(Boolean);
    return [...new Set(list)].sort();
  }, [branchFilter, collegeFilter, courseFilter, students]);

  const sectionOptions = useMemo(() => {
    const list = students
      .filter(
        (student) =>
          (!collegeFilter || student.college === collegeFilter) &&
          (!courseFilter || student.course === courseFilter) &&
          (!branchFilter || student.branch === branchFilter) &&
          (!batchFilter || student.batch === batchFilter),
      )
      .map((student) => student.section)
      .filter(Boolean);
    return [...new Set(list)].sort();
  }, [batchFilter, branchFilter, collegeFilter, courseFilter, students]);

  const filteredStudents = useMemo(() => students, [students]);

  const getEffectiveDueState = useCallback(
    (student: SdmsStudent) => {
      const key = studentRowKey(student);
      if (!restrictionEnabled) return false;
      if (Object.prototype.hasOwnProperty.call(manualDueMap, key)) {
        return Boolean(manualDueMap[key]);
      }
      return true;
    },
    [manualDueMap, restrictionEnabled],
  );

  const filteredByStatus = useMemo(() => {
    return filteredStudents.filter((student) => {
      const isDue = getEffectiveDueState(student);
      if (dueStatusFilter === 'due' && !isDue) return false;
      if (dueStatusFilter === 'clear' && isDue) return false;
      return true;
    });
  }, [dueStatusFilter, filteredStudents, getEffectiveDueState]);

  const totalPages = serverTotalPages;
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const paginatedStudents = filteredByStatus;

  const summary = useMemo(() => {
    const total = serverTotal || filteredByStatus.length;
    const dueCount = filteredByStatus.filter((student) => getEffectiveDueState(student)).length;
    const clearCount = total - dueCount;
    return { total, dueCount, clearCount };
  }, [filteredByStatus, getEffectiveDueState, serverTotal]);

  function toggleDue(student: SdmsStudent) {
    const key = studentRowKey(student);
    const nextValue = !getEffectiveDueState(student);
    setManualDueMap((prev) => ({
      ...prev,
      [key]: nextValue,
    }));
  }

  function clearFilters() {
    setSelectedExamId('');
    setCollegeFilter('');
    setCourseFilter('');
    setBranchFilter('');
    setBatchFilter('');
    setSectionFilter('');
    setSearch('');
    setDueStatusFilter('all');
    setCurrentPage(1);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Due Management"
        description="Review student fee dues, filter by exam and academic scope, and set whether a student is currently due-blocked for examination eligibility."
      />

      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white px-4 py-3 text-sm text-slate-700 shadow-[var(--shadow-sm)]">
        {restrictionEnabled ? (
          <span>
            <strong>Restriction is ON:</strong> all students default to <span className="font-semibold text-amber-700">due</span> unless explicitly marked clear.
          </span>
        ) : (
          <span>
            <strong>Restriction is OFF:</strong> due status is ignored and students are treated as eligible regardless of fee dues.
          </span>
        )}
      </div>

      <Card>
        <CardBody className="space-y-5">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_repeat(5,minmax(0,1fr))]">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-600">Examination</span>
              <select
                className={selectClass}
                value={selectedExamId}
                onChange={(event) => setSelectedExamId(event.target.value)}
                disabled={loading || exams.length === 0}
              >
                <option value="">All examinations</option>
                {exams.map((exam) => (
                  <option key={exam.id} value={String(exam.id)}>
                    {exam.name}
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
                  setSectionFilter('');
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
                  setSectionFilter('');
                }}
                disabled={!collegeOptions.length}
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
                  setSectionFilter('');
                }}
                disabled={!courseOptions.length}
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
                onChange={(event) => {
                  setBatchFilter(event.target.value);
                  setSectionFilter('');
                }}
                disabled={!branchOptions.length}
              >
                <option value="">All batches</option>
                {batchOptions.map((batch) => (
                  <option key={batch} value={batch}>
                    {batch}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-600">Section</span>
              <select
                className={selectClass}
                value={sectionFilter}
                onChange={(event) => setSectionFilter(event.target.value)}
                disabled={!batchOptions.length}
              >
                <option value="">All sections</option>
                {sectionOptions.map((section) => (
                  <option key={section} value={section}>
                    {section}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_auto]">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-600">Search</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className={selectClass}
                placeholder="Student name, PIN, admission, or branch"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-600">Due status</span>
              <select
                className={selectClass}
                value={dueStatusFilter}
                onChange={(event) => setDueStatusFilter(event.target.value as 'all' | 'clear' | 'due')}
              >
                <option value="all">All students</option>
                <option value="clear">Clear</option>
                <option value="due">Has due</option>
              </select>
            </label>

            <div className="flex items-end">
              <Button type="button" variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-sm)]">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--muted)]">Total shown</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{summary.total}</p>
        </div>
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-sm)]">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--muted)]">Eligible</p>
          <p className="mt-2 text-2xl font-bold text-emerald-600">{summary.clearCount}</p>
        </div>
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-sm)]">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--muted)]">Blocked</p>
          <p className="mt-2 text-2xl font-bold text-amber-600">{summary.dueCount}</p>
        </div>
      </div>

      <Card>
        <CardBody className="!p-0">
          {studentError ? (
            <div className="border-b border-[var(--border)] px-6 py-4 text-sm text-red-700">{studentError}</div>
          ) : null}

          {loading ? (
            <div className="flex min-h-[220px] items-center justify-center text-sm text-[var(--muted)]">
              Loading student due data…
            </div>
          ) : filteredByStatus.length === 0 ? (
            <div className="flex min-h-[220px] items-center justify-center px-6 text-center text-sm text-[var(--muted)]">
              No students match the selected filters.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 px-5 pt-4 pb-0 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-[var(--muted)]">
                  Showing {filteredByStatus.length === 0 ? 0 : startIndex + 1}–{Math.min(startIndex + PAGE_SIZE, filteredByStatus.length)} of {filteredByStatus.length} students
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={safePage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
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
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-slate-50 text-[0.6875rem] uppercase tracking-wide text-[var(--muted)]">
                    <th className="px-5 py-3 font-semibold">Student</th>
                    <th className="px-5 py-3 font-semibold">College / Course</th>
                    <th className="px-5 py-3 font-semibold">Branch / Batch</th>
                    <th className="px-5 py-3 font-semibold">Year / Sem</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Eligibility</th>
                    <th className="px-5 py-3 text-right font-semibold">Toggle</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedStudents.map((student) => {
                    const key = studentRowKey(student);
                    const hasDue = restrictionEnabled ? getEffectiveDueState(student) : false;

                    return (
                      <tr key={key} className="border-b border-[var(--border)] last:border-b-0">
                        <td className="px-5 py-4 align-top">
                          <p className="font-semibold text-slate-900">{student.studentName}</p>
                          <div className="mt-1 space-y-0.5 text-[0.6875rem] text-[var(--muted)]">
                            <p className="font-mono">PIN: {student.pinNo || '—'}</p>
                            <p className="font-mono">Adm: {student.admissionNumber || '—'}</p>
                            <p>Section: {student.section || '—'}</p>
                          </div>
                        </td>
                        <td className="px-5 py-4 align-top">
                          <p className="font-medium text-slate-800">{student.college || '—'}</p>
                          <p className="mt-1 text-[0.6875rem] text-[var(--muted)]">{student.course || '—'}</p>
                        </td>
                        <td className="px-5 py-4 align-top">
                          <p className="font-medium text-slate-800">{student.branch || '—'}</p>
                          <p className="mt-1 text-[0.6875rem] text-[var(--muted)]">{student.batch || '—'}</p>
                        </td>
                        <td className="px-5 py-4 align-top">
                          <p className="font-medium text-slate-800">
                            Y{student.currentYear || '—'} / S{student.currentSemester || '—'}
                          </p>
                        </td>
                        <td className="px-5 py-4 align-top">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold ${
                              hasDue
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {hasDue ? 'Due exists' : 'No due'}
                          </span>
                        </td>
                        <td className="px-5 py-4 align-top">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold ${
                              hasDue
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {hasDue ? 'Blocked' : 'Eligible'}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right align-top">
                          <DueToggle checked={hasDue} onChange={() => toggleDue(student)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
