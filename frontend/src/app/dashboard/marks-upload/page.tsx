'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import {
  CourseCategoryType,
  MarksHistoryResponse,
  MarksNotificationItem,
  MarksNotificationResponse,
  MarksTabType,
  NotificationStudentItem,
  NotificationSubjectItem,
  ParsedMarkRow,
} from '@/types/marks-upload';

import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { NotificationDropdownSelector, isLabSubject } from '@/components/marks-upload/NotificationDropdownSelector';
import { FileUploadZone } from '@/components/marks-upload/FileUploadZone';
import { MarksPreviewGrid } from '@/components/marks-upload/MarksPreviewGrid';
import { StudentIndividualEntryGrid } from '@/components/marks-upload/StudentIndividualEntryGrid';
import { UploadedHistoryTable } from '@/components/marks-upload/UploadedHistoryTable';
import { useToast } from '@/components/ui/Toast';

export default function MarksUploadPage() {
  const toast = useToast();

  const [courseCategory, setCourseCategory] = useState<CourseCategoryType>('THEORY');
  const [activeTab, setActiveTab] = useState<MarksTabType>('INTERNAL');
  const [entryMode, setEntryMode] = useState<'EXCEL' | 'INDIVIDUAL'>('EXCEL');

  const [notifications, setNotifications] = useState<MarksNotificationResponse>({
    exams: [],
    revaluations: [],
  });

  const [selectedNotification, setSelectedNotification] = useState<MarksNotificationItem | null>(null);
  const [loadingNotifications, setLoadingNotifications] = useState(true);

  // Notification Details (Enrolled Students & Paper Subjects & Branches)
  const [notificationSubjects, setNotificationSubjects] = useState<NotificationSubjectItem[]>([]);
  const [notificationStudents, setNotificationStudents] = useState<NotificationStudentItem[]>([]);
  const [notificationBranches, setNotificationBranches] = useState<string[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('ALL');
  const [selectedSubjectCode, setSelectedSubjectCode] = useState<string>('ALL');
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Filter subjects strictly according to the active course category (THEORY vs LAB)
  const categorySubjects = useMemo(() => {
    return notificationSubjects.filter((sub) => {
      const isLab = isLabSubject(sub);
      return courseCategory === 'LAB' ? isLab : !isLab;
    });
  }, [notificationSubjects, courseCategory]);

  // File & Parsing state (Mode 1)
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedMarkRow[]>([]);

  // Import State
  const [isImporting, setIsImporting] = useState(false);

  // Database History State
  const [history, setHistory] = useState<MarksHistoryResponse | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [errorMsg, setErrorMsg] = useState('');

  // Fetch notifications list
  const loadNotifications = useCallback(async () => {
    setLoadingNotifications(true);
    setErrorMsg('');
    try {
      const data = await api.getMarksNotifications();
      setNotifications(data);

      if (data.exams && data.exams.length > 0 && !selectedNotification) {
        setSelectedNotification(data.exams[0]);
      }
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Failed to fetch examination notifications.');
    } finally {
      setLoadingNotifications(false);
    }
  }, [selectedNotification]);

  // Fetch enrolled students & subjects when notification changes
  const loadNotificationDetails = useCallback(async () => {
    if (!selectedNotification) return;
    setLoadingDetails(true);
    try {
      const res = await api.getNotificationDetails(
        selectedNotification.notificationType,
        selectedNotification.id
      );
      setNotificationSubjects(res.subjects || []);
      setNotificationStudents(res.students || []);
      setNotificationBranches(res.branches || []);
    } catch {
      setNotificationSubjects([]);
      setNotificationStudents([]);
      setNotificationBranches([]);
    } finally {
      setLoadingDetails(false);
    }
  }, [selectedNotification]);

  // Fetch history when tab or notification changes
  const loadHistory = useCallback(async () => {
    if (!selectedNotification) return;
    setLoadingHistory(true);
    try {
      const data = await api.getMarksHistory(activeTab, selectedNotification.id);
      setHistory(data);
    } catch {
      setHistory(null);
    } finally {
      setLoadingHistory(false);
    }
  }, [activeTab, selectedNotification]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    void loadNotificationDetails();
    void loadHistory();
  }, [loadNotificationDetails, loadHistory]);

  // Handle Course Category Switch (Theory vs Labs)
  const handleCourseCategoryChange = (category: CourseCategoryType) => {
    setCourseCategory(category);
    setSelectedSubjectCode('ALL');
    setParsedRows([]);
    setSelectedFile(null);

    if (category === 'LAB') {
      if (activeTab === 'RESULT' || activeTab === 'REVALUATION') {
        setActiveTab('INTERNAL');
      }
    } else {
      if (activeTab === 'EXTERNAL') {
        setActiveTab('INTERNAL');
      }
    }
  };

  // Handle Sub-Tab Switch
  const handleTabChange = (tab: MarksTabType) => {
    setActiveTab(tab);
    setParsedRows([]);
    setSelectedFile(null);
    if (tab === 'RESULT') {
      setSelectedSubjectCode('ALL');
    }

    if (tab === 'REVALUATION' && notifications.revaluations.length > 0) {
      setSelectedNotification(notifications.revaluations[0]);
    } else if (tab !== 'REVALUATION' && notifications.exams.length > 0 && selectedNotification?.notificationType === 'REVALUATION') {
      setSelectedNotification(notifications.exams[0]);
    }
  };

  // Parse uploaded file (Mode 1)
  const handleFileSelect = async (file: File) => {
    setSelectedFile(file);
    setIsParsing(true);
    setErrorMsg('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (selectedNotification) {
        formData.append('notificationId', String(selectedNotification.id));
        formData.append('notificationType', selectedNotification.notificationType || 'EXAM');
      }
      if (selectedBranch) formData.append('branch', selectedBranch);
      if (selectedSubjectCode) formData.append('subjectCode', selectedSubjectCode);
      if (activeTab) formData.append('activeTab', activeTab);
      if (courseCategory) formData.append('courseCategory', courseCategory);

      const result = await api.parseMarksFile(formData);
      if (result.success) {
        setParsedRows(result.rows || []);
        toast.push(`Parsed ${result.rows.length} rows successfully.`, 'success');
      } else {
        setErrorMsg('Failed to parse file content.');
      }
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Error parsing uploaded file.');
      toast.push('Failed to parse file.', 'danger');
    } finally {
      setIsParsing(false);
    }
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setParsedRows([]);
  };

  const handleUpdateRow = (index: number, updated: ParsedMarkRow) => {
    setParsedRows((prev) => {
      const next = [...prev];
      next[index] = updated;
      return next;
    });
  };

  const handleRemoveRow = (index: number) => {
    setParsedRows((prev) => prev.filter((_, i) => i !== index));
  };

  // Submit and upload to database (for both Mode 1 & Mode 2)
  const handleImportToDatabase = async (rowsToSave?: ParsedMarkRow[]) => {
    if (!selectedNotification) {
      toast.push('Please select an examination notification first.', 'danger');
      return;
    }

    let rows = rowsToSave || parsedRows;
    if (rows.length === 0) {
      toast.push('No mark records to save.', 'danger');
      return;
    }

    // If a specific subject is selected (not 'ALL'), assign subject code to rows if not already set
    if (selectedSubjectCode && selectedSubjectCode !== 'ALL') {
      const subObj = notificationSubjects.find((s) => s.code === selectedSubjectCode);
      rows = rows.map((r) => ({
        ...r,
        subjectCode: r.subjectCode || selectedSubjectCode,
        subjectName: r.subjectName || subObj?.name || selectedSubjectCode,
      }));
    }

    setIsImporting(true);
    setErrorMsg('');

    try {
      const res = await api.uploadMarks(activeTab, selectedNotification.id, {
        rows,
        subjectCode: selectedSubjectCode !== 'ALL' ? selectedSubjectCode : undefined,
        fileName: entryMode === 'EXCEL' ? selectedFile?.name : 'Manual_Individual_Entry',
        courseCategory,
      });

      if (res.success) {
        toast.push(
          `Marks saved successfully! ${res.inserted || 0} inserted, ${res.updated || 0} updated.`,
          'success'
        );
        if (entryMode === 'EXCEL') {
          setParsedRows([]);
          setSelectedFile(null);
        }
        await loadHistory();
      } else if (res.errors && res.errors.length > 0) {
        setErrorMsg(`Validation error in row ${res.errors[0].row}: ${res.errors[0].message}`);
        toast.push(`Save failed: ${res.errors[0].message}`, 'danger');
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to import marks into database.';
      setErrorMsg(msg);
      toast.push(msg, 'danger');
    } finally {
      setIsImporting(false);
    }
  };

  const allNotifications = [
    ...notifications.exams,
    ...notifications.revaluations,
  ];

  const getHeaderTitle = () => {
    const categoryName = courseCategory === 'THEORY' ? 'Theory' : 'Lab';
    if (activeTab === 'INTERNAL') return `${categoryName} Internal Marks Entry`;
    if (activeTab === 'EXTERNAL') return `${categoryName} External Marks Entry`;
    if (activeTab === 'RESULT') return `${categoryName} Examination Results Entry`;
    if (activeTab === 'REVALUATION') return `${categoryName} Revaluation Results Entry`;
    return `${categoryName} Marks Entry`;
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Standard Site Page Header */}
      <PageHeader
        title="Marks Uploading & Processing"
        description="Select course type (Theory / Lab), examination notification, and choose upload or manual student entry mode."
      />

      {/* Primary Tier-1 Course Category Tabs: Theory vs Labs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-1.5 rounded-2xl bg-slate-100/80 border border-slate-200">
        <button
          type="button"
          onClick={() => handleCourseCategoryChange('THEORY')}
          className={`relative flex items-center justify-center gap-3 py-3 px-5 rounded-xl font-bold text-sm transition-all duration-200 cursor-pointer ${
            courseCategory === 'THEORY'
              ? 'bg-white text-sky-700 shadow-xs ring-2 ring-sky-500/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <svg className="w-5 h-5 text-sky-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <div className="text-left">
            <div className="leading-tight">Theory Subjects</div>
            <div className="text-[10px] font-normal text-slate-500">Internal, Exam Results & Revaluation</div>
          </div>
          {courseCategory === 'THEORY' && (
            <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-100 text-sky-800">
              Active
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => handleCourseCategoryChange('LAB')}
          className={`relative flex items-center justify-center gap-3 py-3 px-5 rounded-xl font-bold text-sm transition-all duration-200 cursor-pointer ${
            courseCategory === 'LAB'
              ? 'bg-white text-teal-700 shadow-xs ring-2 ring-teal-500/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <svg className="w-5 h-5 text-teal-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L5.6 15.12a2 2 0 00-1.022.547l-1.414 1.414A2 2 0 004.586 20.5h14.828a2 2 0 001.414-3.414l-1.414-1.414zM12 3v9m0 0l-3-3m3 3l3-3" />
          </svg>
          <div className="text-left">
            <div className="leading-tight">Labs & Practical</div>
            <div className="text-[10px] font-normal text-slate-500">Internal & External Practical Marks</div>
          </div>
          {courseCategory === 'LAB' && (
            <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-teal-100 text-teal-800">
              Active
            </span>
          )}
        </button>
      </div>

      {/* Secondary Tier-2 Sub-Tabs Navigation Bar (Contextual to selected Theory or Lab) */}
      <div className="flex rounded-xl bg-slate-100/80 p-1.5 border border-slate-200 gap-1 overflow-x-auto">
        {courseCategory === 'THEORY' ? (
          <>
            <button
              type="button"
              onClick={() => handleTabChange('INTERNAL')}
              className={`flex-1 min-w-[130px] flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs transition-all cursor-pointer ${
                activeTab === 'INTERNAL'
                  ? 'bg-white text-[var(--primary)] shadow-xs font-bold border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50 font-medium'
              }`}
            >
              Internal Marks
            </button>

            <button
              type="button"
              onClick={() => handleTabChange('RESULT')}
              className={`flex-1 min-w-[130px] flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs transition-all cursor-pointer ${
                activeTab === 'RESULT'
                  ? 'bg-white text-[var(--primary)] shadow-xs font-bold border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50 font-medium'
              }`}
            >
              Exam Results
            </button>

            <button
              type="button"
              onClick={() => handleTabChange('REVALUATION')}
              className={`flex-1 min-w-[130px] flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs transition-all cursor-pointer ${
                activeTab === 'REVALUATION'
                  ? 'bg-white text-[var(--primary)] shadow-xs font-bold border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50 font-medium'
              }`}
            >
              Revaluation Results
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => handleTabChange('INTERNAL')}
              className={`flex-1 min-w-[150px] flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs transition-all cursor-pointer ${
                activeTab === 'INTERNAL'
                  ? 'bg-white text-teal-700 shadow-xs font-bold border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50 font-medium'
              }`}
            >
              Internal Marks (Lab)
            </button>

            <button
              type="button"
              onClick={() => handleTabChange('EXTERNAL')}
              className={`flex-1 min-w-[150px] flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs transition-all cursor-pointer ${
                activeTab === 'EXTERNAL'
                  ? 'bg-white text-teal-700 shadow-xs font-bold border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50 font-medium'
              }`}
            >
              External Marks (Lab)
            </button>
          </>
        )}
      </div>

      {/* Error Alert Message */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg('')} className="text-rose-500 font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Main Container Card */}
      <Card>
        <CardHeader
          title={getHeaderTitle()}
          description="Select examination notification and choose upload or manual student entry mode."
          action={
            <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-100">
              <button
                type="button"
                onClick={() => setEntryMode('EXCEL')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  entryMode === 'EXCEL'
                    ? 'bg-white text-[var(--primary)] shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
              Excel / PDF Import
              </button>
              <button
                type="button"
                onClick={() => setEntryMode('INDIVIDUAL')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  entryMode === 'INDIVIDUAL'
                    ? 'bg-white text-[var(--primary)] shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
               Individual Student Inputs
              </button>
            </div>
          }
        />

        <CardBody className="space-y-6">
          {/* Single Row Filters Bar: Examination Notification + Target Branch + Subject Paper */}
          {loadingNotifications ? (
            <div className="py-6 text-center text-xs text-slate-500">
              Loading examination notifications...
            </div>
          ) : (
            <NotificationDropdownSelector
              notifications={allNotifications}
              selectedNotification={selectedNotification}
              onSelect={(item) => {
                setSelectedNotification(item);
                setParsedRows([]);
                setSelectedFile(null);
              }}
              activeTab={activeTab}
              courseCategory={courseCategory}
              branches={notificationBranches}
              selectedBranch={selectedBranch}
              onSelectBranch={setSelectedBranch}
              subjects={notificationSubjects}
              selectedSubjectCode={selectedSubjectCode}
              onSelectSubjectCode={setSelectedSubjectCode}
            />
          )}

          {/* Mode 1: Excel / PDF Upload */}
          {selectedNotification && entryMode === 'EXCEL' && (
            <div className="space-y-6 border-t border-slate-200 pt-6">
              <FileUploadZone
                activeTab={activeTab}
                onFileSelect={handleFileSelect}
                isLoading={isParsing}
                selectedFile={selectedFile}
                onClearFile={handleClearFile}
                subjects={categorySubjects}
                selectedSubjectCode={selectedSubjectCode}
              />

              {parsedRows.length > 0 && (
                <MarksPreviewGrid
                  activeTab={activeTab}
                  courseCategory={courseCategory}
                  subjects={notificationSubjects}
                  rows={parsedRows}
                  students={notificationStudents}
                  selectedBranch={selectedBranch}
                  selectedSubjectCode={selectedSubjectCode}
                  onUpdateRow={handleUpdateRow}
                  onRemoveRow={handleRemoveRow}
                  onImport={() => handleImportToDatabase()}
                  isImporting={isImporting}
                  onClear={handleClearFile}
                />
              )}
            </div>
          )}

          {/* Mode 2: Individual Student-Wise Marks Manual Entry */}
          {selectedNotification && entryMode === 'INDIVIDUAL' && (
            <div className="space-y-6 border-t border-slate-200 pt-6">
              {loadingDetails ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  Loading enrolled students and subjects...
                </div>
              ) : (
                <StudentIndividualEntryGrid
                  activeTab={activeTab}
                  students={notificationStudents}
                  subjects={categorySubjects}
                  branches={notificationBranches}
                  selectedBranch={selectedBranch}
                  selectedSubjectCode={selectedSubjectCode}
                  existingMarks={history?.records}
                  onSave={(rows) => handleImportToDatabase(rows)}
                  isSaving={isImporting}
                />
              )}
            </div>
          )}

          {/* Stored Marks History Database View */}
          {selectedNotification && (
            <div className="border-t border-slate-200 pt-6">
              <UploadedHistoryTable
                activeTab={activeTab}
                history={history}
                isLoading={loadingHistory}
                onRefresh={loadHistory}
              />
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
