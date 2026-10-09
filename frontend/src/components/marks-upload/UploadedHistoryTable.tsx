'use client';

import { useMemo, useState } from 'react';
import { MarksHistoryResponse, MarksTabType } from '@/types/marks-upload';

interface UploadedHistoryTableProps {
  activeTab: MarksTabType;
  history: MarksHistoryResponse | null;
  isLoading: boolean;
  onRefresh: () => void;
}

export function UploadedHistoryTable({
  activeTab,
  history,
  isLoading,
  onRefresh,
}: UploadedHistoryTableProps) {
  const [search, setSearch] = useState('');

  const records = history?.records || [];

  const filtered = useMemo(() => {
    if (!search.trim()) return records;
    const q = search.toLowerCase();
    return records.filter(
      (r) =>
        r.studentRollNumber.toLowerCase().includes(q) ||
        (r.studentName && r.studentName.toLowerCase().includes(q)) ||
        r.subjectCode.toLowerCase().includes(q)
    );
  }, [records, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Imported Records Database
          </h3>
          <p className="text-xs text-slate-500">
            Total {history?.totalRecords || 0} marks record(s) stored for this examination notification.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Filter roll number, paper..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 w-48"
          />

          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="py-2.5 px-3">#</th>
                <th className="py-2.5 px-3">Roll Number / PIN</th>
                <th className="py-2.5 px-3">Student Name</th>
                <th className="py-2.5 px-3">Subject Code</th>

                {activeTab === 'INTERNAL' && (
                  <th className="py-2.5 px-3">Internal Marks</th>
                )}

                {activeTab === 'EXTERNAL' && (
                  <>
                    <th className="py-2.5 px-3">External Marks</th>
                    <th className="py-2.5 px-3">Absent</th>
                  </>
                )}

                {activeTab === 'RESULT' && (
                  <>
                    <th className="py-2.5 px-3">Grade</th>
                    <th className="py-2.5 px-3">Grade Points</th>
                    <th className="py-2.5 px-3">Status</th>
                  </>
                )}

                {activeTab === 'REVALUATION' && (
                  <>
                    <th className="py-2.5 px-3">Original Grade</th>
                    <th className="py-2.5 px-3">Updated Grade</th>
                    <th className="py-2.5 px-3">Status</th>
                  </>
                )}

                <th className="py-2.5 px-3">Uploaded By</th>
                <th className="py-2.5 px-3">Uploaded At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-500">
                    Loading records...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-500">
                    No imported mark records found for this notification tab.
                  </td>
                </tr>
              ) : (
                filtered.map((r, idx) => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2 px-3 text-slate-400 font-mono">{idx + 1}</td>
                    <td className="py-2 px-3 font-mono font-medium text-slate-900 dark:text-slate-100">
                      {r.studentRollNumber}
                    </td>
                    <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                      {r.studentName || '-'}
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-700 dark:text-slate-300">
                      {r.subjectCode}
                    </td>

                    {activeTab === 'INTERNAL' && (
                      <td className="py-2 px-3 font-semibold text-slate-900 dark:text-slate-100">
                        {r.internalMarks} / {r.maxInternalMarks || 30}
                      </td>
                    )}

                    {activeTab === 'EXTERNAL' && (
                      <>
                        <td className="py-2 px-3 font-semibold text-slate-900 dark:text-slate-100">
                          {r.isAbsent ? '0' : r.externalMarks} / {r.maxExternalMarks || 70}
                        </td>
                        <td className="py-2 px-3">
                          {r.isAbsent ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-700">
                              ABSENT
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700">
                              PRESENT
                            </span>
                          )}
                        </td>
                      </>
                    )}

                    {activeTab === 'RESULT' && (
                      <>
                        <td className="py-2 px-3 font-bold text-slate-900 dark:text-slate-100">
                          {r.grade || '-'}
                        </td>
                        <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                          {r.gradePoints ?? '-'}
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              r.passed
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-rose-100 text-rose-700'
                            }`}
                          >
                            {r.passed ? 'PASSED' : 'FAILED'}
                          </span>
                        </td>
                      </>
                    )}

                    {activeTab === 'REVALUATION' && (
                      <>
                        <td className="py-2 px-3 text-slate-500 font-medium">
                          {r.originalGrade || '-'}
                        </td>
                        <td className="py-2 px-3 font-bold text-sky-600">
                          {r.updatedGrade || r.grade || '-'}
                        </td>
                        <td className="py-2 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700">
                            {r.status || 'GRADE_CHANGED'}
                          </span>
                        </td>
                      </>
                    )}

                    <td className="py-2 px-3 text-slate-500">{r.uploadedBy || 'Staff Desk'}</td>
                    <td className="py-2 px-3 text-slate-400">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
