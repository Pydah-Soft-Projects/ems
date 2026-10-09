'use client';

import { useMemo, useState } from 'react';
import { CourseCategoryType, MarksTabType, NotificationSubjectItem, ParsedMarkRow } from '@/types/marks-upload';
import { isLabSubject } from './NotificationDropdownSelector';

interface MarksPreviewGridProps {
  activeTab: MarksTabType;
  courseCategory?: CourseCategoryType;
  subjects?: NotificationSubjectItem[];
  rows: ParsedMarkRow[];
  students?: Array<{ rollNumber: string; name: string }>;
  selectedBranch?: string;
  selectedSubjectCode?: string;
  onUpdateRow: (index: number, updated: ParsedMarkRow) => void;
  onRemoveRow: (index: number) => void;
  onImport: () => void;
  isImporting: boolean;
  onClear: () => void;
}

export function MarksPreviewGrid({
  activeTab,
  courseCategory = 'THEORY',
  subjects = [],
  rows,
  students = [],
  selectedBranch = 'ALL',
  selectedSubjectCode = 'ALL',
  onUpdateRow,
  onRemoveRow,
  onImport,
  isImporting,
  onClear,
}: MarksPreviewGridProps) {
  const [filter, setFilter] = useState<'ALL' | 'VALID' | 'ERRORS'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Map student roll numbers to names for dynamic resolution
  const studentMap = useMemo(() => {
    const map = new Map<string, string>();
    if (Array.isArray(students)) {
      students.forEach((s) => {
        if (s.rollNumber && s.name) {
          map.set(s.rollNumber.trim().toLowerCase(), s.name.trim());
        }
      });
    }
    return map;
  }, [students]);

  // Validate each row for issues
  const validatedRows = useMemo(() => {
    return rows.map((r, idx) => {
      const errs: string[] = [];
      const roll = String(r.rollNumber || r.roll || r.pinNo || '').trim();
      const code = String(r.subjectCode || r.code || '').trim();

      if (!roll) errs.push('Missing Roll Number / PIN');

      const isAllSubjects = !selectedSubjectCode || selectedSubjectCode === 'ALL';
      if (isAllSubjects && !code) {
        errs.push('Subject Code is mandatory when "All Subjects" is selected');
      }

      // Validate subject against active courseCategory (Theory vs Lab)
      if (code && subjects.length > 0 && courseCategory) {
        const found = subjects.find(
          (s) => s.code.trim().toUpperCase() === code.toUpperCase()
        );
        if (found) {
          const isLab = isLabSubject(found);
          const isTargetLab = courseCategory === 'LAB';
          if (isLab !== isTargetLab) {
            errs.push(
              `Subject "${code}" is a ${isLab ? 'Lab' : 'Theory'} subject (current mode: ${
                isTargetLab ? 'Labs & Practical' : 'Theory Subjects'
              })`
            );
          }
        }
      }

      if (activeTab === 'INTERNAL') {
        const isAb = r.isAbsent || String(r.internalMarks ?? r.marks ?? '').toUpperCase() === 'AB';
        if (!isAb) {
          const val = parseFloat(String(r.internalMarks ?? r.marks ?? ''));
          if (isNaN(val) || val < 0) errs.push('Invalid internal marks');
        }
      } else if (activeTab === 'EXTERNAL') {
        const isAb = r.isAbsent || String(r.externalMarks ?? r.marks ?? '').toUpperCase() === 'AB';
        if (!isAb) {
          const val = parseFloat(String(r.externalMarks ?? r.marks ?? ''));
          if (isNaN(val) || val < 0) errs.push('Invalid external marks');
        }
      } else if (activeTab === 'RESULT') {
        if (!r.grade && !r.result) errs.push('Missing Grade / Result');
      } else if (activeTab === 'REVALUATION') {
        if (!r.updatedGrade && !r.grade) errs.push('Missing updated grade');
      }

      return {
        row: r,
        originalIndex: idx,
        isValid: errs.length === 0,
        errors: errs,
      };
    });
  }, [rows, activeTab, courseCategory, subjects, selectedSubjectCode]);

  const stats = useMemo(() => {
    const total = validatedRows.length;
    const valid = validatedRows.filter((v) => v.isValid).length;
    const errors = total - valid;
    const passes = validatedRows.filter(
      (v) => String(v.row.result).toUpperCase() === 'P' || String(v.row.grade).toUpperCase() !== 'F',
    ).length;

    return { total, valid, errors, passes, fails: total - passes };
  }, [validatedRows]);

  const filtered = useMemo(() => {
    return validatedRows.filter((item) => {
      if (filter === 'VALID' && !item.isValid) return false;
      if (filter === 'ERRORS' && item.isValid) return false;

      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase();
      const r = item.row;
      return (
        String(r.rollNumber || '').toLowerCase().includes(q) ||
        String(r.studentName || '').toLowerCase().includes(q) ||
        String(r.subjectCode || '').toLowerCase().includes(q)
      );
    });
  }, [validatedRows, filter, searchTerm]);

  return (
    <div className="space-y-4">
      {/* Stats Header Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200">
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Total Rows</p>
          <p className="text-xl font-bold text-slate-900">{stats.total}</p>
        </div>

        <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200">
          <p className="text-[11px] font-medium text-emerald-600 uppercase tracking-wider">Valid Rows</p>
          <p className="text-xl font-bold text-emerald-700">{stats.valid}</p>
        </div>

        <div className={`p-3 rounded-xl border ${stats.errors > 0 ? 'bg-rose-50/80 border-rose-200' : 'bg-slate-50/80 border-slate-200'}`}>
          <p className={`text-[11px] font-medium uppercase tracking-wider ${stats.errors > 0 ? 'text-rose-600' : 'text-slate-500'}`}>Rows with Errors</p>
          <p className={`text-xl font-bold ${stats.errors > 0 ? 'text-rose-700' : 'text-slate-700'}`}>{stats.errors}</p>
        </div>

        <div className="p-3 rounded-xl bg-sky-50/80 border border-sky-200">
          <p className="text-[11px] font-medium text-sky-600 uppercase tracking-wider">Pass / Clear Preview</p>
          <p className="text-xl font-bold text-sky-700">{stats.passes} <span className="text-xs font-normal text-slate-500">({stats.fails} Fail)</span></p>
        </div>
      </div>

      <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-50/80 border border-slate-200 text-xs text-slate-600">
        <div>
          Target Upload Branch: <span className="font-bold text-[var(--primary)]">{!selectedBranch || selectedBranch === 'ALL' ? 'ALL BRANCHES (All Data)' : `${selectedBranch} BRANCH`}</span>
        </div>
        <div>
          {!selectedBranch || selectedBranch === 'ALL'
            ? 'Importing will process rows for all branches'
            : `Importing will target ${selectedBranch} branch data only`}
        </div>
      </div>

      {/* Filter and Action Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <input
            type="text"
            placeholder="Search roll number, code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 w-full sm:w-60"
          />

          <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-100 shrink-0">
            <button
              type="button"
              onClick={() => setFilter('ALL')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md ${filter === 'ALL' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-500'}`}
            >
              All ({stats.total})
            </button>
            <button
              type="button"
              onClick={() => setFilter('VALID')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md ${filter === 'VALID' ? 'bg-emerald-600 text-white shadow-xs font-bold' : 'text-slate-500'}`}
            >
              Valid ({stats.valid})
            </button>
            <button
              type="button"
              onClick={() => setFilter('ERRORS')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md ${filter === 'ERRORS' ? 'bg-rose-600 text-white shadow-xs font-bold' : 'text-slate-500'}`}
            >
              Errors ({stats.errors})
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={onClear}
            className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg border border-slate-300 hover:bg-slate-100 transition-colors"
          >
            Clear Parsed Data
          </button>

          <button
            type="button"
            onClick={onImport}
            disabled={isImporting || stats.valid === 0}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 rounded-lg shadow-sm transition-all"
          >
            {isImporting ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Importing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                Import {stats.valid} Record(s) to Database
              </>
            )}
          </button>
        </div>
      </div>

      {/* Parsed Data Preview Table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
        <div className="max-h-96 overflow-y-auto overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">#</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Student Roll / PIN</th>
                <th className="py-2.5 px-3">Student Name</th>
                <th className="py-2.5 px-3">Subject Code</th>

                {activeTab === 'INTERNAL' && (
                  <>
                    <th className="py-2.5 px-3">Internal Marks</th>
                    <th className="py-2.5 px-3">Max Internal</th>
                  </>
                )}

                {activeTab === 'EXTERNAL' && (
                  <>
                    <th className="py-2.5 px-3">External Marks</th>
                    <th className="py-2.5 px-3">Max External</th>
                    <th className="py-2.5 px-3">Absent</th>
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
                    <th className="py-2.5 px-3">Orig Grade</th>
                    <th className="py-2.5 px-3">Updated Grade</th>
                    <th className="py-2.5 px-3">Status</th>
                  </>
                )}

                <th className="py-2.5 px-3">Remarks / Issues</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-slate-500">
                    No matching parsed records found.
                  </td>
                </tr>
              ) : (
                filtered.map((item, displayIdx) => {
                  const r = item.row;
                  const origIdx = item.originalIndex;

                  return (
                    <tr
                      key={origIdx}
                      className={item.isValid ? 'hover:bg-slate-50/70' : 'bg-rose-50/40 hover:bg-rose-50/70'}
                    >
                      <td className="py-2 px-3 text-slate-400 font-mono">{displayIdx + 1}</td>
                      <td className="py-2 px-3">
                        {item.isValid ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-100 text-emerald-700">
                            Valid
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-rose-100 text-rose-700">
                            Error
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={r.rollNumber || r.roll || ''}
                          onChange={(e) => onUpdateRow(origIdx, { ...r, rollNumber: e.target.value })}
                          className="w-28 px-1.5 py-0.5 text-xs rounded border border-slate-300 bg-white font-mono font-medium text-slate-900 focus:ring-1 focus:ring-sky-500"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          placeholder="Student Name"
                          value={r.studentName || studentMap.get(String(r.rollNumber || r.roll || '').trim().toLowerCase()) || ''}
                          onChange={(e) => onUpdateRow(origIdx, { ...r, studentName: e.target.value })}
                          className="w-32 px-1.5 py-0.5 text-xs rounded border border-slate-300 bg-white text-slate-900 focus:ring-1 focus:ring-sky-500"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={r.subjectCode || ''}
                          onChange={(e) => onUpdateRow(origIdx, { ...r, subjectCode: e.target.value })}
                          className="w-24 px-1.5 py-0.5 text-xs rounded border border-slate-300 bg-white font-mono text-slate-900 focus:ring-1 focus:ring-sky-500"
                        />
                      </td>

                      {activeTab === 'INTERNAL' && (
                        <>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              placeholder="Marks or AB"
                              value={r.internalMarks ?? r.marks ?? ''}
                              onChange={(e) => onUpdateRow(origIdx, { ...r, internalMarks: e.target.value, marks: e.target.value })}
                              className="w-20 px-1.5 py-0.5 text-xs rounded border border-slate-300 bg-white font-semibold text-slate-900"
                            />
                          </td>
                          <td className="py-2 px-3 text-slate-500">{r.maxInternalMarks || 30}</td>
                        </>
                      )}

                      {activeTab === 'EXTERNAL' && (
                        <>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              placeholder="Marks or AB"
                              value={r.externalMarks ?? r.marks ?? ''}
                              onChange={(e) => onUpdateRow(origIdx, { ...r, externalMarks: e.target.value, marks: e.target.value })}
                              className="w-20 px-1.5 py-0.5 text-xs rounded border border-slate-300 bg-white font-semibold text-slate-900"
                            />
                          </td>
                          <td className="py-2 px-3 text-slate-500">{r.maxExternalMarks || 70}</td>
                          <td className="py-2 px-3">
                            <input
                              type="checkbox"
                              checked={!!r.isAbsent || String(r.externalMarks || r.marks).toUpperCase() === 'AB'}
                              onChange={(e) => onUpdateRow(origIdx, { ...r, isAbsent: e.target.checked })}
                              className="rounded border-slate-300 text-sky-600"
                            />
                          </td>
                        </>
                      )}

                      {activeTab === 'RESULT' && (
                        <>
                          <td className="py-2 px-3 font-bold">
                            <input
                              type="text"
                              value={r.grade || ''}
                              onChange={(e) => onUpdateRow(origIdx, { ...r, grade: e.target.value })}
                              className="w-12 px-1.5 py-0.5 text-xs rounded border border-slate-300 bg-white font-bold uppercase text-slate-900"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              step="0.1"
                              value={r.gradePoints ?? ''}
                              onChange={(e) => onUpdateRow(origIdx, { ...r, gradePoints: e.target.value })}
                              className="w-14 px-1.5 py-0.5 text-xs rounded border border-slate-300 bg-white text-slate-900"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              step="0.5"
                              value={r.credits ?? ''}
                              onChange={(e) => onUpdateRow(origIdx, { ...r, credits: e.target.value })}
                              className="w-14 px-1.5 py-0.5 text-xs rounded border border-slate-300 bg-white text-slate-900"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${String(r.result).toUpperCase() === 'P' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                              {r.result || (r.grade === 'F' ? 'F' : 'P')}
                            </span>
                          </td>
                        </>
                      )}

                      {activeTab === 'REVALUATION' && (
                        <>
                          <td className="py-2 px-3 text-slate-500 font-bold">{r.originalGrade || '-'}</td>
                          <td className="py-2 px-3 font-bold text-sky-600">{r.updatedGrade || r.grade || '-'}</td>
                          <td className="py-2 px-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700">
                              {r.status || 'GRADE_CHANGED'}
                            </span>
                          </td>
                        </>
                      )}

                      <td className="py-2 px-3">
                        {item.errors.length > 0 ? (
                          <span className="text-rose-600 font-medium">{item.errors.join(', ')}</span>
                        ) : (
                          <span className="text-slate-400">{r.remarks || 'OK'}</span>
                        )}
                      </td>

                      <td className="py-2 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => onRemoveRow(origIdx)}
                          className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                          title="Remove row"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
