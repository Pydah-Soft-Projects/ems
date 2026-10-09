'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import {
  ConsolidatedResultsResponse,
  ConsolidatedStudentItem,
  ExamGroupResult,
  MarksNotificationResponse,
} from '@/types/marks-upload';

import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';

export default function StudentResultsPage() {
  const [notifications, setNotifications] = useState<MarksNotificationResponse>({
    exams: [],
    revaluations: [],
  });

  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [selectedRegulation, setSelectedRegulation] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PASSED' | 'BACKLOGS'>('ALL');
  const [viewMode, setViewMode] = useState<'STUDENT_WISE' | 'MASTER_GRID'>('STUDENT_WISE');

  const [expandedStudents, setExpandedStudents] = useState<Record<string, boolean>>({});

  const [resultsData, setResultsData] = useState<ConsolidatedResultsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Load exam notifications
  const loadNotifications = useCallback(async () => {
    try {
      const data = await api.getMarksNotifications();
      setNotifications(data);
    } catch {
      // ignore
    }
  }, []);

  // Load consolidated results from backend
  const loadResults = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const examIdNum = selectedExamId ? parseInt(selectedExamId, 10) : undefined;
      const res = await api.getConsolidatedResults({
        examId: examIdNum,
        search: searchQuery,
      });
      setResultsData(res);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Failed to fetch consolidated results.');
      setResultsData(null);
    } finally {
      setLoading(false);
    }
  }, [selectedExamId, searchQuery]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    void loadResults();
  }, [loadResults]);

  // Extract unique regulations across notifications and student results
  const availableRegulations = useMemo(() => {
    const regs = new Set<string>();
    notifications.exams.forEach((e) => {
      if (e.regulationCode) regs.add(e.regulationCode);
    });
    notifications.revaluations.forEach((r) => {
      if (r.regulationCode) regs.add(r.regulationCode);
    });
    resultsData?.students.forEach((s) => {
      s.subjects.forEach((sub) => {
        if (sub.regulationCode && sub.regulationCode !== 'N/A') {
          regs.add(sub.regulationCode);
        }
      });
    });
    return Array.from(regs).sort();
  }, [notifications, resultsData]);

  const students = resultsData?.students || [];

  // Filter students based on status and regulation
  const filteredStudents = useMemo(() => {
    return students
      .map((s) => {
        if (selectedRegulation === 'ALL') return s;

        // Filter exam groups and subjects matching the regulation
        const matchingGroups = (s.examGroups || []).filter(
          (g) => g.regulationCode?.toUpperCase() === selectedRegulation.toUpperCase()
        );
        const matchingSubjects = s.subjects.filter(
          (sub) => sub.regulationCode?.toUpperCase() === selectedRegulation.toUpperCase()
        );

        if (matchingGroups.length === 0 && matchingSubjects.length === 0) return null;

        return {
          ...s,
          examGroups: matchingGroups.length > 0 ? matchingGroups : s.examGroups,
          subjects: matchingSubjects.length > 0 ? matchingSubjects : s.subjects,
        };
      })
      .filter((s): s is ConsolidatedStudentItem => {
        if (!s) return false;
        if (statusFilter === 'PASSED' && s.status !== 'PASSED') return false;
        if (statusFilter === 'BACKLOGS' && s.status !== 'BACKLOGS') return false;
        return true;
      });
  }, [students, statusFilter, selectedRegulation]);

  const stats = useMemo(() => {
    const total = students.length;
    const passed = students.filter((s) => s.status === 'PASSED').length;
    const backlogs = total - passed;
    const avgSgpa =
      total > 0
        ? (students.reduce((sum, s) => sum + (s.sgpa || 0), 0) / total).toFixed(2)
        : '0.00';

    return { total, passed, backlogs, avgSgpa };
  }, [students]);

  const toggleExpandAll = () => {
    const allExpanded = filteredStudents.every((s) => expandedStudents[s.rollNumber]);
    const next: Record<string, boolean> = {};
    if (!allExpanded) {
      filteredStudents.forEach((s) => {
        next[s.rollNumber] = true;
      });
    }
    setExpandedStudents(next);
  };

  const toggleStudent = (roll: string) => {
    setExpandedStudents((prev) => ({
      ...prev,
      [roll]: !prev[roll],
    }));
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredStudents.length === 0) return;

    const headers = [
      'Student Roll Number',
      'Student Name',
      'Exam Notification Title',
      'Exam Type',
      'Regulation',
      'Semester',
      'Subject Code',
      'Subject Name',
      'Internal Marks',
      'External Marks',
      'Total Marks',
      'Grade',
      'Grade Points',
      'Credits',
      'Result Status',
      'Revaluation Original Grade',
      'Revaluation Updated Grade',
      'Revaluation Status',
    ];

    const rows: string[][] = [];

    filteredStudents.forEach((s) => {
      const groups = s.examGroups && s.examGroups.length > 0 ? s.examGroups : null;

      if (groups) {
        groups.forEach((g) => {
          g.subjects.forEach((sub) => {
            rows.push([
              s.rollNumber,
              s.studentName || '',
              g.notificationTitle,
              g.examType,
              g.regulationCode || 'N/A',
              String(g.semester || ''),
              sub.subjectCode,
              sub.subjectName,
              sub.internalMarks !== null && sub.internalMarks !== undefined ? String(sub.internalMarks) : '',
              sub.externalMarks !== null && sub.externalMarks !== undefined
                ? sub.isAbsent
                  ? 'AB'
                  : String(sub.externalMarks)
                : '',
              sub.totalMarks !== null && sub.totalMarks !== undefined ? String(sub.totalMarks) : '',
              sub.grade || '',
              sub.gradePoints !== null && sub.gradePoints !== undefined ? String(sub.gradePoints) : '',
              String(sub.credits || 0),
              sub.passed !== false && sub.grade !== 'F' && sub.grade !== 'AB' ? 'PASS' : 'FAIL',
              sub.revaluation?.originalGrade || '',
              sub.revaluation?.updatedGrade || '',
              sub.revaluation?.status || '',
            ]);
          });
        });
      } else {
        s.subjects.forEach((sub) => {
          rows.push([
            s.rollNumber,
            s.studentName || '',
            sub.examTitle || 'General',
            sub.examType || 'REGULAR',
            sub.regulationCode || 'N/A',
            String(sub.semester || ''),
            sub.subjectCode,
            sub.subjectName,
            sub.internalMarks !== null && sub.internalMarks !== undefined ? String(sub.internalMarks) : '',
            sub.externalMarks !== null && sub.externalMarks !== undefined
              ? sub.isAbsent
                ? 'AB'
                : String(sub.externalMarks)
              : '',
            sub.totalMarks !== null && sub.totalMarks !== undefined ? String(sub.totalMarks) : '',
            sub.grade || '',
            sub.gradePoints !== null && sub.gradePoints !== undefined ? String(sub.gradePoints) : '',
            String(sub.credits || 0),
            sub.passed !== false && sub.grade !== 'F' && sub.grade !== 'AB' ? 'PASS' : 'FAIL',
            sub.revaluation?.originalGrade || '',
            sub.revaluation?.updatedGrade || '',
            sub.revaluation?.status || '',
          ]);
        });
      }
    });

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.map((val) => `"${val}"`).join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `student_results_statement_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <PageHeader
        title="Student Examination Results Ledger"
        description="Comprehensive result ledger displayed exam notification-wise and regulation-wise with Internal, External, Total Marks, SGPA, and Revaluation Results."
      />

      {/* Summary Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Students</span>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{stats.total}</p>
        </div>

        <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 shadow-xs">
          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">All Clear (Passed)</span>
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">
            {stats.passed}{' '}
            <span className="text-xs font-normal text-slate-500">
              ({stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(1) : 0}%)
            </span>
          </p>
        </div>

        <div className="p-4 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 shadow-xs">
          <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wider">With Backlogs</span>
          <p className="text-2xl font-bold text-rose-700 dark:text-rose-300 mt-1">
            {stats.backlogs}{' '}
            <span className="text-xs font-normal text-slate-500">
              ({stats.total > 0 ? ((stats.backlogs / stats.total) * 100).toFixed(1) : 0}%)
            </span>
          </p>
        </div>

        <div className="p-4 rounded-xl bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/60 shadow-xs">
          <span className="text-xs font-semibold text-sky-600 dark:text-sky-400 uppercase tracking-wider">Average SGPA</span>
          <p className="text-2xl font-bold text-sky-700 dark:text-sky-300 mt-1">{stats.avgSgpa}</p>
        </div>
      </div>

      {/* Main Results Card */}
      <Card>
        <CardHeader
          title="Student Results Ledger"
          description="Filter results by examination notification, academic regulation, search PIN/student name, and export detailed statements."
          action={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportCSV}
                disabled={filteredStudents.length === 0}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition-all shadow-xs disabled:opacity-50"
              >
                📥 Export CSV
              </button>
            </div>
          }
        />

        <CardBody className="space-y-6">
          {/* Filters Bar */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto flex-1">
              {/* Exam Notification Filter */}
              <div className="w-full sm:w-72">
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Examination Notification
                </label>
                <select
                  value={selectedExamId}
                  onChange={(e) => setSelectedExamId(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[var(--primary)]"
                >
                  <option value="">All Examinations</option>
                  {notifications.exams.map((exam) => (
                    <option key={exam.id} value={exam.id}>
                      {exam.title} [{exam.type || 'REGULAR'}]{exam.regulationCode ? ` (${exam.regulationCode})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Regulation Filter */}
              <div className="w-full sm:w-44">
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Regulation
                </label>
                <select
                  value={selectedRegulation}
                  onChange={(e) => setSelectedRegulation(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[var(--primary)]"
                >
                  <option value="ALL">All Regulations</option>
                  {availableRegulations.map((reg) => (
                    <option key={reg} value={reg}>
                      {reg}
                    </option>
                  ))}
                </select>
              </div>

              {/* Search Box */}
              <div className="w-full sm:w-64">
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Search Student / PIN
                </label>
                <input
                  type="text"
                  placeholder="Search PIN, Student Name, Code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[var(--primary)]"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto justify-end">
              {/* Status Filter Toggle */}
              <div className="flex rounded-lg border border-slate-300 dark:border-slate-700 p-0.5 bg-white dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setStatusFilter('ALL')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                    statusFilter === 'ALL'
                      ? 'bg-[var(--primary)] text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  All ({students.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('PASSED')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                    statusFilter === 'PASSED'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Passed ({stats.passed})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('BACKLOGS')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                    statusFilter === 'BACKLOGS'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Backlogs ({stats.backlogs})
                </button>
              </div>

              {/* View Mode Toggle */}
              <div className="flex rounded-lg border border-slate-300 dark:border-slate-700 p-0.5 bg-white dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setViewMode('STUDENT_WISE')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                    viewMode === 'STUDENT_WISE'
                      ? 'bg-[var(--primary)] text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Student Cards
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('MASTER_GRID')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                    viewMode === 'MASTER_GRID'
                      ? 'bg-[var(--primary)] text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Master Table
                </button>
              </div>
            </div>
          </div>

          {/* Error Message Alert */}
          {errorMsg && (
            <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs">
              {errorMsg}
            </div>
          )}

          {/* Loading Indicator */}
          {loading ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Loading student results ledger...
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="py-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">No student results found</p>
              <p className="text-xs text-slate-400 mt-1">Upload marks or select a different notification/regulation filter.</p>
            </div>
          ) : viewMode === 'STUDENT_WISE' ? (
            /* Mode 1: Student-Wise Cards (Grouped by Exam Notification & Regulation) */
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <span>Showing {filteredStudents.length} student record(s)</span>
                <button
                  type="button"
                  onClick={toggleExpandAll}
                  className="text-[var(--primary)] font-semibold hover:underline"
                >
                  {filteredStudents.every((s) => expandedStudents[s.rollNumber]) ? 'Collapse All' : 'Expand All'}
                </button>
              </div>

              {filteredStudents.map((student) => {
                const isExpanded = !!expandedStudents[student.rollNumber];
                const groups: ExamGroupResult[] =
                  student.examGroups && student.examGroups.length > 0
                    ? student.examGroups
                    : [
                        {
                          notificationTitle: 'General Examination Results',
                          examType: 'REGULAR',
                          regulationCode: 'N/A',
                          subjectCount: student.subjects.length,
                          passedCount: student.passedCount,
                          backlogs: student.backlogs,
                          totalCredits: student.totalCredits,
                          sgpa: student.sgpa,
                          status: student.status,
                          subjects: student.subjects,
                        },
                      ];

                return (
                  <div
                    key={student.rollNumber}
                    className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 transition-all hover:border-slate-300"
                  >
                    {/* Student Card Summary Header */}
                    <div
                      onClick={() => toggleStudent(student.rollNumber)}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer bg-slate-50/50 dark:bg-slate-900/50 hover:bg-slate-100/60 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center font-mono shrink-0">
                          {student.rollNumber.slice(-4)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                              {student.rollNumber}
                            </h4>
                            {student.studentName && (
                              <span className="text-xs text-slate-600 dark:text-slate-400">
                                ({student.studentName})
                              </span>
                            )}
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                student.status === 'PASSED'
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                              }`}
                            >
                              {student.status}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300">
                              {groups.length} Exam Notification(s)
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Total Papers: {student.subjectCount} • Cleared: {student.passedCount} • Backlogs: {student.backlogs}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-xs font-semibold">
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-normal">Total Credits</span>
                          <span className="text-slate-900 dark:text-slate-100">{student.totalCredits}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-normal">Overall SGPA</span>
                          <span className="text-sky-600 font-bold text-sm">{student.sgpa}</span>
                        </div>
                        <div className="text-slate-400 text-sm ml-2">
                          {isExpanded ? '▲' : '▼'}
                        </div>
                      </div>
                    </div>

                    {/* Expandable Grouped Exam Notification Results */}
                    {isExpanded && (
                      <div className="border-t border-slate-200 dark:border-slate-800 p-4 space-y-6 bg-slate-50/30 dark:bg-slate-900/40">
                        {groups.map((group, gIdx) => (
                          <div
                            key={gIdx}
                            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-2xs"
                          >
                            {/* Exam Notification & Regulation Group Header */}
                            <div className="px-4 py-2.5 bg-slate-100/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                                  {group.notificationTitle}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    group.examType === 'SUPPLEMENTARY'
                                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                      : group.examType === 'REVALUATION'
                                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
                                      : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300'
                                  }`}
                                >
                                  {group.examType}
                                </span>
                                {group.regulationCode && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                    Reg: {group.regulationCode}
                                  </span>
                                )}
                                {group.semester && (
                                  <span className="text-[11px] text-slate-500 font-medium">
                                    (Sem: {group.semester})
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-3 text-xs">
                                <span className="text-slate-500">
                                  SGPA: <strong className="text-sky-600">{group.sgpa}</strong>
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    group.status === 'PASSED'
                                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                      : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                  }`}
                                >
                                  {group.status}
                                </span>
                              </div>
                            </div>

                            {/* Group Subject Marks Table */}
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700">
                                  <tr>
                                    <th className="py-2 px-3">Subject Code & Name</th>
                                    <th className="py-2 px-3">Internal</th>
                                    <th className="py-2 px-3">External</th>
                                    <th className="py-2 px-3">Total</th>
                                    <th className="py-2 px-3">Grade</th>
                                    <th className="py-2 px-3">Grade Points</th>
                                    <th className="py-2 px-3">Credits</th>
                                    <th className="py-2 px-3">Status</th>
                                    <th className="py-2 px-3">Revaluation</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                  {group.subjects.map((sub) => {
                                    const isPass =
                                      sub.passed !== false && sub.grade !== 'F' && sub.grade !== 'AB';

                                    return (
                                      <tr
                                        key={sub.subjectCode}
                                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                                      >
                                        <td className="py-2 px-3 font-medium text-slate-900 dark:text-slate-100">
                                          <span className="font-mono font-bold text-sky-600 mr-2">
                                            {sub.subjectCode}
                                          </span>
                                          {sub.subjectName}
                                        </td>
                                        <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                                          {sub.internalMarks !== null && sub.internalMarks !== undefined
                                            ? `${sub.internalMarks} / ${sub.maxInternalMarks || 30}`
                                            : '-'}
                                        </td>
                                        <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                                          {sub.isAbsent ? (
                                            <span className="text-rose-600 font-bold">AB</span>
                                          ) : sub.externalMarks !== null && sub.externalMarks !== undefined ? (
                                            `${sub.externalMarks} / ${sub.maxExternalMarks || 70}`
                                          ) : (
                                            '-'
                                          )}
                                        </td>
                                        <td className="py-2 px-3 font-semibold text-slate-900 dark:text-slate-100">
                                          {sub.totalMarks !== null && sub.totalMarks !== undefined
                                            ? sub.totalMarks
                                            : '-'}
                                        </td>
                                        <td className="py-2 px-3 font-bold">{sub.grade || '-'}</td>
                                        <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                                          {sub.gradePoints !== null && sub.gradePoints !== undefined
                                            ? sub.gradePoints
                                            : '-'}
                                        </td>
                                        <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                                          {sub.credits}
                                        </td>
                                        <td className="py-2 px-3">
                                          <span
                                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                              isPass
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : 'bg-rose-100 text-rose-700'
                                            }`}
                                          >
                                            {isPass ? 'PASS' : 'FAIL'}
                                          </span>
                                        </td>
                                        <td className="py-2 px-3 text-xs">
                                          {sub.revaluation ? (
                                            <span className="inline-flex items-center gap-1 font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded text-[10px]">
                                              {sub.revaluation.originalGrade || '-'} ➔{' '}
                                              {sub.revaluation.updatedGrade || '-'}
                                            </span>
                                          ) : (
                                            <span className="text-slate-400">-</span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Mode 2: Master Tabular Grid of All Rows */
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
              <div className="max-h-[550px] overflow-y-auto overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="py-2.5 px-3">Student PIN</th>
                      <th className="py-2.5 px-3">Student Name</th>
                      <th className="py-2.5 px-3">Exam Notification</th>
                      <th className="py-2.5 px-3">Exam Type</th>
                      <th className="py-2.5 px-3">Regulation</th>
                      <th className="py-2.5 px-3">Subject Code & Name</th>
                      <th className="py-2.5 px-3">Internal</th>
                      <th className="py-2.5 px-3">External</th>
                      <th className="py-2.5 px-3">Total</th>
                      <th className="py-2.5 px-3">Grade</th>
                      <th className="py-2.5 px-3">Grade Points</th>
                      <th className="py-2.5 px-3">Credits</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Revaluation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {filteredStudents.flatMap((s) => {
                      const groups = s.examGroups && s.examGroups.length > 0 ? s.examGroups : null;

                      if (groups) {
                        return groups.flatMap((g) =>
                          g.subjects.map((sub) => {
                            const isPass =
                              sub.passed !== false && sub.grade !== 'F' && sub.grade !== 'AB';

                            return (
                              <tr
                                key={`${s.rollNumber}-${g.examId || g.revaluationId}-${sub.subjectCode}`}
                                className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                              >
                                <td className="py-2 px-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                                  {s.rollNumber}
                                </td>
                                <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                                  {s.studentName || '-'}
                                </td>
                                <td className="py-2 px-3 text-slate-800 dark:text-slate-200 font-medium">
                                  {g.notificationTitle}
                                </td>
                                <td className="py-2 px-3">
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                      g.examType === 'SUPPLEMENTARY'
                                        ? 'bg-amber-100 text-amber-800'
                                        : 'bg-indigo-100 text-indigo-800'
                                    }`}
                                  >
                                    {g.examType}
                                  </span>
                                </td>
                                <td className="py-2 px-3 font-semibold text-emerald-700 dark:text-emerald-400">
                                  {g.regulationCode || 'N/A'}
                                </td>
                                <td className="py-2 px-3 text-slate-900 dark:text-slate-100">
                                  <span className="font-mono font-bold text-sky-600 mr-1.5">
                                    {sub.subjectCode}
                                  </span>
                                  {sub.subjectName}
                                </td>
                                <td className="py-2 px-3">
                                  {sub.internalMarks !== null && sub.internalMarks !== undefined
                                    ? `${sub.internalMarks} / ${sub.maxInternalMarks || 30}`
                                    : '-'}
                                </td>
                                <td className="py-2 px-3">
                                  {sub.isAbsent ? (
                                    <span className="text-rose-600 font-bold">AB</span>
                                  ) : sub.externalMarks !== null && sub.externalMarks !== undefined ? (
                                    `${sub.externalMarks} / ${sub.maxExternalMarks || 70}`
                                  ) : (
                                    '-'
                                  )}
                                </td>
                                <td className="py-2 px-3 font-bold text-slate-900 dark:text-slate-100">
                                  {sub.totalMarks !== null && sub.totalMarks !== undefined
                                    ? sub.totalMarks
                                    : '-'}
                                </td>
                                <td className="py-2 px-3 font-bold">{sub.grade || '-'}</td>
                                <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                                  {sub.gradePoints !== null && sub.gradePoints !== undefined
                                    ? sub.gradePoints
                                    : '-'}
                                </td>
                                <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                                  {sub.credits}
                                </td>
                                <td className="py-2 px-3">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      isPass ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                                    }`}
                                  >
                                    {isPass ? 'PASS' : 'FAIL'}
                                  </span>
                                </td>
                                <td className="py-2 px-3">
                                  {sub.revaluation ? (
                                    <span className="inline-flex items-center gap-1 font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded text-[10px]">
                                      {sub.revaluation.originalGrade || '-'} ➔{' '}
                                      {sub.revaluation.updatedGrade || '-'}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">-</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        );
                      }

                      return s.subjects.map((sub) => {
                        const isPass =
                          sub.passed !== false && sub.grade !== 'F' && sub.grade !== 'AB';

                        return (
                          <tr
                            key={`${s.rollNumber}-${sub.subjectCode}`}
                            className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                          >
                            <td className="py-2 px-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                              {s.rollNumber}
                            </td>
                            <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                              {s.studentName || '-'}
                            </td>
                            <td className="py-2 px-3 text-slate-800 dark:text-slate-200 font-medium">
                              {sub.examTitle || 'General'}
                            </td>
                            <td className="py-2 px-3">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">
                                {sub.examType || 'REGULAR'}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-semibold text-emerald-700 dark:text-emerald-400">
                              {sub.regulationCode || 'N/A'}
                            </td>
                            <td className="py-2 px-3 text-slate-900 dark:text-slate-100">
                              <span className="font-mono font-bold text-sky-600 mr-1.5">
                                {sub.subjectCode}
                              </span>
                              {sub.subjectName}
                            </td>
                            <td className="py-2 px-3">
                              {sub.internalMarks !== null && sub.internalMarks !== undefined
                                ? `${sub.internalMarks} / ${sub.maxInternalMarks || 30}`
                                : '-'}
                            </td>
                            <td className="py-2 px-3">
                              {sub.isAbsent ? (
                                <span className="text-rose-600 font-bold">AB</span>
                              ) : sub.externalMarks !== null && sub.externalMarks !== undefined ? (
                                `${sub.externalMarks} / ${sub.maxExternalMarks || 70}`
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="py-2 px-3 font-bold text-slate-900 dark:text-slate-100">
                              {sub.totalMarks !== null && sub.totalMarks !== undefined
                                ? sub.totalMarks
                                : '-'}
                            </td>
                            <td className="py-2 px-3 font-bold">{sub.grade || '-'}</td>
                            <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                              {sub.gradePoints !== null && sub.gradePoints !== undefined
                                ? sub.gradePoints
                                : '-'}
                            </td>
                            <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                              {sub.credits}
                            </td>
                            <td className="py-2 px-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  isPass ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                                }`}
                              >
                                {isPass ? 'PASS' : 'FAIL'}
                              </span>
                            </td>
                            <td className="py-2 px-3">
                              {sub.revaluation ? (
                                <span className="inline-flex items-center gap-1 font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded text-[10px]">
                                  {sub.revaluation.originalGrade || '-'} ➔{' '}
                                  {sub.revaluation.updatedGrade || '-'}
                                </span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      });
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
