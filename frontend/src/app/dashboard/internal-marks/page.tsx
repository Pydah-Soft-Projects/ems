'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { MarksNotificationItem } from '@/types/marks-upload';
import { EmsUser } from '@/types/user-management';

interface RegulationOption {
  id: number;
  code: string;
  name: string;
}

interface ActiveExamColumn {
  id: number;
  title: string;
  type: string;
}

interface StudentSubjectExamMark {
  examId: number;
  examTitle: string;
  isEligible: boolean;
  isEntered: boolean;
  isAbsent: boolean;
  marksObtained: number | null;
  maxMarks: number;
  lockStatus?: 'Locked' | 'Unlocked';
  deadline?: string | null;
}

interface StudentSubjectRow {
  subjectCode: string;
  subjectName: string;
  examMarks: Record<number, StudentSubjectExamMark>;
  totalMarksObtained: number;
  totalMaxMarks: number;
  examsEnteredCount: number;
  examsEligibleCount: number;
}

interface GroupedStudentData {
  studentRollNumber: string;
  studentName: string;
  academicYear: string;
  yearOfStudy: number;
  semester: number;
  branch: string;
  section: string;
  subjects: StudentSubjectRow[];
  totalStudentMarks: number;
  totalStudentMaxMarks: number;
  totalExamsEntered: number;
  totalExamsExpected: number;
}

