'use client';

import { useMemo, useState } from 'react';
import { MarksNotificationItem } from '@/types/marks-upload';

interface NotificationSelectorProps {
  notifications: MarksNotificationItem[];
  selectedNotification: MarksNotificationItem | null;
  onSelect: (item: MarksNotificationItem) => void;
  activeTab: 'INTERNAL' | 'EXTERNAL' | 'RESULT' | 'REVALUATION';
}

export function NotificationSelector({
  notifications,
  selectedNotification,
  onSelect,
  activeTab,
}: NotificationSelectorProps) {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'EXAM' | 'REVALUATION'>('ALL');

  const filtered = useMemo(() => {
    return notifications.filter((item) => {
      // For REVALUATION tab, prioritize revaluation notifications, but show all if filter permits
      if (activeTab === 'REVALUATION' && filterType === 'ALL' && item.notificationType !== 'REVALUATION') {
        // allow both or filter
      }

      if (filterType !== 'ALL' && item.notificationType !== filterType) {
        return false;
      }

      if (!search.trim()) return true;

      const q = search.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        (item.course && item.course.toLowerCase().includes(q)) ||
        (item.branch && item.branch.toLowerCase().includes(q)) ||
        (item.batch && item.batch.toLowerCase().includes(q)) ||
        (item.regulationCode && item.regulationCode.toLowerCase().includes(q))
      );
    });
  }, [notifications, search, filterType, activeTab]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Select Examination Notification
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Choose an active examination or revaluation notification to upload marks for.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <input
              type="text"
              placeholder="Search notification, branch, course..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <svg
              className="w-4 h-4 absolute left-3 top-2 text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          <div className="flex rounded-lg border border-slate-300 dark:border-slate-700 p-0.5 bg-white dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setFilterType('ALL')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                filterType === 'ALL'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFilterType('EXAM')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                filterType === 'EXAM'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Exams
            </button>
            <button
              type="button"
              onClick={() => setFilterType('REVALUATION')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                filterType === 'REVALUATION'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Revaluations
            </button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900">
          <svg className="w-10 h-10 mx-auto text-slate-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">No examination notifications found</p>
          <p className="text-xs text-slate-400">Try adjusting your filter search query.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-72 overflow-y-auto pr-1">
          {filtered.map((item) => {
            const isSelected =
              selectedNotification?.id === item.id &&
              selectedNotification?.notificationType === item.notificationType;

            return (
              <div
                key={`${item.notificationType}-${item.id}`}
                onClick={() => onSelect(item)}
                className={`group cursor-pointer relative p-3.5 rounded-xl border transition-all duration-200 text-left ${
                  isSelected
                    ? 'border-sky-500 bg-sky-50/60 dark:bg-sky-950/30 ring-2 ring-sky-500/30 shadow-md'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider ${
                        item.notificationType === 'REVALUATION'
                          ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                      }`}
                    >
                      {item.notificationType === 'REVALUATION' ? 'Revaluation' : item.type || 'Exam'}
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      {item.status.toUpperCase()}
                    </span>
                  </div>

                  {isSelected && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-600 text-white text-xs font-bold shadow-xs">
                      ✓
                    </span>
                  )}
                </div>

                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 line-clamp-2 mb-1 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                  {item.title}
                </h4>

                <div className="text-xs text-slate-500 dark:text-slate-400 space-y-0.5">
                  {item.notificationType === 'EXAM' ? (
                    <p>
                      {item.course} {item.branch ? `• ${item.branch}` : ''} {item.batch ? `(${item.batch})` : ''}
                    </p>
                  ) : (
                    <p>
                      Regulation: <span className="font-medium text-slate-700 dark:text-slate-300">{item.regulationCode}</span> • {item.academicYear}
                    </p>
                  )}
                  <p>
                    Semester: <span className="font-medium text-slate-700 dark:text-slate-300">{item.semester || item.yearOfStudy || 'All'}</span> • Papers: {item.subjectCount}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
