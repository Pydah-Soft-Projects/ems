'use client';

import { ChangeEvent, DragEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import {
  MarksNotificationItem,
  MarksNotificationResponse,
  ParsedMarkRow,
  SemesterSubjectDetail,
  SemesterTotalMarksResponse,
  StudentSemesterTotalRecord,
} from '@/types/marks-upload';
import { Regulation } from '@/types/regulation';
import { SdmsCollege, SdmsCourse, SdmsBranch } from '@/types/sdms';
import { SubjectMappingEntry } from '@/types/subject';

import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { LoadingBlock } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { getStoredUser } from '@/lib/auth';
import { can } from '@/lib/permissions';

export default function StudentTotalMarksPage() {
  const toast = useToast();
  const user = getStoredUser();
  const canUpload = can(user, ['marks:upload', 'exams:results', 'exams:write']);

  // Master Academic Data
  const [regulations, setRegulations] = useState<Regulation[]>([]);
  const [colleges, setColleges] = useState<SdmsCollege[]>([]);
  const [courses, setCourses] = useState<SdmsCourse[]>([]);
  const [branches, setBranches] = useState<SdmsBranch[]>([]);
  const [notifications, setNotifications] = useState<MarksNotificationResponse>({ exams: [], revaluations: [] });
  const [loadingMasterData, setLoadingMasterData] = useState(true);

  // Selected Academic Scope State
  const [selectedBatch, setSelectedBatch] = useState<string>('2023-2027');
  const [selectedCollege, setSelectedCollege] = useState<string>('PYDAH COLLEGE OF ENGINEERING');
  const [selectedCourse, setSelectedCourse] = useState<string>('B.Tech');
  const [selectedBranch, setSelectedBranch] = useState<string>('CSE');
  const [selectedRegulationId, setSelectedRegulationId] = useState<number | null>(null);
  const [selectedYearOfStudy, setSelectedYearOfStudy] = useState<number>(1);
  const [selectedSemester, setSelectedSemester] = useState<number>(1);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);

  // Mapped Subjects from Scope
  const [scopeMappings, setScopeMappings] = useState<SubjectMappingEntry[]>([]);
  const [loadingMappings, setLoadingMappings] = useState(false);

  // Ledger Data State
  const [ledgerData, setLedgerData] = useState<SemesterTotalMarksResponse | null>(null);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Filtering & View Modes
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PASSED' | 'BACKLOGS' | 'PENDING'>('ALL');
  const [viewMode, setViewMode] = useState<'MATRIX' | 'CARDS'>('MATRIX');
  const [showSubjectsList, setShowSubjectsList] = useState(true);

  // PDF / Excel Parsing & Upload State
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedMarkRow[]>([]);
  const [isSavingParsed, setIsSavingParsed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Selected Student Modal / Drawer
  const [activeStudent, setActiveStudent] = useState<StudentSemesterTotalRecord | null>(null);

  // 1. Initial Load of Master Data (Regulations, Colleges, Courses, Exam Notifications)
  useEffect(() => {
    let isMounted = true;
    async function loadMaster() {
      setLoadingMasterData(true);
      try {
        const [regData, examData] = await Promise.all([
          api.getRegulations().catch(() => []),
          api.getMarksNotifications().catch(() => ({ exams: [], revaluations: [] })),
        ]);

        if (!isMounted) return;
        setRegulations(regData || []);
        setNotifications(examData);

        // Fetch colleges from SDMS or fallback from regulation scopes
        const collegeList = await api.getSdmsColleges(false).catch(() => []);
        if (isMounted) {
          if (collegeList && collegeList.length > 0) {
            setColleges(collegeList);
            setSelectedCollege(collegeList[0].name);
          } else if (regData && regData.length > 0) {
            const scopeColleges = new Map<string, SdmsCollege>();
            regData.forEach((r) => {
              (r.scopes || []).forEach((sc) => {
                if (sc.collegeName && !scopeColleges.has(sc.collegeName)) {
                  scopeColleges.set(sc.collegeName, {
                    id: sc.collegeId,
                    name: sc.collegeName,
                    code: null,
                    isActive: true,
                  });
                }
              });
            });
            const extracted = Array.from(scopeColleges.values());
            if (extracted.length > 0) {
              setColleges(extracted);
              setSelectedCollege(extracted[0].name);
            }
          }

          // Initial Regulation
          if (regData && regData.length > 0) {
            setSelectedRegulationId(regData[0].id);
          }
        }
      } catch (err) {
        if (isMounted) {
          setErrorMsg(err instanceof ApiError ? err.message : 'Failed to load master configuration.');
        }
      } finally {
        if (isMounted) setLoadingMasterData(false);
      }
    }

    void loadMaster();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Load Courses for Selected College
  useEffect(() => {
    let isMounted = true;
    async function loadCoursesForCollege() {
      const activeCol = colleges.find(
        (c) => c.name.toLowerCase() === selectedCollege.toLowerCase() || String(c.id) === selectedCollege
      );
      if (activeCol?.id) {
        try {
          const courseList = await api.getSdmsCourses(activeCol.id, false).catch(() => []);
          if (isMounted && courseList && courseList.length > 0) {
            setCourses(courseList);
            if (!courseList.some((c) => c.name.toLowerCase() === selectedCourse.toLowerCase())) {
              setSelectedCourse(courseList[0].name);
            }
            return;
          }
        } catch {}
      }

      // Fallback from Regulation scopes
      const fallbackCourses = new Set<string>();
      regulations.forEach((r) => {
        (r.scopes || []).forEach((sc) => {
          if (sc.courseName) fallbackCourses.add(sc.courseName);
        });
      });
      if (fallbackCourses.size > 0 && isMounted) {
        const dummyCourses: SdmsCourse[] = Array.from(fallbackCourses).map((cName, idx) => ({
          id: idx + 1,
          collegeId: activeCol?.id || 1,
          name: cName,
          code: null,
          level: 'UG',
          totalYears: 4,
          semestersPerYear: 2,
          isActive: true,
        }));
        setCourses(dummyCourses);
      }
    }

    void loadCoursesForCollege();
    return () => {
      isMounted = false;
    };
  }, [selectedCollege, colleges, regulations, selectedCourse]);

  // 3. Load Branches for Selected Course
  useEffect(() => {
    let isMounted = true;
    async function loadBranchesForCourse() {
      const activeCourse = courses.find((c) => c.name.toLowerCase() === selectedCourse.toLowerCase());
      if (activeCourse?.id) {
        try {
          const branchList = await api.getSdmsBranches(activeCourse.id, false).catch(() => []);
          if (isMounted && branchList && branchList.length > 0) {
            setBranches(branchList);
            if (!branchList.some((b) => b.name.toLowerCase() === selectedBranch.toLowerCase())) {
              setSelectedBranch(branchList[0].name);
            }
            return;
          }
        } catch {}
      }

      // Default standard branches
      const standardBranches: SdmsBranch[] = [
        { id: 1, courseId: 1, name: 'CSE', code: '05', isActive: true },
        { id: 2, courseId: 1, name: 'ECE', code: '04', isActive: true },
        { id: 3, courseId: 1, name: 'EEE', code: '02', isActive: true },
        { id: 4, courseId: 1, name: 'MECH', code: '03', isActive: true },
        { id: 5, courseId: 1, name: 'CIVIL', code: '01', isActive: true },
        { id: 6, courseId: 1, name: 'AI&DS', code: '54', isActive: true },
      ];
      if (isMounted) {
        setBranches(standardBranches);
      }
    }

    void loadBranchesForCourse();
    return () => {
      isMounted = false;
    };
  }, [selectedCourse, courses, selectedBranch]);

  // Available Batches / Academic Years
  const availableBatches = useMemo(() => {
    const batches = new Set<string>();
    // From regulations scopes
    regulations.forEach((r) => {
      (r.scopes || []).forEach((sc) => {
        if (sc.batch) batches.add(sc.batch);
      });
    });
    // From exam notifications
    notifications.exams.forEach((e) => {
      if (e.batch) batches.add(e.batch);
    });
    // Standard default batches
    ['2024-2028', '2023-2027', '2022-2026', '2021-2025', '2020-2024'].forEach((b) => batches.add(b));
    return Array.from(batches).sort((a, b) => b.localeCompare(a));
  }, [regulations, notifications]);

  // Smart Auto-selection of Regulation based on College + Course + Batch
  useEffect(() => {
    if (!selectedRegulationId && regulations.length > 0) {
      const matched = regulations.find((r) =>
        (r.scopes || []).some(
          (sc) =>
            (!selectedBatch || sc.batch === selectedBatch) &&
            (!selectedCourse || sc.courseName?.toLowerCase() === selectedCourse.toLowerCase())
        )
      );
      if (matched) {
        setSelectedRegulationId(matched.id);
      } else {
        setSelectedRegulationId(regulations[0].id);
      }
    }
  }, [selectedBatch, selectedCourse, regulations, selectedRegulationId]);

  // 4. Fetch Mapped Subjects directly from Subject Mapping API
  const loadScopeMappings = useCallback(async () => {
    if (!selectedRegulationId) return;
    setLoadingMappings(true);
    try {
      const maps = await api.getSubjectMappings({
        regulationId: selectedRegulationId,
        course: selectedCourse,
        branch: selectedBranch,
        batch: selectedBatch,
        yearOfStudy: selectedYearOfStudy,
        semester: selectedSemester,
      });
      setScopeMappings(maps || []);
    } catch {
      setScopeMappings([]);
    } finally {
      setLoadingMappings(false);
    }
  }, [selectedRegulationId, selectedCourse, selectedBranch, selectedBatch, selectedYearOfStudy, selectedSemester]);

  // 5. Fetch Semester Total Marks Ledger from Backend
  const loadLedger = useCallback(async () => {
    setLoadingLedger(true);
    setErrorMsg('');
    try {
      const res = await api.getSemesterTotalMarks({
        examId: selectedExamId || undefined,
        regulationId: selectedRegulationId || undefined,
        college: selectedCollege,
        course: selectedCourse,
        branch: selectedBranch,
        batch: selectedBatch,
        yearOfStudy: selectedYearOfStudy,
        semester: selectedSemester,
        search: searchQuery,
        status: statusFilter,
      });
      setLedgerData(res);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Failed to load semester marks ledger.');
      setLedgerData(null);
    } finally {
      setLoadingLedger(false);
    }
  }, [
    selectedExamId,
    selectedRegulationId,
    selectedCollege,
    selectedCourse,
    selectedBranch,
    selectedBatch,
    selectedYearOfStudy,
    selectedSemester,
    searchQuery,
    statusFilter,
  ]);

  useEffect(() => {
    void loadScopeMappings();
  }, [loadScopeMappings]);

  useEffect(() => {
    void loadLedger();
  }, [loadLedger]);

  // Merge mapped subjects from subject_mapping_entries with ledger semesterSubjects
  const semesterSubjects: SemesterSubjectDetail[] = useMemo(() => {
    const map = new Map<string, SemesterSubjectDetail>();

    // 1. First add from scopeMappings
    scopeMappings.forEach((sm) => {
      const s = sm.subject;
      if (!s || !s.code) return;
      const code = s.code.toUpperCase().trim();
      const rawType = String(s.type || '').toUpperCase();
      const isLab =
        rawType.includes('LAB') ||
        rawType.includes('PRACTICAL') ||
        rawType === 'P' ||
        code.endsWith('L') ||
        code.endsWith('P');

      const maxInt = Number(s.internalMarks ?? 30);
      const maxExt = Number(s.externalMarks ?? 70);
      const maxTot = Number(s.totalMarks ?? (maxInt + maxExt));
      const credits = Number(s.credits ?? 3);

      map.set(code, {
        id: s.id,
        code,
        name: s.name || code,
        type: isLab ? 'LAB' : (rawType || 'THEORY'),
        maxInternalMarks: maxInt,
        maxExternalMarks: maxExt,
        maxTotalMarks: maxTot,
        credits: credits > 0 ? credits : 3,
      });
    });

    // 2. Then merge from ledgerData if present
    if (ledgerData?.semesterSubjects) {
      ledgerData.semesterSubjects.forEach((sub) => {
        const code = sub.code.toUpperCase().trim();
        if (!map.has(code)) {
          map.set(code, sub);
        }
      });
    }

    return Array.from(map.values());
  }, [scopeMappings, ledgerData]);

  // Total Max Marks and Credits for the Semester
  const semesterTotalMaxMarks = useMemo(() => {
    return semesterSubjects.reduce((sum, s) => sum + (s.maxTotalMarks || 100), 0);
  }, [semesterSubjects]);

  const semesterTotalCredits = useMemo(() => {
    return semesterSubjects.reduce((sum, s) => sum + (s.credits || 0), 0);
  }, [semesterSubjects]);

  // Current selected regulation object
  const currentRegulation = useMemo(() => {
    return regulations.find((r) => r.id === selectedRegulationId) || null;
  }, [regulations, selectedRegulationId]);

  // PDF File Drop / Selection Handlers
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleFileSelected = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'xlsx', 'xls', 'csv'].includes(ext || '')) {
      toast.push('Please upload a valid PDF (.pdf) or Excel (.xlsx, .csv) document.', 'danger');
      return;
    }
    setUploadFile(file);
    setParsedRows([]);
  };

  // Run PDF / Excel Parsing Engine
  const handleParseFile = async () => {
    if (!uploadFile) return;
    setIsParsing(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      if (selectedExamId) {
        formData.append('notificationId', String(selectedExamId));
        formData.append('notificationType', 'EXAM');
      }
      formData.append('branch', selectedBranch);

      const res = await api.parseMarksFile(formData);
      if (res && Array.isArray(res.rows)) {
        setParsedRows(res.rows);
        toast.push(`Successfully parsed ${res.rowCount || res.rows.length} student subject marks records.`, 'success');
      } else {
        toast.push('No marks records could be identified in the uploaded document.', 'warning');
      }
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Failed to parse marksheet document.', 'danger');
    } finally {
      setIsParsing(false);
    }
  };

  // Save Parsed Marks to Database and Refresh Ledger
  const handleSaveParsedMarks = async () => {
    if (parsedRows.length === 0) return;
    setIsSavingParsed(true);
    try {
      const academicScope = {
        regulationId: selectedRegulationId,
        college: selectedCollege,
        course: selectedCourse,
        branch: selectedBranch,
        batch: selectedBatch,
        yearOfStudy: selectedYearOfStudy,
        semester: selectedSemester,
      };

      const res = await api.saveSemesterMarks(selectedExamId, parsedRows, academicScope);
      toast.push(res.message || `Successfully saved ${res.count} marks records!`, 'success');
      setParsedRows([]);
      setUploadFile(null);
      setShowUploadPanel(false);
      // Reload both mappings and ledger to reflect newly updated marks
      await Promise.all([loadScopeMappings(), loadLedger()]);
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Failed to update marks database.', 'danger');
    } finally {
      setIsSavingParsed(false);
    }
  };

  // Export to CSV / Excel
  const handleExportCSV = () => {
    if (!ledgerData || ledgerData.students.length === 0) return;

    const subjectsList = semesterSubjects;
    const headers = [
      'Sl. No',
      'Roll Number / PIN',
      'Student Name',
      'Branch',
      'Section',
      ...subjectsList.map((s) => `${s.code} (Int)`),
      ...subjectsList.map((s) => `${s.code} (Ext)`),
      ...subjectsList.map((s) => `${s.code} (Total)`),
      ...subjectsList.map((s) => `${s.code} (Grade)`),
      'Grand Total Secured',
      'Grand Total Max',
      'Percentage (%)',
      'Credits Earned',
      'Credits Total',
      'SGPA',
      'Status',
    ];

    const rows: string[][] = [];

    ledgerData.students.forEach((student, idx) => {
      const subMap = new Map<string, (typeof student.subjectMarks)[0]>();
      student.subjectMarks.forEach((sm) => subMap.set(sm.subjectCode.toUpperCase(), sm));

      const intCols = subjectsList.map((s) => {
        const sm = subMap.get(s.code.toUpperCase());
        return sm?.internalMarks !== null && sm?.internalMarks !== undefined ? String(sm.internalMarks) : '-';
      });

      const extCols = subjectsList.map((s) => {
        const sm = subMap.get(s.code.toUpperCase());
        if (sm?.isAbsent) return 'AB';
        return sm?.externalMarks !== null && sm?.externalMarks !== undefined ? String(sm.externalMarks) : '-';
      });

      const totCols = subjectsList.map((s) => {
        const sm = subMap.get(s.code.toUpperCase());
        return sm?.totalMarks !== null && sm?.totalMarks !== undefined ? String(sm.totalMarks) : '-';
      });

      const gradeCols = subjectsList.map((s) => {
        const sm = subMap.get(s.code.toUpperCase());
        return sm?.grade || '-';
      });

      rows.push([
        String(idx + 1),
        student.rollNumber,
        student.studentName || '',
        student.branch || '',
        student.section || '',
        ...intCols,
        ...extCols,
        ...totCols,
        ...gradeCols,
        String(student.totalMarksSecured),
        String(student.totalMaxMarks),
        `${student.percentage.toFixed(2)}%`,
        String(student.totalCreditsEarned),
        String(student.totalCreditsPossible),
        student.sgpa.toFixed(2),
        student.status,
      ]);
    });

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.map((val) => `"${val.replace(/"/g, '""')}"`).join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `semester_total_marks_${selectedCourse}_${selectedBranch}_${selectedYearOfStudy}-${selectedSemester}_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Quick Semester Pill Handler
  const setYearAndSem = (year: number, sem: number) => {
    setSelectedYearOfStudy(year);
    setSelectedSemester(sem);
  };

  const students = ledgerData?.students || [];
  const stats = ledgerData?.stats;

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          title="Student Semester Total Marks & Ledger"
          description="Academic Scope selection (College, Course, Branch, Year, Semester & Regulation) with full semester subjects mapping, student marks matrix, grand total calculation, and direct PDF marksheet parsing."
        />

        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 print:hidden">
          {canUpload && (
            <Button
              variant={showUploadPanel ? 'secondary' : 'primary'}
              onClick={() => setShowUploadPanel((prev) => !prev)}
            >
              <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {showUploadPanel ? 'Hide PDF Upload' : 'Upload & Parse PDF Marksheet'}
            </Button>
          )}

          <Button variant="secondary" onClick={handleExportCSV} disabled={students.length === 0}>
            <svg className="w-4 h-4 mr-1.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export CSV
          </Button>

          <Button variant="secondary" onClick={() => window.print()} disabled={students.length === 0}>
            <svg className="w-4 h-4 mr-1.5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print
          </Button>
        </div>
      </div>

      {errorMsg && <Alert tone="danger">{errorMsg}</Alert>}

      {/* PRIMARY ACADEMIC SCOPE SELECTOR */}
      <Card className="border-indigo-100 shadow-sm print:hidden">
        <CardHeader
          title="Academic Scope Selection"
          description="Select Academic Year / Batch, College, Course, Branch, Year of Study, and Semester to view mapped regulation subjects and student total marks ledger."
        />
        <CardBody className="space-y-4">
          {/* Row 1: Academic Year / Batch, College, Course, Branch */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Academic Year / Batch */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Academic Year / Batch
              </label>
              <select
                value={selectedBatch}
                onChange={(e) => setSelectedBatch(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:border-[var(--primary)]"
              >
                {availableBatches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            {/* College */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                College / Institution
              </label>
              <select
                value={selectedCollege}
                onChange={(e) => setSelectedCollege(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:border-[var(--primary)]"
              >
                {colleges.map((col) => (
                  <option key={col.id} value={col.name}>
                    {col.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Course / Programme */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Course / Programme
              </label>
              <select
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:border-[var(--primary)]"
              >
                {courses.map((crs) => (
                  <option key={crs.id} value={crs.name}>
                    {crs.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Branch / Department */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Branch / Department
              </label>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:border-[var(--primary)]"
              >
                {branches.map((br) => (
                  <option key={br.id} value={br.name}>
                    {br.name} {br.code ? `(${br.code})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Regulation, Year of Study, Semester & Quick Semester Pills */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end pt-2 border-t border-slate-100">
            {/* Regulation */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Academic Regulation
              </label>
              <select
                value={selectedRegulationId || ''}
                onChange={(e) => setSelectedRegulationId(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs font-bold text-indigo-700 rounded-lg border border-indigo-300 bg-indigo-50/30 focus:outline-hidden focus:border-[var(--primary)]"
              >
                {regulations.map((reg) => (
                  <option key={reg.id} value={reg.id}>
                    {reg.code} - {reg.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Year of Study */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Year of Study
              </label>
              <select
                value={selectedYearOfStudy}
                onChange={(e) => setSelectedYearOfStudy(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:border-[var(--primary)]"
              >
                <option value={1}>1st Year (I Year)</option>
                <option value={2}>2nd Year (II Year)</option>
                <option value={3}>3rd Year (III Year)</option>
                <option value={4}>4th Year (IV Year)</option>
              </select>
            </div>

            {/* Semester */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Semester
              </label>
              <select
                value={selectedSemester}
                onChange={(e) => setSelectedSemester(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:border-[var(--primary)]"
              >
                <option value={1}>Semester 1 (Odd)</option>
                <option value={2}>Semester 2 (Even)</option>
              </select>
            </div>

            {/* Quick Semester Selector Pills (1-1 to 4-2) */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Quick Sem Selector
              </label>
              <div className="grid grid-cols-4 gap-1">
                {[
                  { y: 1, s: 1, label: '1-1' },
                  { y: 1, s: 2, label: '1-2' },
                  { y: 2, s: 1, label: '2-1' },
                  { y: 2, s: 2, label: '2-2' },
                  { y: 3, s: 1, label: '3-1' },
                  { y: 3, s: 2, label: '3-2' },
                  { y: 4, s: 1, label: '4-1' },
                  { y: 4, s: 2, label: '4-2' },
                ].map((pill) => {
                  const isActive = selectedYearOfStudy === pill.y && selectedSemester === pill.s;
                  return (
                    <button
                      key={pill.label}
                      type="button"
                      onClick={() => setYearAndSem(pill.y, pill.s)}
                      className={`py-1 text-[11px] font-bold rounded text-center transition-all ${
                        isActive
                          ? 'bg-[var(--primary)] text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {pill.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Optional Linked Exam Notification Sync */}
          {notifications.exams.length > 0 && (
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-500">Or sync with active Exam Notification:</span>
                <select
                  value={selectedExamId || ''}
                  onChange={(e) => {
                    const id = e.target.value ? Number(e.target.value) : null;
                    setSelectedExamId(id);
                    if (id) {
                      const exam = notifications.exams.find((ex) => ex.id === id);
                      if (exam) {
                        if (exam.branch) setSelectedBranch(exam.branch);
                        if (exam.course) setSelectedCourse(exam.course);
                        if (exam.batch) setSelectedBatch(exam.batch);
                        if (exam.yearOfStudy) setSelectedYearOfStudy(exam.yearOfStudy);
                        if (exam.semester) setSelectedSemester(exam.semester);
                        if (exam.regulationId) setSelectedRegulationId(exam.regulationId);
                      }
                    }
                  }}
                  className="px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-300 bg-white"
                >
                  <option value="">-- Manual Academic Scope Selection --</option>
                  {notifications.exams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.title} {ex.regulationCode ? `[${ex.regulationCode}]` : ''} - Sem {ex.semester || '1'} ({ex.type})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Reg: {currentRegulation?.code || 'R20'}
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                  Sem: {selectedYearOfStudy}-{selectedSemester}
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Batch: {selectedBatch}
                </span>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* PDF / Excel Parsing Upload Section */}
      {showUploadPanel && canUpload && (
        <Card className="border-2 border-indigo-200 bg-indigo-50/20 print:hidden">
          <CardHeader
            title="Upload Marksheet & PDF Parsing Sheet"
            action={
              <button
                type="button"
                onClick={() => setShowUploadPanel(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕ Close
              </button>
            }
          />
          <CardBody className="space-y-4">
            <p className="text-xs text-slate-600">
              Upload university result sheet, JNTU grade tabulation sheet, or internal/external marks PDF. The parser
              will extract student PINs/Roll numbers, match all subjects mapped for{' '}
              <strong className="text-indigo-700">
                {selectedCourse} {selectedBranch} {selectedYearOfStudy}-{selectedSemester} ({currentRegulation?.code || 'Regulation'})
              </strong>
              , compute grand totals, and update the database with one click.
            </p>

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`p-6 border-2 border-dashed rounded-xl text-center transition-colors cursor-pointer ${
                isDragging
                  ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                  : uploadFile
                  ? 'border-emerald-400 bg-emerald-50/40'
                  : 'border-slate-300 bg-white hover:border-slate-400'
              }`}
            >
              <input
                type="file"
                id="marksheet-file-input"
                accept=".pdf,.xlsx,.xls,.csv"
                onChange={handleFileInputChange}
                className="hidden"
              />
              <label htmlFor="marksheet-file-input" className="cursor-pointer block">
                {uploadFile ? (
                  <div className="space-y-1">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                      📄 {uploadFile.name} ({(uploadFile.size / 1024).toFixed(1)} KB)
                    </span>
                    <p className="text-xs text-slate-500 mt-1">Click or drag another file to replace</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="w-10 h-10 mx-auto rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
                      PDF
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-[var(--primary)] hover:underline">
                        Choose a PDF or Excel marksheet
                      </span>
                      <span className="text-xs text-slate-500"> or drag and drop here</span>
                    </div>
                    <p className="text-[11px] text-slate-400">Supported formats: .pdf, .xlsx, .xls, .csv (Max 10MB)</p>
                  </div>
                )}
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  onClick={handleParseFile}
                  disabled={!uploadFile || isParsing}
                  loading={isParsing}
                >
                  {isParsing ? 'Parsing Document...' : 'Parse Marksheet File'}
                </Button>

                {uploadFile && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setUploadFile(null);
                      setParsedRows([]);
                    }}
                    disabled={isParsing || isSavingParsed}
                  >
                    Clear File
                  </Button>
                )}
              </div>

              {parsedRows.length > 0 && (
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-md">
                    ✓ {parsedRows.length} Rows Ready
                  </span>
                  <Button
                    variant="primary"
                    onClick={handleSaveParsedMarks}
                    disabled={isSavingParsed}
                    loading={isSavingParsed}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {isSavingParsed ? 'Saving to Database...' : 'Update Database with Parsed Marks'}
                  </Button>
                </div>
              )}
            </div>

            {/* Parsed Preview Table */}
            {parsedRows.length > 0 && (
              <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden bg-white">
                <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800">
                    Parsed Marksheet Preview ({parsedRows.length} rows extracted)
                  </h4>
                  <span className="text-[11px] text-slate-500">Review before updating database</span>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3">Roll No</th>
                        <th className="py-2 px-3">Student Name</th>
                        <th className="py-2 px-3">Subject Code</th>
                        <th className="py-2 px-3">Internal</th>
                        <th className="py-2 px-3">External</th>
                        <th className="py-2 px-3">Total</th>
                        <th className="py-2 px-3">Grade</th>
                        <th className="py-2 px-3">Credits</th>
                        <th className="py-2 px-3">Result</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parsedRows.slice(0, 50).map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-1.5 px-3 font-mono font-bold text-slate-900">{row.rollNumber}</td>
                          <td className="py-1.5 px-3 text-slate-700">{row.studentName || '-'}</td>
                          <td className="py-1.5 px-3 font-mono font-semibold text-sky-700">{row.subjectCode}</td>
                          <td className="py-1.5 px-3">{row.internalMarks ?? '-'}</td>
                          <td className="py-1.5 px-3">{row.isAbsent ? 'AB' : row.externalMarks ?? '-'}</td>
                          <td className="py-1.5 px-3 font-bold text-slate-900">{row.totalMarks ?? '-'}</td>
                          <td className="py-1.5 px-3 font-bold">{row.grade || '-'}</td>
                          <td className="py-1.5 px-3">{row.credits ?? '-'}</td>
                          <td className="py-1.5 px-3">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                row.passed !== false && row.grade !== 'F' && row.grade !== 'AB'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {row.result || (row.passed ? 'P' : 'F')}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parsedRows.length > 50 && (
                  <p className="px-4 py-1.5 text-[11px] text-slate-500 bg-slate-50 border-t border-slate-200">
                    Showing first 50 of {parsedRows.length} extracted records.
                  </p>
                )}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* COMPLETE SHOWING OF SEMESTER SUBJECTS MAPPED TO THIS REGULATION & SCOPE */}
      <Card>
        <CardHeader
          title={`Mapped Subjects for Regulation ${currentRegulation?.code || ''} (${semesterSubjects.length} Subjects)`}
          description={`Scope: ${selectedCollege} • ${selectedCourse} • ${selectedBranch} • Sem ${selectedYearOfStudy}-${selectedSemester} (${selectedBatch}) • Max: ${semesterTotalMaxMarks} Marks • Credits: ${semesterTotalCredits}`}
          action={
            <button
              type="button"
              onClick={() => setShowSubjectsList((prev) => !prev)}
              className="text-xs font-bold text-[var(--primary)] hover:underline print:hidden"
            >
              {showSubjectsList ? 'Collapse Subjects' : 'Expand Subjects'}
            </button>
          }
        />
        {showSubjectsList && (
          <CardBody className="pt-0">
            {loadingMappings ? (
              <div className="py-6 text-center text-xs text-slate-500">Loading mapped subjects...</div>
            ) : semesterSubjects.length === 0 ? (
              <div className="py-6 text-center border border-dashed border-slate-200 rounded-lg">
                <p className="text-xs font-semibold text-slate-600">
                  No subjects mapped yet for Regulation {currentRegulation?.code || ''} in {selectedCourse} {selectedBranch} Semester {selectedYearOfStudy}-{selectedSemester}.
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  You can map subjects in Academic Setup → Subjects Mapping or upload via marksheet.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border border-slate-200 rounded-lg overflow-hidden">
                  <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Subject Code</th>
                      <th className="py-2.5 px-3">Subject Name</th>
                      <th className="py-2.5 px-3">Course Type</th>
                      <th className="py-2.5 px-3 text-center">Max Internal</th>
                      <th className="py-2.5 px-3 text-center">Max External</th>
                      <th className="py-2.5 px-3 text-center">Max Total</th>
                      <th className="py-2.5 px-3 text-center">Credits</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {semesterSubjects.map((sub) => (
                      <tr key={sub.code} className="hover:bg-slate-50/70">
                        <td className="py-2 px-3 font-mono font-bold text-sky-700">{sub.code}</td>
                        <td className="py-2 px-3 font-medium text-slate-900">{sub.name}</td>
                        <td className="py-2 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              sub.type === 'LAB' ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {sub.type}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center text-slate-600">{sub.maxInternalMarks}</td>
                        <td className="py-2 px-3 text-center text-slate-600">{sub.maxExternalMarks}</td>
                        <td className="py-2 px-3 text-center font-bold text-slate-900">{sub.maxTotalMarks}</td>
                        <td className="py-2 px-3 text-center font-semibold text-slate-700">{sub.credits}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        )}
      </Card>

      {/* Batch Performance Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Total Students</span>
            <p className="text-xl font-bold text-slate-900 mt-0.5">{stats.totalStudents}</p>
          </div>

          <div className="p-3 rounded-xl bg-sky-50/60 border border-sky-200 shadow-2xs">
            <span className="text-[10px] font-bold text-sky-700 uppercase tracking-wider block">Marks Uploaded</span>
            <p className="text-xl font-bold text-sky-800 mt-0.5">{stats.evaluatedStudents}</p>
          </div>

          <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 shadow-2xs">
            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">All Clear</span>
            <p className="text-xl font-bold text-emerald-800 mt-0.5">{stats.passedStudents}</p>
          </div>

          <div className="p-3 rounded-xl bg-rose-50/70 border border-rose-200 shadow-2xs">
            <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider block">Backlogs</span>
            <p className="text-xl font-bold text-rose-800 mt-0.5">{stats.backlogStudents}</p>
          </div>

          <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 shadow-2xs">
            <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">Pending</span>
            <p className="text-xl font-bold text-amber-800 mt-0.5">{stats.pendingStudents}</p>
          </div>

          <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200 shadow-2xs">
            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Pass %</span>
            <p className="text-xl font-bold text-emerald-700 mt-0.5">{stats.passPercentage}%</p>
          </div>

          <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-200 shadow-2xs">
            <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider block">Highest Total</span>
            <p className="text-xl font-bold text-indigo-800 mt-0.5">{stats.highestTotalMarks}</p>
          </div>

          <div className="p-3 rounded-xl bg-purple-50/60 border border-purple-200 shadow-2xs">
            <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider block">Average SGPA</span>
            <p className="text-xl font-bold text-purple-800 mt-0.5">{stats.averageSgpa}</p>
          </div>
        </div>
      )}

      {/* Main Student Total Marks Tabulation Sheet */}
      <Card>
        <CardHeader
          title="Student-Wise Semester Total Marks Tabulation Sheet"
          description={`Showing marks for ${selectedCourse} • ${selectedBranch} • Sem ${selectedYearOfStudy}-${selectedSemester} (${selectedBatch})`}
          action={
            <div className="flex items-center gap-2 print:hidden">
              <button
                type="button"
                onClick={() => setViewMode('MATRIX')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                  viewMode === 'MATRIX' ? 'bg-[var(--primary)] text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                Semester Matrix Sheet
              </button>
              <button
                type="button"
                onClick={() => setViewMode('CARDS')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                  viewMode === 'CARDS' ? 'bg-[var(--primary)] text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                Student Cards
              </button>
            </div>
          }
        />
        <CardBody className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 print:hidden">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="Search by PIN / Roll Number or Name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:border-[var(--primary)]"
              />
              <svg
                className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center rounded-lg border border-slate-300 bg-slate-50 p-0.5 text-xs">
                {(['ALL', 'PASSED', 'BACKLOGS', 'PENDING'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                      statusFilter === st ? 'bg-white shadow-2xs text-slate-900' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Results Display */}
          {loadingLedger ? (
            <div className="py-12">
              <LoadingBlock label="Loading semester total marks sheet..." />
            </div>
          ) : students.length === 0 ? (
            <EmptyState
              title="No student records found in this scope"
              description={`No students found for ${selectedCourse} ${selectedBranch} batch ${selectedBatch}. You can upload marks using the button above to import students and marks directly.`}
            />
          ) : viewMode === 'MATRIX' ? (
            /* Mode 1: Comprehensive Multi-Column Tabulation Matrix */
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
              <div className="max-h-[650px] overflow-x-auto overflow-y-auto">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="sticky top-0 bg-slate-100 text-slate-700 font-bold border-b border-slate-300 shadow-xs z-10">
                    <tr>
                      <th className="py-2.5 px-3 border-r border-slate-200">#</th>
                      <th className="py-2.5 px-3 border-r border-slate-200">Student PIN / Roll</th>
                      <th className="py-2.5 px-3 border-r border-slate-200">Student Name</th>
                      <th className="py-2.5 px-3 border-r border-slate-200">Branch</th>

                      {/* Dynamic Columns for each Semester Subject */}
                      {semesterSubjects.map((sub) => (
                        <th
                          key={sub.code}
                          className="py-2.5 px-3 text-center border-r border-slate-200 bg-slate-100/90"
                          title={`${sub.name} (Max: ${sub.maxTotalMarks})`}
                        >
                          <div>{sub.code}</div>
                          <div className="text-[10px] font-normal text-slate-500">/{sub.maxTotalMarks}</div>
                        </th>
                      ))}

                      <th className="py-2.5 px-3 text-center bg-indigo-50 border-r border-indigo-200 text-indigo-900">
                        Grand Total
                      </th>
                      <th className="py-2.5 px-3 text-center bg-indigo-50 border-r border-indigo-200 text-indigo-900">
                        %
                      </th>
                      <th className="py-2.5 px-3 text-center bg-sky-50 border-r border-sky-200 text-sky-900">
                        Credits
                      </th>
                      <th className="py-2.5 px-3 text-center bg-purple-50 border-r border-purple-200 text-purple-900">
                        SGPA
                      </th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {students.map((student, idx) => {
                      const subMap = new Map<string, (typeof student.subjectMarks)[0]>();
                      student.subjectMarks.forEach((sm) => subMap.set(sm.subjectCode.toUpperCase(), sm));

                      return (
                        <tr
                          key={student.rollNumber}
                          onClick={() => setActiveStudent(student)}
                          className="hover:bg-slate-50/90 cursor-pointer transition-colors"
                        >
                          <td className="py-2 px-3 border-r border-slate-200 text-slate-400 font-mono text-[11px]">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 font-mono font-bold text-slate-900">
                            {student.rollNumber}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 font-medium text-slate-800">
                            {student.studentName || '-'}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 text-slate-600">
                            {student.branch || '-'}
                          </td>

                          {/* Subject Marks Cells */}
                          {semesterSubjects.map((sub) => {
                            const sm = subMap.get(sub.code.toUpperCase());
                            if (!sm || (sm.totalMarks === null && sm.internalMarks === null && !sm.isAbsent)) {
                              return (
                                <td
                                  key={sub.code}
                                  className="py-2 px-3 text-center border-r border-slate-200 text-slate-300"
                                >
                                  -
                                </td>
                              );
                            }

                            const isFail = sm.passed === false || sm.grade === 'F' || sm.grade === 'AB' || sm.isAbsent;

                            return (
                              <td
                                key={sub.code}
                                className={`py-2 px-3 text-center border-r border-slate-200 ${
                                  isFail ? 'bg-rose-50/70 text-rose-800 font-bold' : 'text-slate-800'
                                }`}
                              >
                                {sm.isAbsent ? (
                                  <span className="text-rose-600 font-bold">AB</span>
                                ) : (
                                  <div className="inline-flex items-center gap-1">
                                    <span className="font-semibold">{sm.totalMarks}</span>
                                    {sm.grade && (
                                      <span
                                        className={`text-[10px] font-bold px-1 rounded ${
                                          isFail ? 'bg-rose-200 text-rose-900' : 'bg-slate-100 text-slate-700'
                                        }`}
                                      >
                                        {sm.grade}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                            );
                          })}

                          {/* Grand Total */}
                          <td className="py-2 px-3 text-center font-bold text-indigo-700 bg-indigo-50/40 border-r border-indigo-100">
                            {student.hasMarks ? (
                              <span>
                                {student.totalMarksSecured}{' '}
                                <span className="text-[10px] font-normal text-slate-500">
                                  / {student.totalMaxMarks}
                                </span>
                              </span>
                            ) : (
                              <span className="text-slate-400 font-normal">Pending</span>
                            )}
                          </td>

                          {/* Percentage */}
                          <td className="py-2 px-3 text-center font-bold text-indigo-800 bg-indigo-50/40 border-r border-indigo-100">
                            {student.hasMarks ? `${student.percentage}%` : '-'}
                          </td>

                          {/* Credits */}
                          <td className="py-2 px-3 text-center font-semibold text-sky-800 bg-sky-50/40 border-r border-sky-100">
                            {student.totalCreditsEarned} / {student.totalCreditsPossible}
                          </td>

                          {/* SGPA */}
                          <td className="py-2 px-3 text-center font-bold text-purple-700 bg-purple-50/40 border-r border-purple-100">
                            {student.hasMarks ? student.sgpa : '-'}
                          </td>

                          {/* Status */}
                          <td className="py-2 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                student.status === 'PASSED'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : student.status === 'BACKLOGS'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {student.status === 'BACKLOGS' ? `BACKLOG (${student.backlogs})` : student.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Mode 2: Student Card View */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {students.map((student) => (
                <div
                  key={student.rollNumber}
                  onClick={() => setActiveStudent(student)}
                  className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs hover:border-[var(--primary)] transition-all cursor-pointer space-y-3"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 font-mono">{student.rollNumber}</h4>
                      {student.studentName && <p className="text-xs text-slate-600">{student.studentName}</p>}
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-md text-xs font-bold ${
                        student.status === 'PASSED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : student.status === 'BACKLOGS'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {student.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-center text-xs py-1 bg-slate-50 rounded-lg">
                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 block uppercase">Total Marks</span>
                      <span className="font-bold text-indigo-700">
                        {student.totalMarksSecured} / {student.totalMaxMarks}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 block uppercase">Percentage</span>
                      <span className="font-bold text-indigo-700">{student.percentage}%</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 block uppercase">SGPA</span>
                      <span className="font-bold text-purple-700">{student.sgpa}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 block uppercase">Credits</span>
                      <span className="font-bold text-sky-700">
                        {student.totalCreditsEarned} / {student.totalCreditsPossible}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Subject Marks Breakdown
                    </span>
                    <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto">
                      {student.subjectMarks.map((sm) => (
                        <div
                          key={sm.subjectCode}
                          className="px-2 py-1 bg-slate-50 rounded text-[11px] flex items-center justify-between"
                        >
                          <span className="font-mono font-bold text-slate-700">{sm.subjectCode}:</span>
                          <span className="font-semibold text-slate-900">
                            {sm.isAbsent ? 'AB' : sm.totalMarks !== null ? `${sm.totalMarks} (${sm.grade || 'P'})` : '-'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Student Marks Memo Detail Modal */}
      {activeStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-4 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Student Semester Marks Memo</h3>
                <p className="text-xs text-slate-600">
                  {activeStudent.rollNumber} {activeStudent.studentName ? `• ${activeStudent.studentName}` : ''}{' '}
                  {activeStudent.branch ? `• Branch: ${activeStudent.branch}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveStudent(null)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1 text-base"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl text-center">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Grand Total Marks</span>
                  <p className="text-base font-bold text-indigo-700 mt-0.5">
                    {activeStudent.totalMarksSecured} / {activeStudent.totalMaxMarks}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Percentage</span>
                  <p className="text-base font-bold text-indigo-700 mt-0.5">{activeStudent.percentage}%</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">SGPA</span>
                  <p className="text-base font-bold text-purple-700 mt-0.5">{activeStudent.sgpa}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Status</span>
                  <p
                    className={`text-sm font-bold mt-1 ${
                      activeStudent.status === 'PASSED' ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {activeStudent.status}
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Subject Code & Name</th>
                      <th className="py-2.5 px-3 text-center">Internal</th>
                      <th className="py-2.5 px-3 text-center">External</th>
                      <th className="py-2.5 px-3 text-center">Total</th>
                      <th className="py-2.5 px-3 text-center">Grade</th>
                      <th className="py-2.5 px-3 text-center">Credits</th>
                      <th className="py-2.5 px-3 text-center">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeStudent.subjectMarks.map((sm) => {
                      const isFail = sm.passed === false || sm.grade === 'F' || sm.grade === 'AB' || sm.isAbsent;
                      return (
                        <tr key={sm.subjectCode} className="hover:bg-slate-50">
                          <td className="py-2 px-3">
                            <span className="font-mono font-bold text-sky-700 mr-2">{sm.subjectCode}</span>
                            <span className="text-slate-800">{sm.subjectName}</span>
                          </td>
                          <td className="py-2 px-3 text-center text-slate-600">
                            {sm.internalMarks !== null ? `${sm.internalMarks} / ${sm.maxInternalMarks}` : '-'}
                          </td>
                          <td className="py-2 px-3 text-center text-slate-600">
                            {sm.isAbsent ? (
                              <span className="text-rose-600 font-bold">AB</span>
                            ) : sm.externalMarks !== null ? (
                              `${sm.externalMarks} / ${sm.maxExternalMarks}`
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="py-2 px-3 text-center font-bold text-slate-900">
                            {sm.totalMarks !== null ? `${sm.totalMarks} / ${sm.maxTotalMarks}` : '-'}
                          </td>
                          <td className="py-2 px-3 text-center font-bold">{sm.grade || '-'}</td>
                          <td className="py-2 px-3 text-center text-slate-700">{sm.credits}</td>
                          <td className="py-2 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                !isFail ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {!isFail ? 'PASS' : 'FAIL'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <Button variant="secondary" onClick={() => setActiveStudent(null)}>
                Close Memo
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