interface FacultySubjectAccessRow {
  examId: number;
  examTitle: string;
  examType: string;
  subjectId: number;
  subjectCode: string;
  subjectName: string;
  branch: string;
  maxMarks: number;
  examDate: string | null;
  examDateFormatted?: string;
  marksEntryDeadline: string;
  isLocked: boolean;
  lockStatus: 'Locked' | 'Unlocked';
  isExpired: boolean;
  isUpcoming: boolean;
  isManuallyUnlocked: boolean;
  lockReason?: string;
  facultyName?: string | null;
  facultyEmail?: string | null;
  unlockedBy?: string | null;
  unlockedAt?: string | null;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function csvValue(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function calculateInternalMarks(subject: StudentSubjectRow, exams: ActiveExamColumn[]) {
  const enteredMarks = exams.flatMap((exam) => {
    const mark = subject.examMarks[exam.id];
    if (!mark?.isEligible || !mark.isEntered) return [];
    const marksObtained = mark.isAbsent ? 0 : mark.marksObtained;
    if (marksObtained === null || mark.maxMarks <= 0) return [];
    return [(marksObtained / mark.maxMarks) * 30];
  });

  if (enteredMarks.length < 2) return null;

  enteredMarks.sort((a, b) => b - a);
  return Number((enteredMarks[0] * 0.8 + enteredMarks[1] * 0.2).toFixed(2));
}

function getStudentCalculatedTotal(student: GroupedStudentData, exams: ActiveExamColumn[]) {
  if (student.subjects.length === 0) return null;

  const calculatedMarks = student.subjects.map((subject) =>
    calculateInternalMarks(subject, exams),
  );
  const completedMarks = calculatedMarks.filter(
    (marks): marks is number => marks !== null,
  );
  if (completedMarks.length !== calculatedMarks.length) return null;

  const total = completedMarks.reduce((sum, marks) => sum + marks, 0);
  return { obtained: Number(total.toFixed(2)), maximum: student.subjects.length * 30 };
}

export default function InternalMarksManagementPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'marks' | 'faculty-unlocks'>('marks');
  const [notifications, setNotifications] = useState<MarksNotificationItem[]>([]);
  const [selectedRegulationId, setSelectedRegulationId] = useState<number | null>(null);
  const [students, setStudents] = useState<GroupedStudentData[]>([]);
  const [allRegulationBranches, setAllRegulationBranches] = useState<string[]>([]);
  const [facultyAccessRows, setFacultyAccessRows] = useState<FacultySubjectAccessRow[]>([]);
  const [facultyUsers, setFacultyUsers] = useState<EmsUser[]>([]);
  const [facultyStatusFilter, setFacultyStatusFilter] = useState<'ALL' | 'LOCKED' | 'OPEN' | 'UPCOMING' | 'UNLOCKED'>('ALL');

  const [loadingNotifications, setLoadingNotifications] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('ALL');
  const [selectedSection, setSelectedSection] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Unlock Modal State
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const [unlockExamId, setUnlockExamId] = useState<number | null>(null);
  const [unlockSubjectCode, setUnlockSubjectCode] = useState<string>('ALL');
  const [selectedFacultyOption, setSelectedFacultyOption] = useState<string>(''); // user id, 'CUSTOM', or ''
  const [customFacultyName, setCustomFacultyName] = useState<string>('');
  const [customFacultyEmail, setCustomFacultyEmail] = useState<string>('');
  const [unlockReason, setUnlockReason] = useState('');
  const [submittingUnlock, setSubmittingUnlock] = useState(false);

  // Load faculty users for assignment dropdown
  useEffect(() => {
    void api
      .getEmsUsers({ limit: 100 })
      .then((res) => {
        if (Array.isArray(res?.items)) {
          setFacultyUsers(res.items);
        }
      })
      .catch(() => undefined);
  }, []);

  const loadNotifications = useCallback(async () => {
    setLoadingNotifications(true);
    setErrorMessage('');
    try {
      const response = await api.getMarksNotifications();
      const internalNotifications = (response.exams || []).filter(
        (notification) =>
          notification.examCategory === 'INTERNAL' &&
          typeof notification.regulationId === 'number',
      );
      setNotifications(internalNotifications);
      setSelectedRegulationId((current) =>
        current !== null &&
        internalNotifications.some((notification) => notification.regulationId === current)
          ? current
          : internalNotifications[0]?.regulationId ?? null,
      );
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Failed to fetch internal examination notifications.'));
    } finally {
      setLoadingNotifications(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const regulations = useMemo(() => {
    const options = new Map<number, RegulationOption>();
    for (const notification of notifications) {
      const regulationId = notification.regulationId;
      if (typeof regulationId !== 'number' || options.has(regulationId)) continue;
      options.set(regulationId, {
        id: regulationId,
        code: notification.regulationCode || `Regulation ${regulationId}`,
        name: notification.regulationName || '',
      });
    }
    return Array.from(options.values()).sort((a, b) =>
      a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }),
    );
  }, [notifications]);

  const selectedRegulation = regulations.find(
    (regulation) => regulation.id === selectedRegulationId,
  );

  // Distinct active internal examinations for this regulation
  const activeExams = useMemo<ActiveExamColumn[]>(() => {
    if (selectedRegulationId === null) return [];
    const list = notifications.filter(
      (notification) => notification.regulationId === selectedRegulationId,
    );
    return list.map((n) => ({
      id: n.id,
      title: n.title,
      type: n.type || 'REGULAR',
    }));
  }, [notifications, selectedRegulationId]);

  useEffect(() => {
    if (selectedRegulationId === null) {
      setStudents([]);
      setAllRegulationBranches([]);
      setFacultyAccessRows([]);
      setLoadingRows(false);
      return;
    }

    const regulationNotifications = notifications.filter(
      (notification) => notification.regulationId === selectedRegulationId,
    );
    if (regulationNotifications.length === 0) {
      setStudents([]);
      setAllRegulationBranches([]);
      setFacultyAccessRows([]);
      setLoadingRows(false);
      return;
    }

    let cancelled = false;
    setLoadingRows(true);
    setErrorMessage('');

    void Promise.all(
      regulationNotifications.map(async (notification) => ({
        notification,
        overview: await api.getInternalMarksOverview(notification.id),
      })),
    )
      .then((results) => {
        if (cancelled) return;

        const branchSet = new Set<string>();
        const accessList: FacultySubjectAccessRow[] = [];

        const studentMap = new Map<
          string,
          {
            studentRollNumber: string;
            studentName: string;
            academicYear: string;
            yearOfStudy: number;
            semester: number;
            branch: string;
            section: string;
            subjectsMap: Map<string, StudentSubjectRow>;
          }
        >();

        for (const { notification, overview } of results) {
          // Accumulate all scoped branches across notifications
          for (const b of overview.branches || []) {
            if (b && b.toUpperCase() !== 'ALL') branchSet.add(b);
          }

          // Accumulate faculty subject access rows
          for (const sub of overview.subjects || []) {
            let isUpcoming = Boolean(sub.isUpcoming);
            let examDateFormatted = sub.examDateFormatted;
            if (sub.examDate) {
              const match = String(sub.examDate).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
              if (match) {
                const [, y, m, d] = match;
                if (!examDateFormatted) examDateFormatted = `${d}/${m}/${y}`;
                const examStartMs = new Date(`${y}-${m}-${d}T00:00:00.000+05:30`).getTime();
                if (typeof sub.isUpcoming !== 'boolean') {
                  isUpcoming = Date.now() < examStartMs;
                }
              }
            }

            accessList.push({
              examId: notification.id,
              examTitle: notification.title,
              examType: notification.type || 'REGULAR',
              subjectId: sub.subjectId,
              subjectCode: sub.subjectCode,
              subjectName: sub.subjectName,
              branch: sub.branch || notification.branch || 'ALL',
              maxMarks: sub.maxMarks,
              examDate: sub.examDate,
              examDateFormatted: examDateFormatted || sub.examDate || '',
              marksEntryDeadline: sub.marksEntryDeadline,
              isLocked: sub.isLocked,
              lockStatus: sub.lockStatus,
              isExpired: sub.isExpired,
              isUpcoming,
              isManuallyUnlocked: sub.isManuallyUnlocked,
              lockReason: isUpcoming ? `Opens on ${examDateFormatted}` : sub.lockReason,
              facultyName: sub.facultyName || null,
              facultyEmail: sub.facultyEmail || null,
              unlockedBy: sub.unlockedBy || null,
              unlockedAt: sub.unlockedAt || null,
            });
          }

          // Process student marks
          for (const entry of overview.studentEntries) {
            const studentKey = entry.studentRollNumber.trim().toLowerCase();
            if (!studentMap.has(studentKey)) {
              studentMap.set(studentKey, {
                studentRollNumber: entry.studentRollNumber,
                studentName: entry.studentName,
                academicYear: entry.academicYear,
                yearOfStudy: entry.yearOfStudy,
                semester: entry.semester,
                branch: entry.branch,
                section: entry.section,
                subjectsMap: new Map<string, StudentSubjectRow>(),
              });
            }

            const studentObj = studentMap.get(studentKey)!;
            const subjectKey = entry.subjectCode.trim().toUpperCase();

            if (!studentObj.subjectsMap.has(subjectKey)) {
              studentObj.subjectsMap.set(subjectKey, {
                subjectCode: entry.subjectCode,
                subjectName: entry.subjectName,
                examMarks: {},
                totalMarksObtained: 0,
                totalMaxMarks: 0,
                examsEnteredCount: 0,
                examsEligibleCount: 0,
              });
            }

            const subjectObj = studentObj.subjectsMap.get(subjectKey)!;

            if (!subjectObj.examMarks[notification.id]) {
              const maxMarks = Number(entry.maxMarks) || 30;
              const isEntered = Boolean(entry.isEntered);
              const isAbsent = Boolean(entry.isAbsent);
              const marksObtained =
                isEntered && !isAbsent && entry.marksObtained !== null
                  ? Number(entry.marksObtained)
                  : null;

              subjectObj.examMarks[notification.id] = {
                examId: notification.id,
                examTitle: notification.title,
                isEligible: true,
                isEntered,
                isAbsent,
                marksObtained,
                maxMarks,
                lockStatus: entry.lockStatus,
                deadline: entry.deadline,
              };

              subjectObj.totalMaxMarks += maxMarks;
              subjectObj.examsEligibleCount += 1;
              if (isEntered) {
                subjectObj.examsEnteredCount += 1;
                if (marksObtained !== null) {
                  subjectObj.totalMarksObtained += marksObtained;
                }
              }
            }
          }
        }

        const studentList: GroupedStudentData[] = Array.from(studentMap.values()).map((st) => {
          const subjects = Array.from(st.subjectsMap.values()).sort((a, b) =>
            a.subjectCode.localeCompare(b.subjectCode),
          );

          let totalStudentMarks = 0;
          let totalStudentMaxMarks = 0;
          let totalExamsEntered = 0;
          let totalExamsExpected = 0;

          for (const sub of subjects) {
            totalStudentMarks += sub.totalMarksObtained;
            totalStudentMaxMarks += sub.totalMaxMarks;
            totalExamsEntered += sub.examsEnteredCount;
            totalExamsExpected += sub.examsEligibleCount;
          }

          return {
            studentRollNumber: st.studentRollNumber,
            studentName: st.studentName,
            academicYear: st.academicYear,
            yearOfStudy: st.yearOfStudy,
            semester: st.semester,
            branch: st.branch,
            section: st.section,
            subjects,
            totalStudentMarks,
            totalStudentMaxMarks,
            totalExamsEntered,
            totalExamsExpected,
          };
        });

        studentList.sort((a, b) =>
          a.studentRollNumber.localeCompare(b.studentRollNumber, undefined, {
            numeric: true,
            sensitivity: 'base',
          }),
        );

        setStudents(studentList);
        setAllRegulationBranches(Array.from(branchSet));
        setFacultyAccessRows(accessList);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStudents([]);
        setAllRegulationBranches([]);
        setFacultyAccessRows([]);
        setErrorMessage(getErrorMessage(error, 'Failed to load internal marks for this regulation.'));
      })
      .finally(() => {
        if (!cancelled) setLoadingRows(false);
      });

    return () => {
      cancelled = true;
    };
  }, [notifications, selectedRegulationId]);

  // Combined branches from regulation scopes and students
  const availableBranches = useMemo(() => {
    const combined = new Set<string>();
    for (const b of allRegulationBranches) {
      if (b && b !== 'ALL') combined.add(b);
    }
    for (const st of students) {
      if (st.branch && st.branch !== '-') combined.add(st.branch);
    }
    return Array.from(combined).sort();
  }, [allRegulationBranches, students]);

  const availableSections = useMemo(
    () =>
      Array.from(
        new Set(students.map((st) => st.section).filter((section) => section && section !== '-')),
      ).sort(),
    [students],
  );

  const filteredStudents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return students.filter((student) => {
      if (selectedBranch !== 'ALL' && student.branch.toUpperCase() !== selectedBranch.toUpperCase()) {
        return false;
      }
      if (selectedSection !== 'ALL' && student.section.toUpperCase() !== selectedSection.toUpperCase()) {
        return false;
      }
      if (!query) return true;
      const matchesStudent =
        student.studentRollNumber.toLowerCase().includes(query) ||
        student.studentName.toLowerCase().includes(query) ||
        student.branch.toLowerCase().includes(query);
      if (matchesStudent) return true;

      return student.subjects.some(
        (sub) =>
          sub.subjectCode.toLowerCase().includes(query) ||
          sub.subjectName.toLowerCase().includes(query),
      );
    });
  }, [students, searchQuery, selectedBranch, selectedSection]);

  const totalSubjectRecords = useMemo(
    () => filteredStudents.reduce((acc, st) => acc + st.subjects.length, 0),
    [filteredStudents],
  );

  // Global Table Metadata Badges (Academic Year, Year/Sem, Branch, Section)
  const globalAcademicYear = useMemo(() => {
    const years = Array.from(new Set(filteredStudents.map((s) => s.academicYear).filter(Boolean)));
    return years.length === 1 ? years[0] : years.join(', ');
  }, [filteredStudents]);

  const globalYearSem = useMemo(() => {
    const semKeys = Array.from(
      new Set(
        filteredStudents
          .filter((s) => s.yearOfStudy || s.semester)
          .map((s) => `Yr ${s.yearOfStudy} / Sem ${s.semester}`),
      ),
    );
    return semKeys.length === 1 ? semKeys[0] : semKeys.join(', ');
  }, [filteredStudents]);

  const globalBranch = useMemo(() => {
    if (selectedBranch !== 'ALL') return selectedBranch;
    const branches = Array.from(new Set(filteredStudents.map((s) => s.branch).filter(Boolean)));
    return branches.length === 1 ? branches[0] : 'All Branches';
  }, [filteredStudents, selectedBranch]);

  const globalSection = useMemo(() => {
    if (selectedSection !== 'ALL') return `Sec ${selectedSection}`;
    const sections = Array.from(
      new Set(filteredStudents.map((s) => s.section).filter((s) => s && s !== '-')),
    );
    return sections.length === 1 ? `Sec ${sections[0]}` : 'All Sections';
  }, [filteredStudents, selectedSection]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const paginatedStudents = filteredStudents.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleResetFilters = () => {
    setSelectedBranch('ALL');
    setSelectedSection('ALL');
    setSearchQuery('');
    setCurrentPage(1);
  };

  const handleExportCsv = () => {
    if (filteredStudents.length === 0) {
      toast.push('No records available to export.', 'warning');
      return;
    }

    const examHeaders = activeExams.map((e) => `${e.title} Marks`);
    const headers = [
      'S.No.',
      'Student Roll / PIN',
      'Student Name',
      'Academic Year',
      'Year of Study',
      'Semester',
      'Branch',
      'Section',
      'Subject Code',
      'Subject Name',
      ...examHeaders,
      'Calculated Internal Marks (/30)',
      'Minimum Marks Status',
    ];

    const csvRows: string[][] = [];
    let sNo = 1;

    for (const student of filteredStudents) {
      for (const sub of student.subjects) {
        const examMarksValues = activeExams.map((e) => {
          const m = sub.examMarks[e.id];
          if (!m || !m.isEligible) return '-';
          if (!m.isEntered) return 'Not Entered';
          if (m.isAbsent) return 'Absent';
          return `${m.marksObtained} / ${m.maxMarks}`;
        });
        const calculatedMarks = calculateInternalMarks(sub, activeExams);

        csvRows.push([
          String(sNo++),
          student.studentRollNumber,
          student.studentName,
          student.academicYear,
          String(student.yearOfStudy),
          String(student.semester),
          student.branch,
          student.section,
          sub.subjectCode,
          sub.subjectName,
          ...examMarksValues,
          calculatedMarks === null ? 'Pending' : String(calculatedMarks),
          calculatedMarks === null ? 'Pending' : calculatedMarks >= 16 ? 'Pass' : 'Below 16',
        ]);
      }
    }

    const csvContent =
      headers.map(csvValue).join(',') +
      '\r\n' +
      csvRows.map((row) => row.map(csvValue).join(',')).join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Internal_Marks_${selectedRegulation?.code || 'Regulation'}_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.push('Internal marks data exported to CSV.', 'success');
  };

  const distinctSubjects = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of facultyAccessRows) {
      if (!map.has(r.subjectCode)) {
        map.set(r.subjectCode, r.subjectName);
      }
    }
    for (const st of students) {
      for (const sub of st.subjects) {
        if (!map.has(sub.subjectCode)) {
          map.set(sub.subjectCode, sub.subjectName);
        }
      }
    }
    return Array.from(map.entries()).map(([code, name]) => ({ code, name }));
  }, [facultyAccessRows, students]);

  const openUnlockModalFor = (row: FacultySubjectAccessRow) => {
    setUnlockExamId(row.examId);
    setUnlockSubjectCode(row.subjectCode);
    setUnlockReason('');
    if (row.facultyEmail) {
      const match = facultyUsers.find((u) => u.email === row.facultyEmail);
      if (match) {
        setSelectedFacultyOption(String(match.id));
      } else {
        setSelectedFacultyOption('CUSTOM');
        setCustomFacultyName(row.facultyName || '');
        setCustomFacultyEmail(row.facultyEmail || '');
      }
    } else if (row.facultyName) {
      setSelectedFacultyOption('CUSTOM');
      setCustomFacultyName(row.facultyName);
      setCustomFacultyEmail('');
    } else {
      setSelectedFacultyOption('');
      setCustomFacultyName('');
      setCustomFacultyEmail('');
    }
    setIsUnlockModalOpen(true);
  };

  const openRelockFor = async (row: FacultySubjectAccessRow) => {
    setSubmittingUnlock(true);
    try {
      const res = await api.relockInternalMarks(row.examId, {
        subjectCode: row.subjectCode,
        reason: 'Administrative access revocation',
      });
      toast.push(res.message || 'Access re-locked successfully.', 'success');
      await loadNotifications();
    } catch (err) {
      toast.push(getErrorMessage(err, 'Failed to re-lock access.'), 'danger');
    } finally {
      setSubmittingUnlock(false);
    }
  };

  const handleConfirmUnlock = async () => {
    if (!unlockExamId) return;
    if (!unlockReason.trim()) {
      toast.push('Please enter a valid justification reason for unlocking access.', 'warning');
      return;
    }

    let finalFacultyName: string | undefined = undefined;
    let finalFacultyEmail: string | undefined = undefined;

    if (selectedFacultyOption === 'CUSTOM') {
      finalFacultyName = customFacultyName.trim() || undefined;
      finalFacultyEmail = customFacultyEmail.trim() || undefined;
    } else if (selectedFacultyOption) {
      const found = facultyUsers.find((u) => String(u.id) === selectedFacultyOption);
      if (found) {
        finalFacultyName = found.fullName || undefined;
        finalFacultyEmail = found.email || undefined;
      }
    }

    setSubmittingUnlock(true);
    try {
      const res = await api.unlockInternalMarks(unlockExamId, {
        subjectCode: unlockSubjectCode === 'ALL' ? undefined : unlockSubjectCode,
        reason: unlockReason.trim(),
        facultyName: finalFacultyName,
        facultyEmail: finalFacultyEmail,
      });
      toast.push(res.message || 'Internal marks entry access unlocked successfully.', 'success');
      setIsUnlockModalOpen(false);
      setUnlockReason('');
      await loadNotifications();
    } catch (err) {
      toast.push(getErrorMessage(err, 'Failed to unlock internal marks access.'), 'danger');
    } finally {
      setSubmittingUnlock(false);
    }
  };

  const handleConfirmRelock = async () => {
    if (!unlockExamId) return;
    setSubmittingUnlock(true);
    try {
      const res = await api.relockInternalMarks(unlockExamId, {
        subjectCode: unlockSubjectCode === 'ALL' ? undefined : unlockSubjectCode,
        reason: unlockReason.trim() || undefined,
      });
      toast.push(res.message || 'Internal marks entry access re-locked successfully.', 'success');
      setIsUnlockModalOpen(false);
      setUnlockReason('');
      await loadNotifications();
    } catch (err) {
      toast.push(getErrorMessage(err, 'Failed to re-lock internal marks access.'), 'danger');
    } finally {
      setSubmittingUnlock(false);
    }
  };

  const refresh = async () => {
    await loadNotifications();
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Internal Marks Management"
        description="View student internal marks grouped by regulation, with nested subject rows and separate columns for each internal examination."
        breadcrumbs={
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span>Dashboard</span>
            <span>/</span>
            <span>Examinations</span>
            <span>/</span>
            <span className="font-semibold text-slate-800">Internal Marks Management</span>
          </div>
        }
        action={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={refresh} disabled={loadingNotifications || loadingRows}>
              <svg
                className={`mr-1.5 h-4 w-4 ${loadingNotifications || loadingRows ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Refresh
            </Button>
            <Button variant="secondary" size="sm" onClick={handleResetFilters}>
              Reset Filters
            </Button>
          </div>
        }
      />

      {/* Top Tab Navigation */}
      <div className="flex border-b border-slate-200 bg-white px-3 rounded-t-xl shadow-2xs">
        <button
          type="button"
          onClick={() => setActiveTab('marks')}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-xs font-semibold transition-colors ${
            activeTab === 'marks'
              ? 'border-[var(--primary)] text-[var(--primary)]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Marks Details
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('faculty-unlocks')}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-xs font-semibold transition-colors ${
            activeTab === 'faculty-unlocks'
              ? 'border-[var(--primary)] text-[var(--primary)]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
          </svg>
          Faculty Access & Unlocks
          {facultyAccessRows.filter((r) => (r.isLocked || r.isExpired) && !r.isUpcoming && !r.isManuallyUnlocked).length > 0 && (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
              {facultyAccessRows.filter((r) => (r.isLocked || r.isExpired) && !r.isUpcoming && !r.isManuallyUnlocked).length} Locked
            </span>
          )}
        </button>
      </div>

      {errorMessage && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
          {errorMessage}
        </div>
      )}

      {/* Primary Filters Toolbar */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-[11px] font-semibold text-slate-700">
            Regulation
            <select
              value={selectedRegulationId ?? ''}
              disabled={loadingNotifications || regulations.length === 0}
              onChange={(event) => {
                setSelectedRegulationId(Number(event.target.value));
                setSelectedBranch('ALL');
                setSelectedSection('ALL');
                setCurrentPage(1);
              }}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900"
            >
              {regulations.length === 0 ? (
                <option value="">No regulations found</option>
              ) : (
                regulations.map((regulation) => (
                  <option key={regulation.id} value={regulation.id}>
                    {regulation.code}
                    {regulation.name ? ` - ${regulation.name}` : ''}
                  </option>
                ))
              )}
            </select>
          </label>

          <label className="text-[11px] font-semibold text-slate-700">
            Branch
            <select
              value={selectedBranch}
              onChange={(event) => {
                setSelectedBranch(event.target.value);
                setCurrentPage(1);
              }}
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800"
            >
              <option value="ALL">All Branches</option>
              {availableBranches.map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </select>
          </label>

          <label className="text-[11px] font-semibold text-slate-700">
            Section
            <select
              value={selectedSection}
              onChange={(event) => {
                setSelectedSection(event.target.value);
                setCurrentPage(1);
              }}
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800"
            >
              <option value="ALL">All Sections</option>
              {availableSections.map((section) => (
                <option key={section} value={section}>
                  {section}
                </option>
              ))}
            </select>
          </label>

          <label className="text-[11px] font-semibold text-slate-700">
            Search
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search PIN, name, subject, faculty..."
              className="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-800"
            />
          </label>
        </div>
      </section>

      {/* Global Table Info & Action Toolbar (Displays Academic Year, Year/Sem, Branch, Section Globally) */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-slate-900 text-sm">
            {selectedRegulation?.code || 'No regulation selected'}
          </span>
          {globalAcademicYear && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
              {globalAcademicYear}
            </span>
          )}
          {globalYearSem && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
              {globalYearSem}
            </span>
          )}
          {globalBranch && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
              {globalBranch}
            </span>
          )}
          {globalSection && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
              {globalSection}
            </span>
          )}
          <span className="text-slate-300">·</span>
          <span className="text-slate-600 font-medium">
            {activeExams.length} Internal examination{activeExams.length === 1 ? '' : 's'}
          </span>
          <span className="text-slate-300">·</span>
          <span className="text-slate-600 font-medium">
            <strong className="text-slate-900">{filteredStudents.length}</strong> students /{' '}
            <strong className="text-slate-900">{totalSubjectRecords}</strong> subject records
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleExportCsv} disabled={loadingRows}>
            <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </Button>
        </div>
      </div>

      {loadingNotifications || loadingRows ? (
        <div className="py-16 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-[var(--primary)]" />
          <p className="mt-3 text-xs font-medium text-slate-500">Loading regulation-wise internal marks...</p>
        </div>
      ) : notifications.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-12 text-center">
          <p className="text-sm font-semibold text-slate-700">No internal examinations found</p>
          <p className="mt-1 text-xs text-slate-500">Create internal examinations to view marks by regulation.</p>
        </div>
      ) : activeTab === 'faculty-unlocks' ? (
        /* TAB 2: FACULTY ACCESS & UNLOCKS */
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900 flex items-start gap-3">
            <span className="p-1 rounded-md bg-amber-100 text-amber-700 border border-amber-300">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
            <div>
              <p className="font-bold text-amber-950">4-Day Deadline Enforcement & Faculty Access Control</p>
              <p className="mt-0.5 text-amber-800">
                Marks entry is automatically open for all enrolled faculty during the 4 calendar days from each examination date.
                Once the 4-day deadlock is reached, marks entry is locked and the <strong>&quot;Unlock for Faculty&quot;</strong> action will appear to allow granting explicit faculty access overrides.
              </p>
            </div>
          </div>

          {/* Quick Filter Status Pills */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'ALL', label: 'All Subjects', count: facultyAccessRows.length },
              {
                id: 'UPCOMING',
                label: 'Upcoming (Opens on Exam Date)',
                count: facultyAccessRows.filter((r) => r.isUpcoming && !r.isManuallyUnlocked).length,
              },
              {
                id: 'OPEN',
                label: 'Open (Within 4 Days)',
                count: facultyAccessRows.filter(
                  (r) => !r.isLocked && !r.isExpired && !r.isUpcoming && !r.isManuallyUnlocked,
                ).length,
              },
              {
                id: 'LOCKED',
                label: 'Locked (Deadlock Reached)',
                count: facultyAccessRows.filter(
                  (r) => (r.isLocked || r.isExpired) && !r.isUpcoming && !r.isManuallyUnlocked,
                ).length,
              },
              {
                id: 'UNLOCKED',
                label: 'Manually Unlocked',
                count: facultyAccessRows.filter((r) => r.isManuallyUnlocked).length,
              },
            ].map((pill) => (
              <button
                key={pill.id}
                type="button"
                onClick={() =>
                  setFacultyStatusFilter(
                    pill.id as 'ALL' | 'LOCKED' | 'OPEN' | 'UPCOMING' | 'UNLOCKED',
                  )
                }
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  facultyStatusFilter === pill.id
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span>{pill.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    facultyStatusFilter === pill.id
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {pill.count}
                </span>
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-700 font-semibold sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-3 text-center w-12 font-semibold">#</th>
                    <th className="px-3 py-3 font-semibold min-w-[140px]">Internal Examination</th>
                    <th className="px-3 py-3 font-semibold min-w-[180px]">Subject Code & Name</th>
                    <th className="px-3 py-3 font-semibold min-w-[100px]">Branch</th>
                    <th className="px-3 py-3 font-semibold min-w-[180px]">Assigned / Unlocked Faculty</th>
                    <th className="px-3 py-3 font-semibold min-w-[160px]">Exam Date & Deadline</th>
                    <th className="px-3 py-3 text-center font-semibold min-w-[140px]">Access Status</th>
                    <th className="px-3 py-3 text-center font-semibold min-w-[150px]">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {facultyAccessRows
                    .filter((row) => {
                      if (
                        selectedBranch !== 'ALL' &&
                        !row.branch.toUpperCase().includes(selectedBranch.toUpperCase())
                      ) {
                        return false;
                      }
                      if (facultyStatusFilter === 'UPCOMING' && (!row.isUpcoming || row.isManuallyUnlocked)) {
                        return false;
                      }
                      if (
                        facultyStatusFilter === 'OPEN' &&
                        (row.isUpcoming || row.isLocked || row.isExpired || row.isManuallyUnlocked)
                      ) {
                        return false;
                      }
                      if (
                        facultyStatusFilter === 'LOCKED' &&
                        (!row.isLocked && !row.isExpired || row.isUpcoming || row.isManuallyUnlocked)
                      ) {
                        return false;
                      }
                      if (facultyStatusFilter === 'UNLOCKED' && !row.isManuallyUnlocked) {
                        return false;
                      }
                      if (!searchQuery.trim()) return true;
                      const q = searchQuery.toLowerCase();
                      return (
                        row.examTitle.toLowerCase().includes(q) ||
                        row.subjectCode.toLowerCase().includes(q) ||
                        row.subjectName.toLowerCase().includes(q) ||
                        row.branch.toLowerCase().includes(q) ||
                        (row.facultyName && row.facultyName.toLowerCase().includes(q)) ||
                        (row.facultyEmail && row.facultyEmail.toLowerCase().includes(q))
                      );
                    })
                    .map((row, idx) => (
                      <tr key={`${row.examId}-${row.subjectCode}`} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-3 py-3 text-center font-semibold text-slate-400">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-bold text-slate-900">{row.examTitle}</div>
                          <div className="text-[10px] text-slate-500">{row.examType}</div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-semibold text-slate-900">{row.subjectCode}</div>
                          <div className="text-[11px] text-slate-500">{row.subjectName}</div>
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
                            {row.branch}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {row.facultyName ? (
                            <div>
                              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                                {row.facultyName}
                              </div>
                              {row.facultyEmail && (
                                <div className="text-[11px] text-slate-500">{row.facultyEmail}</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">All Enrolled Faculty</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="text-[11px] font-medium text-slate-700">
                            Exam: {row.examDate || 'Not set'}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Deadline: {row.marksEntryDeadline}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          {row.isManuallyUnlocked ? (
                            <div>
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                                Unlocked (Override)
                              </span>
                              {row.lockReason && (
                                <div className="mt-0.5 text-[10px] text-slate-500 max-w-[150px] truncate mx-auto" title={row.lockReason}>
                                  {row.lockReason}
                                </div>
                              )}
                            </div>
                          ) : row.isUpcoming ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              Opens on {row.examDateFormatted || row.examDate}
                            </span>
                          ) : (row.isLocked || row.isExpired) ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                              Locked (Deadlock Reached)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 border border-sky-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-sky-600" />
                              Open (Within 4 Days)
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {row.isManuallyUnlocked ? (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => openRelockFor(row)}
                              disabled={submittingUnlock}
                            >
                              Re-lock Access
                            </Button>
                          ) : row.isUpcoming ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200">
                              Opens on {row.examDateFormatted || row.examDate}
                            </span>
                          ) : (row.isLocked || row.isExpired) ? (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => openUnlockModalFor(row)}
                              disabled={submittingUnlock}
                            >
                              Unlock for Faculty
                            </Button>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Within 4 Days (Open)
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : paginatedStudents.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-xs">
          <p className="text-xs font-medium text-slate-500">No student marks records match the selected filters.</p>
        </div>
      ) : (
        /* TAB 1: MARKS DETAILS (GLOBAL TABLE) */
        <>
          {/* Global Continuous Table with Separate Exam Columns and No Collapsing Rows */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-700 font-semibold sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-3 text-center w-12 font-semibold">#</th>
                    <th className="px-3 py-3 font-semibold min-w-[110px]">PIN / Roll No</th>
                    <th className="px-3 py-3 font-semibold min-w-[170px]">Student Name</th>
                    <th className="px-3 py-3 text-center font-semibold w-16">Sec</th>
                    <th className="px-3 py-3 font-semibold min-w-[180px]">Subject Code & Name</th>
                    {/* Separate Exam Columns */}
                    {activeExams.map((exam) => (
                      <th
                        key={exam.id}
                        className="px-3 py-3 text-center font-semibold min-w-[130px] border-l border-slate-200/80"
                      >
                        <div className="font-bold text-slate-900">{exam.title}</div>
                        <div className="text-[10px] text-slate-500 font-normal">{exam.type}</div>
                      </th>
                    ))}
                    <th className="px-3 py-3 text-center font-semibold min-w-[140px] border-l border-slate-200/80">
                      Weighted Internal
                      <div className="text-[10px] text-slate-500 font-normal">/ 30 · minimum 16</div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedStudents.map((student, sIdx) => {
                    const studentNumber = (currentPage - 1) * pageSize + sIdx + 1;
                    const subjectCount = Math.max(1, student.subjects.length);
                    const calculatedTotal = getStudentCalculatedTotal(student, activeExams);

                    if (student.subjects.length === 0) {
                      return (
                        <tr key={student.studentRollNumber} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-3 py-3 text-center font-semibold text-slate-400">
                            {studentNumber}
                          </td>
                          <td className="px-3 py-3 font-mono font-bold text-xs text-sky-900">
                            <span className="px-2 py-0.5 rounded bg-sky-50 border border-sky-200 shadow-2xs">
                              {student.studentRollNumber}
                            </span>
                          </td>
                          <td className="px-3 py-3 font-bold text-slate-900">
                            {student.studentName}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">
                              {student.section || '-'}
                            </span>
                          </td>
                          <td colSpan={activeExams.length + 2} className="px-3 py-3 text-slate-400 italic">
                            No enrolled subjects found
                          </td>
                        </tr>
                      );
                    }

                    return student.subjects.map((sub, subIdx) => {
                      const isFirst = subIdx === 0;
                      const isLast = subIdx === subjectCount - 1;
                      const studentBorderClass = isLast ? 'border-b border-slate-200' : 'border-b border-slate-100';
                      const calculatedMarks = calculateInternalMarks(sub, activeExams);

                      return (
                        <tr
                          key={`${student.studentRollNumber}-${sub.subjectCode}`}
                          className={`hover:bg-slate-50/70 transition-colors ${
                            sIdx % 2 === 1 ? 'bg-slate-50/30' : 'bg-white'
                          }`}
                        >
                          {/* Student Info Cells (Rowspanned for all subjects of this student) */}
                          {isFirst && (
                            <>
                              <td
                                rowSpan={subjectCount}
                                className="px-3 py-3 text-center font-semibold text-slate-400 align-top border-b border-slate-200 bg-inherit"
                              >
                                {studentNumber}
                              </td>
                              <td
                                rowSpan={subjectCount}
                                className="px-3 py-3 align-top border-b border-slate-200 bg-inherit"
                              >
                                <span className="font-mono font-bold text-xs px-2.5 py-1 rounded-md bg-sky-50 text-sky-900 border border-sky-200 shadow-2xs inline-block">
                                  {student.studentRollNumber}
                                </span>
                              </td>
                              <td
                                rowSpan={subjectCount}
                                className="px-3 py-3 align-top border-b border-slate-200 bg-inherit"
                              >
                                <div className="font-bold text-slate-900 text-xs">
                                  {student.studentName}
                                </div>
                                <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                                  <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-200/80 text-slate-700">
                                    Overall
                                  </span>
                                  <span>
                                    {calculatedTotal ? (
                                      <>
                                        <strong className="text-slate-800">{calculatedTotal.obtained}</strong>{' '}
                                        / {calculatedTotal.maximum} calculated
                                      </>
                                    ) : (
                                      <strong className="text-slate-500">Calculation pending</strong>
                                    )}
                                  </span>
                                </div>
                              </td>
                              <td
                                rowSpan={subjectCount}
                                className="px-3 py-3 text-center align-top border-b border-slate-200 bg-inherit"
                              >
                                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
                                  {student.section || '-'}
                                </span>
                              </td>
                            </>
                          )}

                          {/* Subject Code & Name */}
                          <td className={`px-3 py-2.5 ${studentBorderClass}`}>
                            <div className="font-semibold text-slate-900">{sub.subjectCode}</div>
                            <div className="text-[11px] text-slate-500">{sub.subjectName}</div>
                          </td>

                          {/* Separate Exam Columns */}
                          {activeExams.map((exam) => {
                            const mark = sub.examMarks[exam.id];
                            if (!mark || !mark.isEligible) {
                              return (
                                <td
                                  key={exam.id}
                                  className={`px-3 py-2.5 text-center text-slate-400 text-xs border-l border-slate-100 ${studentBorderClass}`}
                                >
                                  -
                                </td>
                              );
                            }
                            if (!mark.isEntered) {
                              return (
                                <td
                                  key={exam.id}
                                  className={`px-3 py-2.5 text-center border-l border-slate-100 ${studentBorderClass}`}
                                >
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200/60">
                                    Not Entered ({mark.maxMarks}M)
                                  </span>
                                </td>
                              );
                            }
                            if (mark.isAbsent) {
                              return (
                                <td
                                  key={exam.id}
                                  className={`px-3 py-2.5 text-center border-l border-slate-100 ${studentBorderClass}`}
                                >
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-800">
                                    ABSENT
                                  </span>
                                </td>
                              );
                            }
                            return (
                              <td
                                key={exam.id}
                                className={`px-3 py-2.5 text-center border-l border-slate-100 ${studentBorderClass}`}
                              >
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  {mark.marksObtained} / {mark.maxMarks}
                                </span>
                              </td>
                            );
                          })}

                          {/* Weighted internal marks from the two best entered mid scores */}
                          <td
                            className={`px-3 py-2.5 text-center font-bold text-slate-900 border-l border-slate-100 ${studentBorderClass}`}
                          >
                            {calculatedMarks === null ? (
                              <span className="text-xs font-medium text-slate-400">Pending</span>
                            ) : (
                              <span
                                className={`inline-flex flex-col items-center rounded px-2 py-1 text-xs ${
                                  calculatedMarks >= 16
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-rose-50 text-rose-700'
                                }`}
                              >
                                <span>{calculatedMarks} / 30</span>
                                <span className="text-[10px] font-medium">
                                  {calculatedMarks >= 16 ? 'Pass' : 'Below 16'}
                                </span>
                              </span>
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

          {/* Pagination Controls */}
          <div className="flex flex-col items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 shadow-xs sm:flex-row">
            <div className="flex items-center gap-2">
              <span>Students per page:</span>
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setCurrentPage(1);
                }}
                className="rounded border border-slate-200 bg-white px-2 py-1 text-slate-800"
              >
                {[10, 25, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
              <span>
                Showing {filteredStudents.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} to{' '}
                {Math.min(currentPage * pageSize, filteredStudents.length)} of {filteredStudents.length} students
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                className="rounded border border-slate-200 px-2.5 py-1 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="font-semibold">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                className="rounded border border-slate-200 px-2.5 py-1 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {/* Unlock / Relock Access Modal Dialog */}
      {isUnlockModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600 border border-amber-200">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"
                    />
                  </svg>
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Unlock Internal Marks Entry Access</h3>
                  <p className="text-xs text-slate-500">
                    Grant administrative override access for marks entry to a specific faculty member.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsUnlockModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Internal Examination</label>
                <select
                  value={unlockExamId ?? ''}
                  onChange={(e) => setUnlockExamId(Number(e.target.value))}
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                >
                  {activeExams.map((exam) => (
                    <option key={exam.id} value={exam.id}>
                      {exam.title} ({exam.type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Subject</label>
                <select
                  value={unlockSubjectCode}
                  onChange={(e) => setUnlockSubjectCode(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                >
                  <option value="ALL">All Subjects in this Examination</option>
                  {distinctSubjects.map((sub) => (
                    <option key={sub.code} value={sub.code}>
                      {sub.code} - {sub.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Select Faculty to Grant Access
                </label>
                <select
                  value={selectedFacultyOption}
                  onChange={(e) => setSelectedFacultyOption(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                >
                  <option value="">All Enrolled Faculty / General Unlock</option>
                  {facultyUsers.map((u) => (
                    <option key={u.id} value={String(u.id)}>
                      {u.fullName || u.email} ({u.email || u.employeeNumber || 'Faculty'})
                    </option>
                  ))}
                  <option value="CUSTOM">Custom / Other Faculty...</option>
                </select>
              </div>

              {selectedFacultyOption === 'CUSTOM' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-700">Faculty Full Name</label>
                    <input
                      type="text"
                      value={customFacultyName}
                      onChange={(e) => setCustomFacultyName(e.target.value)}
                      placeholder="e.g. Dr. Ramesh Kumar"
                      className="mt-1 block w-full rounded-md border border-slate-300 p-2 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-700">Faculty Email</label>
                    <input
                      type="email"
                      value={customFacultyEmail}
                      onChange={(e) => setCustomFacultyEmail(e.target.value)}
                      placeholder="e.g. ramesh@pydah.edu.in"
                      className="mt-1 block w-full rounded-md border border-slate-300 p-2 text-xs bg-white"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Justification Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={unlockReason}
                  onChange={(e) => setUnlockReason(e.target.value)}
                  placeholder="e.g. Late submission authorized by COE for assigned faculty / Clarifications submitted."
                  className="mt-1 block w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  This action is recorded in the audit log with your user account details, faculty assignment, and timestamp.
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between gap-2 border-t border-slate-100 pt-4">
              <Button
                variant="danger"
                size="sm"
                onClick={handleConfirmRelock}
                disabled={submittingUnlock || !unlockExamId}
              >
                Re-lock Access
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsUnlockModalOpen(false)}
                  disabled={submittingUnlock}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleConfirmUnlock}
                  disabled={submittingUnlock || !unlockReason.trim()}
                >
                  {submittingUnlock ? 'Processing...' : 'Confirm Unlock'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
