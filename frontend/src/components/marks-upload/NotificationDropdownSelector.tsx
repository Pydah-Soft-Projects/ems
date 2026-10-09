'use client';

import { useMemo } from 'react';
import { CourseCategoryType, MarksNotificationItem, NotificationSubjectItem } from '@/types/marks-upload';

interface NotificationDropdownSelectorProps {
  notifications: MarksNotificationItem[];
  selectedNotification: MarksNotificationItem | null;
  onSelect: (item: MarksNotificationItem) => void;
  activeTab: 'INTERNAL' | 'EXTERNAL' | 'RESULT' | 'REVALUATION';
  courseCategory?: CourseCategoryType;
  branches?: string[];
  selectedBranch?: string;
  onSelectBranch?: (branch: string) => void;
  subjects?: NotificationSubjectItem[];
  selectedSubjectCode?: string;
  onSelectSubjectCode?: (code: string) => void;
}

export function NotificationDropdownSelector({
  notifications,
  selectedNotification,
  onSelect,
  activeTab,
  courseCategory = 'THEORY',
  branches = [],
  selectedBranch = 'ALL',
  onSelectBranch,
  subjects = [],
  selectedSubjectCode = 'ALL',
  onSelectSubjectCode,
}: NotificationDropdownSelectorProps) {
  const filtered = useMemo(() => {
    return notifications.filter((item) => {
      if (activeTab === 'REVALUATION') {
        return item.notificationType === 'REVALUATION';
      }
      return item.notificationType === 'EXAM';
    });
  }, [notifications, activeTab]);

  const selectedValue = selectedNotification
    ? `${selectedNotification.notificationType}-${selectedNotification.id}`
    : '';

  const handleSelectChange = (val: string) => {
    if (!val) return;
    const [type, idStr] = val.split('-');
    const id = parseInt(idStr, 10);
    const item = notifications.find(
      (n) => n.id === id && n.notificationType === type
    );
    if (item) {
      onSelect(item);
    }
  };

  const showSubjectFilter = activeTab !== 'RESULT';

  return (
    <div className={`grid grid-cols-1 ${showSubjectFilter ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4 items-end bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800`}>
      {/* 1. Examination Notification Dropdown */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
          Select Examination Notification
        </label>
        <select
          value={selectedValue}
          onChange={(e) => handleSelectChange(e.target.value)}
          className="w-full px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-all cursor-pointer"
        >
          <option value="" disabled>
            -- Choose Examination Notification --
          </option>

          {filtered.length === 0 && (
            <option value="" disabled>
              No active notifications available for this category
            </option>
          )}

          {filtered.map((item) => (
            <option
              key={`${item.notificationType}-${item.id}`}
              value={`${item.notificationType}-${item.id}`}
            >
              {item.title} | {item.course || item.regulationCode} {item.branch ? `(${item.branch})` : ''} - Sem {item.semester || item.yearOfStudy || 'All'} ({item.status.toUpperCase()})
            </option>
          ))}
        </select>
      </div>

      {/* 2. Target Branch Dropdown */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
          Target Branch
        </label>
        <select
          value={selectedBranch || 'ALL'}
          onChange={(e) => onSelectBranch && onSelectBranch(e.target.value)}
          className="w-full px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-all cursor-pointer font-medium"
        >
          <option value="ALL">All Branches (All Data)</option>
          {branches.map((b) => (
            <option key={b} value={b}>
              {b} Branch
            </option>
          ))}
        </select>
      </div>

      {/* 3. Select Subject Paper Dropdown (Only for non-RESULT tabs) */}
      {showSubjectFilter && (
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
            Select Subject Paper ({courseCategory === 'LAB' ? 'Lab Focus' : 'Theory Focus'})
          </label>
          <select
            value={selectedSubjectCode || 'ALL'}
            onChange={(e) => onSelectSubjectCode && onSelectSubjectCode(e.target.value)}
            className="w-full px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-all cursor-pointer font-medium text-sky-700 dark:text-sky-300"
          >
            <option value="ALL">All Subjects (Multi-subject / File Specified)</option>
            {subjects.map((sub, idx) => {
              const rawType = String(sub.type || '').trim().toLowerCase();
              const rawName = String(sub.name || '').trim().toUpperCase();
              const rawCode = String(sub.code || '').trim().toUpperCase();

              const isLab =
                ['lab', 'laboratory', 'practical', 'p'].includes(rawType) ||
                rawType.includes('lab') ||
                rawName.includes('LAB') ||
                rawName.includes('PRACTICAL') ||
                rawName.includes('WORKSHOP') ||
                rawName.includes('SEMINAR') ||
                rawName.includes('PROJECT') ||
                rawName.includes('VIVA') ||
                rawCode.endsWith('L') ||
                rawCode.endsWith('P');

              const typeLabel = isLab ? '[LAB]' : '[THEORY]';
              return (
                <option key={`${sub.code || sub.id || 'sub'}-${idx}`} value={sub.code}>
                  {typeLabel} {sub.code} - {sub.name}
                </option>
              );
            })}
          </select>
        </div>
      )}
    </div>
  );
}
