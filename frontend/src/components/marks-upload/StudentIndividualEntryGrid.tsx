import { useEffect, useMemo, useState } from 'react';
import {
  MarksTabType,
  NotificationStudentItem,
  NotificationSubjectItem,
  ParsedMarkRow,
} from '@/types/marks-upload';

interface StudentIndividualEntryGridProps {
  activeTab: MarksTabType;
  students: NotificationStudentItem[];
  subjects: NotificationSubjectItem[];
  branches?: string[];
  selectedBranch: string;
  selectedSubjectCode?: string;
  existingMarks?: any[];
  onSave: (rows: ParsedMarkRow[]) => void;
  isSaving: boolean;
}

export function StudentIndividualEntryGrid({
  activeTab,
  students,
  subjects,
  selectedBranch,
  selectedSubjectCode,
  existingMarks,
  onSave,
  isSaving,
}: StudentIndividualEntryGridProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Local state holding entered mark values for each student: Map<rollNumber, ParsedMarkRow>
  const [studentMarks, setStudentMarks] = useState<Record<string, ParsedMarkRow>>({});

  // Check if All Subjects mode is selected
  const isAllSubjects = !selectedSubjectCode || selectedSubjectCode === 'ALL';

  // Determine active subject code if a specific subject is selected
  const activeSubjectCode = useMemo(() => {
    if (selectedSubjectCode && selectedSubjectCode !== 'ALL') {
      return selectedSubjectCode;
    }
    return '';
  }, [selectedSubjectCode]);

  const selectedSubject = useMemo(
    () => (activeSubjectCode ? subjects.find((s) => s.code === activeSubjectCode) || null : null),
    [subjects, activeSubjectCode]
  );

  const defaultMaxInt = selectedSubject?.internalMarks || subjects[0]?.internalMarks || 30;
  const defaultMaxExt = selectedSubject?.externalMarks || subjects[0]?.externalMarks || 70;

  // Combine enrolled students and any students with existing mark records
  const allStudents = useMemo(() => {
    const studentMap = new Map<string, NotificationStudentItem>();

    for (const s of students) {
      if (s.rollNumber) {
        studentMap.set(s.rollNumber.toLowerCase(), s);
      }
    }

    if (Array.isArray(existingMarks)) {
      for (const m of existingMarks) {
        const roll = (m.studentRollNumber || m.rollNumber || '').trim();
        if (!roll) continue;
        const rKey = roll.toLowerCase();
        const existing = studentMap.get(rKey);
        if (!existing) {
          studentMap.set(rKey, {
            rollNumber: roll,
            name: m.studentName || '',
            examType: 'REGULAR',
            branch: m.studentBranch || 'GENERAL',
            feeStatus: 'paid',
          });
        } else if (!existing.name && m.studentName) {
          existing.name = m.studentName;
        }
      }
    }

    return Array.from(studentMap.values());
  }, [students, existingMarks]);

  // Pre-fill existing mark values when selectedSubjectCode or existingMarks change
  useEffect(() => {
    const isAll = !selectedSubjectCode || selectedSubjectCode === 'ALL';
    const actCode = !isAll ? selectedSubjectCode : '';
    const selSub = actCode ? subjects.find((s) => s.code === actCode) || null : null;
    const maxInt = selSub?.internalMarks || subjects[0]?.internalMarks || 30;
    const maxExt = selSub?.externalMarks || subjects[0]?.externalMarks || 70;

    const initialMarks: Record<string, ParsedMarkRow> = {};

    if (Array.isArray(existingMarks) && existingMarks.length > 0) {
      existingMarks.forEach((m) => {
        const mSub = String(m.subjectCode || '').trim().toLowerCase();
        const curSub = String(actCode || '').trim().toLowerCase();

        // Match subject code if specified, or load all if ALL subjects selected
        if (isAll || !curSub || !mSub || mSub === curSub) {
          const roll = (m.studentRollNumber || m.rollNumber || '').trim();
          if (roll) {
            initialMarks[roll] = {
              rollNumber: roll,
              studentName: m.studentName || '',
              subjectCode: m.subjectCode || actCode || subjects[0]?.code || '',
              subjectName: m.subjectName || selSub?.name || subjects[0]?.name || '',
              internalMarks: m.internalMarks,
              maxInternalMarks: m.maxInternalMarks || maxInt,
              externalMarks: m.externalMarks,
              maxExternalMarks: m.maxExternalMarks || maxExt,
              isAbsent: m.isAbsent,
              grade: m.grade,
              gradePoints: m.gradePoints,
              credits: m.credits,
              passed: m.passed,
              result: m.result || (m.passed ? 'P' : m.passed === false ? 'F' : undefined),
              originalGrade: m.originalGrade,
              updatedGrade: m.updatedGrade,
              status: m.status,
              remarks: m.remarks,
            };
          }
        }
      });
    }

    setStudentMarks(initialMarks);
  }, [selectedSubjectCode, existingMarks, subjects]);

  // Filter students by branch and search query
  const filteredStudents = useMemo(() => {
    return allStudents.filter((s) => {
      if (selectedBranch && selectedBranch !== 'ALL' && s.branch && s.branch.toUpperCase() !== selectedBranch.toUpperCase()) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        s.rollNumber.toLowerCase().includes(q) ||
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.branch && s.branch.toLowerCase().includes(q))
      );
    });
  }, [allStudents, selectedBranch, searchQuery]);

  // Handle cell value change
  const handleCellChange = (rollNumber: string, field: string, value: any) => {
    setStudentMarks((prev) => {
      const current = prev[rollNumber] || {
        rollNumber,
        subjectCode: activeSubjectCode || selectedSubject?.code || subjects[0]?.code || '',
        subjectName: selectedSubject?.name || subjects[0]?.name || '',
      };

      const updated = {
        ...current,
        [field]: value,
      };

      if (activeTab === 'RESULT') {
        const grade = String(updated.grade || '').toUpperCase();
        if (grade === 'F' || grade === 'AB' || grade === 'FAIL') {
          updated.passed = false;
          updated.result = 'F';
        } else if (grade) {
          updated.passed = true;
          updated.result = 'P';
        }
      }

      return {
        ...prev,
        [rollNumber]: updated,
      };
    });
  };

  // Quick pre-fill actions
  const handlePreFillMaxMarks = () => {
    const next: Record<string, ParsedMarkRow> = { ...studentMarks };
    filteredStudents.forEach((s) => {
      const current = next[s.rollNumber] || {
        rollNumber: s.rollNumber,
        studentName: s.name,
        subjectCode: activeSubjectCode || selectedSubject?.code || subjects[0]?.code || '',
        subjectName: selectedSubject?.name || subjects[0]?.name || '',
      };

      if (activeTab === 'INTERNAL') {
        current.internalMarks = defaultMaxInt;
        current.maxInternalMarks = defaultMaxInt;
      } else if (activeTab === 'EXTERNAL') {
        current.externalMarks = defaultMaxExt;
        current.maxExternalMarks = defaultMaxExt;
        current.isAbsent = false;
      }

      next[s.rollNumber] = current;
    });
    setStudentMarks(next);
  };

  const handleClearInputs = () => {
    setStudentMarks({});
  };

  const handleSubmit = () => {
    const rowsToSave: ParsedMarkRow[] = [];

    allStudents.forEach((s) => {
      const m = studentMarks[s.rollNumber];
      if (!m) return;

      const hasData =
        m.internalMarks !== undefined ||
        m.externalMarks !== undefined ||
        m.grade !== undefined ||
        m.updatedGrade !== undefined ||
        m.isAbsent;

      if (hasData) {
        rowsToSave.push({
          rollNumber: s.rollNumber,
          studentName: s.name,
          subjectCode: m.subjectCode || activeSubjectCode || selectedSubject?.code || subjects[0]?.code || '',
          subjectName: m.subjectName || selectedSubject?.name || subjects[0]?.name || '',
          ...m,
        });
      }
    });

    onSave(rowsToSave);
  };

  const enteredCount = useMemo(() => {
    return Object.values(studentMarks).filter(
      (m) =>
        m.internalMarks !== undefined ||
        m.externalMarks !== undefined ||
        m.grade !== undefined ||
        m.updatedGrade !== undefined ||
        m.isAbsent
    ).length;
  }, [studentMarks]);

  return (
    <div className="space-y-4">
      {/* Search & Actions Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/80 p-3.5 rounded-xl border border-slate-200">
        <div className="w-full sm:w-72">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search PIN / Name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={handlePreFillMaxMarks}
            className="px-3.5 py-1.5 text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors shadow-xs"
          >
            Fill Max Marks
          </button>
          <button
            type="button"
            onClick={handleClearInputs}
            className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors shadow-xs"
          >
            Clear Inputs
          </button>
        </div>
      </div>

      {/* Grid Information Banner */}
      <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-sky-50/70 border border-sky-200">
        <div className="text-xs text-slate-700">
          Branch: <span className="font-bold text-sky-700">{!selectedBranch || selectedBranch === 'ALL' ? 'ALL BRANCHES' : selectedBranch}</span>
          {activeTab !== 'RESULT' && (
            <> • Paper: <span className="font-bold text-sky-700">
              {isAllSubjects || !selectedSubject
                ? 'ALL SUBJECTS (Multi-subject)'
                : `${selectedSubject.code} - ${selectedSubject.name}`}
            </span></>
          )}
          {' '}• Students Count: <span className="font-bold">{filteredStudents.length}</span>
        </div>
        <div className="text-xs font-semibold text-emerald-600">
          Entered: {enteredCount} / {filteredStudents.length}
        </div>
      </div>

      {/* Student Entry Table with Fee Status Column */}
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
        <div className="max-h-96 overflow-y-auto overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">#</th>
                <th className="py-2.5 px-3">Student PIN / Roll</th>
                <th className="py-2.5 px-3">Student Name</th>
                <th className="py-2.5 px-3">Branch</th>
                <th className="py-2.5 px-3">Fee Status</th>

                {activeTab === 'INTERNAL' && (
                  <>
                    <th className="py-2.5 px-3">Internal Marks</th>
                    <th className="py-2.5 px-3">Max Internal</th>
                    <th className="py-2.5 px-3">Remarks</th>
                  </>
                )}

                {activeTab === 'EXTERNAL' && (
                  <>
                    <th className="py-2.5 px-3">External Marks</th>
                    <th className="py-2.5 px-3">Max External</th>
                    <th className="py-2.5 px-3">Absent?</th>
                    <th className="py-2.5 px-3">Remarks</th>
                  </>
                )}

                {activeTab === 'RESULT' && (
                  <>
                    <th className="py-2.5 px-3">Grade</th>
                    <th className="py-2.5 px-3">Grade Points</th>
                    <th className="py-2.5 px-3">Credits</th>
                    <th className="py-2.5 px-3">Result</th>
                  </>
                )}

                {activeTab === 'REVALUATION' && (
                  <>
                    <th className="py-2.5 px-3">Original Grade</th>
                    <th className="py-2.5 px-3">Updated Grade</th>
                    <th className="py-2.5 px-3">Status</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-slate-500">
                    No enrolled students found for the selected branch filter.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((s, idx) => {
                  const m = studentMarks[s.rollNumber] || {};
                  const feeStat = (s.feeStatus || 'paid').toLowerCase();

                  return (
                    <tr key={s.rollNumber} className="hover:bg-slate-50/70">
                      <td className="py-2 px-3 text-slate-400 font-mono">{idx + 1}</td>
                      <td className="py-2 px-3 font-mono font-semibold text-slate-900">
                        {s.rollNumber}
                      </td>
                      <td className="py-2 px-3 text-slate-700">
                        {s.name || '-'}
                      </td>
                      <td className="py-2 px-3 font-medium text-slate-600 uppercase">
                        {s.branch || 'GEN'}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            feeStat === 'paid' || feeStat === 'completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : feeStat === 'pending' || feeStat === 'unpaid'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-sky-100 text-sky-800'
                          }`}
                        >
                          {feeStat}
                        </span>
                      </td>

                      {activeTab === 'INTERNAL' && (
                        <>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              min="0"
                              max={defaultMaxInt}
                              placeholder="Marks"
                              value={m.internalMarks ?? ''}
                              onChange={(e) => handleCellChange(s.rollNumber, 'internalMarks', e.target.value)}
                              className="w-20 px-2 py-1 text-xs rounded border border-slate-300 bg-white font-semibold text-slate-900 focus:ring-2 focus:ring-sky-500"
                            />
                          </td>
                          <td className="py-2 px-3 text-slate-500">{m.maxInternalMarks || defaultMaxInt}</td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              placeholder="Optional note"
                              value={m.remarks ?? ''}
                              onChange={(e) => handleCellChange(s.rollNumber, 'remarks', e.target.value)}
                              className="w-32 px-2 py-1 text-xs rounded border border-slate-300 bg-white text-slate-900"
                            />
                          </td>
                        </>
                      )}

                      {activeTab === 'EXTERNAL' && (
                        <>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              min="0"
                              max={defaultMaxExt}
                              disabled={!!m.isAbsent}
                              placeholder={m.isAbsent ? 'AB' : 'Marks'}
                              value={m.isAbsent ? '' : (m.externalMarks ?? '')}
                              onChange={(e) => handleCellChange(s.rollNumber, 'externalMarks', e.target.value)}
                              className="w-20 px-2 py-1 text-xs rounded border border-slate-300 bg-white font-semibold text-slate-900 focus:ring-2 focus:ring-sky-500 disabled:bg-slate-100"
                            />
                          </td>
                          <td className="py-2 px-3 text-slate-500">{m.maxExternalMarks || defaultMaxExt}</td>
                          <td className="py-2 px-3">
                            <label className="inline-flex items-center gap-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!m.isAbsent}
                                onChange={(e) => handleCellChange(s.rollNumber, 'isAbsent', e.target.checked)}
                                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                              />
                              <span className="text-[11px] text-slate-500">Absent</span>
                            </label>
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              placeholder="Optional note"
                              value={m.remarks ?? ''}
                              onChange={(e) => handleCellChange(s.rollNumber, 'remarks', e.target.value)}
                              className="w-32 px-2 py-1 text-xs rounded border border-slate-300 bg-white text-slate-900"
                            />
                          </td>
                        </>
                      )}

                      {activeTab === 'RESULT' && (
                        <>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              placeholder="Grade (e.g. A+)"
                              value={m.grade ?? ''}
                              onChange={(e) => handleCellChange(s.rollNumber, 'grade', e.target.value)}
                              className="w-20 px-2 py-1 text-xs rounded border border-slate-300 bg-white font-bold uppercase text-slate-900"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              step="0.1"
                              placeholder="GP"
                              value={m.gradePoints ?? ''}
                              onChange={(e) => handleCellChange(s.rollNumber, 'gradePoints', e.target.value)}
                              className="w-16 px-2 py-1 text-xs rounded border border-slate-300 bg-white text-slate-900"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              step="0.5"
                              placeholder="Credits"
                              value={m.credits ?? ''}
                              onChange={(e) => handleCellChange(s.rollNumber, 'credits', e.target.value)}
                              className="w-16 px-2 py-1 text-xs rounded border border-slate-300 bg-white text-slate-900"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                m.passed === false || m.grade === 'F'
                                  ? 'bg-rose-100 text-rose-700'
                                  : 'bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              {m.passed === false || m.grade === 'F' ? 'F' : 'P'}
                            </span>
                          </td>
                        </>
                      )}

                      {activeTab === 'REVALUATION' && (
                        <>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              placeholder="Orig Grade"
                              value={m.originalGrade ?? ''}
                              onChange={(e) => handleCellChange(s.rollNumber, 'originalGrade', e.target.value)}
                              className="w-20 px-2 py-1 text-xs rounded border border-slate-300 bg-white uppercase text-slate-900"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              placeholder="New Grade"
                              value={m.updatedGrade ?? ''}
                              onChange={(e) => handleCellChange(s.rollNumber, 'updatedGrade', e.target.value)}
                              className="w-20 px-2 py-1 text-xs rounded border border-slate-300 bg-white font-bold text-sky-600 uppercase"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700">
                              {m.status || 'GRADE_CHANGED'}
                            </span>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Submit Button Bar */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSaving || enteredCount === 0}
          className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-[var(--primary)] hover:opacity-90 disabled:opacity-50 rounded-xl shadow-sm transition-all"
        >
          {isSaving ? (
            <>
              <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Saving Marks...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              Save Marks for {enteredCount} Student(s)
            </>
          )}
        </button>
      </div>
    </div>
  );
}
