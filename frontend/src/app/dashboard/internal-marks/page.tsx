'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { MarksNotificationItem } from '@/types/marks-upload';
import { EmsUser } from '@/types/user-management';
import { Regulation, RegulationScope } from '@/types/regulation';
import { SdmsCollege, SdmsCourse, SdmsBranch, SdmsBranchYearSemesters } from '@/types/sdms';

interface RegulationOption {
  id: number;
  code: string;
  name: string;
  scopes?: RegulationScope[];
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
  college?: string;
  course?: string;
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

export interface CalculatedInternalResult {
  marks: number | null;
  status: 'PASS' | 'FAIL' | 'PENDING';
  isPass: boolean | null;
  bestMid: number | null;
  secondMid: number | null;
  minMarks: number;
}

export function getInternalMarksCalculation(
  subject: StudentSubjectRow,
  exams: ActiveExamColumn[],
  targetMax = 30,
  minMarks = 16,
): CalculatedInternalResult {
  const enteredScores: { score: number; examTitle: string }[] = [];

  for (const exam of exams) {
    const mark = subject.examMarks[exam.id];
    if (!mark?.isEligible || !mark.isEntered) continue;
    const marksObtained = mark.isAbsent ? 0 : mark.marksObtained;
    if (marksObtained === null) continue;
    const maxMarks = mark.maxMarks > 0 ? mark.maxMarks : targetMax;
    const normalized = (marksObtained / maxMarks) * targetMax;
    enteredScores.push({ score: normalized, examTitle: exam.title });
  }

  if (enteredScores.length < 2) {
    return {
      marks: null,
      status: 'PENDING',
      isPass: null,
      bestMid: enteredScores[0] ? Number(enteredScores[0].score.toFixed(2)) : null,
      secondMid: null,
      minMarks,
    };
  }

  // Sort descending: best first, second-best second
  enteredScores.sort((a, b) => b.score - a.score);
  const best = enteredScores[0].score;
  const second = enteredScores[1].score;

  // 80% from best mid + 20% from another mid
  const finalMarks = Number((best * 0.8 + second * 0.2).toFixed(2));
  const isPass = finalMarks >= minMarks;

  return {
    marks: finalMarks,
    status: isPass ? 'PASS' : 'FAIL',
    isPass,
    bestMid: Number(best.toFixed(2)),
    secondMid: Number(second.toFixed(2)),
    minMarks,
  };
}

function getStudentCalculatedTotal(student: GroupedStudentData, exams: ActiveExamColumn[]) {
  if (student.subjects.length === 0) return null;

  const results = student.subjects.map((subject) =>
    getInternalMarksCalculation(subject, exams),
  );
  const completed = results.filter((r) => r.marks !== null);
  const passCount = completed.filter((r) => r.isPass === true).length;
  const failCount = completed.filter((r) => r.isPass === false).length;

  if (completed.length !== results.length) {
    return {
      obtained: Number(completed.reduce((sum, r) => sum + (r.marks || 0), 0).toFixed(2)),
      maximum: student.subjects.length * 30,
      isFullyCalculated: false,
      passCount,
      failCount,
      pendingCount: results.length - completed.length,
    };
  }

  const total = Number(completed.reduce((sum, r) => sum + (r.marks || 0), 0).toFixed(2));
  return {
    obtained: total,
    maximum: student.subjects.length * 30,
    isFullyCalculated: true,
    passCount,
    failCount,
    pendingCount: 0,
  };
}

export default function InternalMarksManagementPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'marks' | 'faculty-unlocks'>('marks');

  // Master Data & Notifications
  const [regulations, setRegulations] = useState<Regulation[]>([]);
  const [notifications, setNotifications] = useState<MarksNotificationItem[]>([]);
  const [sdmsColleges, setSdmsColleges] = useState<SdmsCollege[]>([]);
  const [sdmsCourses, setSdmsCourses] = useState<SdmsCourse[]>([]);
  const [sdmsBranches, setSdmsBranches] = useState<SdmsBranch[]>([]);
  const [branchYearSem, setBranchYearSem] = useState<SdmsBranchYearSemesters | null>(null);

  // Cascading Academic Hierarchy Selections (starts with NO selection by default)
  const [selectedRegulationId, setSelectedRegulationId] = useState<number | null>(null);
  const [selectedCollegeId, setSelectedCollegeId] = useState<string>('ALL');
  const [selectedCourseId, setSelectedCourseId] = useState<string>('ALL');
  const [selectedBranch, setSelectedBranch] = useState<string>('ALL');
  const [selectedYear, setSelectedYear] = useState<string>('ALL');
  const [selectedSemester, setSelectedSemester] = useState<string>('ALL');
  const [selectedSection, setSelectedSection] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Table Data & Access State
  const [students, setStudents] = useState<GroupedStudentData[]>([]);
  const [allRegulationBranches, setAllRegulationBranches] = useState<string[]>([]);
  const [facultyAccessRows, setFacultyAccessRows] = useState<FacultySubjectAccessRow[]>([]);
  const [facultyUsers, setFacultyUsers] = useState<EmsUser[]>([]);
  const [facultyStatusFilter, setFacultyStatusFilter] = useState<'ALL' | 'LOCKED' | 'OPEN' | 'UPCOMING' | 'UNLOCKED'>('ALL');

  const [loadingNotifications, setLoadingNotifications] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedStudentDetail, setSelectedStudentDetail] = useState<GroupedStudentData | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Unlock Modal State
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const [unlockExamId, setUnlockExamId] = useState<number | null>(null);
  const [unlockSubjectCode, setUnlockSubjectCode] = useState<string>('ALL');
  const [selectedFacultyOption, setSelectedFacultyOption] = useState<string>('');
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

  // Load Master Regulations & SDMS Colleges on mount
  useEffect(() => {
    void api
      .getRegulations()
      .then((data) => {
        if (Array.isArray(data)) setRegulations(data);
      })
      .catch(() => undefined);

    void api
      .getSdmsColleges()
      .then((data) => {
        if (Array.isArray(data)) setSdmsColleges(data);
      })
      .catch(() => undefined);
  }, []);

  // Load Notifications without forcing any auto-selection
  const loadNotifications = useCallback(async () => {
    setLoadingNotifications(true);
    setErrorMessage('');
    try {
      const response = await api.getMarksNotifications();
      // Keep all exams that belong to a regulation
      const allExams = (response.exams || []).filter(
        (n) => typeof n.regulationId === 'number',
      );
      setNotifications(allExams);
      // Retain selectedRegulationId only if user had already selected one and it's valid
      setSelectedRegulationId((current) =>
        current !== null && allExams.some((notification) => notification.regulationId === current)
          ? current
          : current,
      );
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Failed to fetch examination notifications.'));
    } finally {
      setLoadingNotifications(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  // Combined Regulations List (from Regulations API + Notifications)
  const regulationOptions = useMemo<RegulationOption[]>(() => {
    const options = new Map<number, RegulationOption>();
    for (const r of regulations) {
      options.set(r.id, {
        id: r.id,
        code: r.code,
        name: r.name,
        scopes: r.scopes,
      });
    }
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
  }, [regulations, notifications]);

  // Active Regulation & its Scopes
  const selectedRegulation = useMemo(() => {
    if (selectedRegulationId === null) return null;
    return (
      regulationOptions.find((regulation) => regulation.id === selectedRegulationId) ||
      regulations.find((r) => r.id === selectedRegulationId) ||
      null
    );
  }, [regulationOptions, regulations, selectedRegulationId]);

  // Dynamic Colleges under the Selected Regulation
  const collegeOptions = useMemo(() => {
    if (!selectedRegulationId) return [];
    const map = new Map<string, { key: string; id?: number; name: string }>();

    // From Regulation Scopes
    if (selectedRegulation?.scopes) {
      for (const s of selectedRegulation.scopes) {
        const key = String(s.collegeId || s.collegeName).trim();
        if (!map.has(key)) {
          map.set(key, { key, id: s.collegeId, name: s.collegeName });
        }
      }
    }

    // From Notifications under this regulation
    for (const n of notifications) {
      if (n.regulationId === selectedRegulationId && n.college) {
        const key = n.college.trim();
        if (!map.has(key)) {
          map.set(key, { key, name: n.college });
        }
      }
    }

    // From SDMS Colleges
    for (const c of sdmsColleges) {
      const key = String(c.id);
      if (!map.has(key)) {
        map.set(key, { key, id: c.id, name: c.name });
      }
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [selectedRegulation, notifications, selectedRegulationId, sdmsColleges]);

  // Fetch SDMS courses when college selection changes
  useEffect(() => {
    if (!selectedRegulationId || selectedCollegeId === 'ALL') {
      setSdmsCourses([]);
      return;
    }
    const collegeObj = collegeOptions.find((c) => c.key === selectedCollegeId);
    const collegeIdNum = collegeObj?.id || Number(selectedCollegeId);
    if (!Number.isNaN(collegeIdNum) && collegeIdNum > 0) {
      api
        .getSdmsCourses(collegeIdNum)
        .then((data) => setSdmsCourses(Array.isArray(data) ? data : []))
        .catch(() => setSdmsCourses([]));
    }
  }, [selectedRegulationId, selectedCollegeId, collegeOptions]);

  // Dynamic Courses under the Selected College & Regulation
  const courseOptions = useMemo(() => {
    if (!selectedRegulationId) return [];
    const map = new Map<string, { key: string; id?: number; name: string; totalYears?: number }>();

    // From Regulation Scopes
    if (selectedRegulation?.scopes) {
      for (const s of selectedRegulation.scopes) {
        if (selectedCollegeId !== 'ALL') {
          const matchCol =
            String(s.collegeId) === selectedCollegeId ||
            s.collegeName.toLowerCase() === selectedCollegeId.toLowerCase();
          if (!matchCol) continue;
        }
        const key = String(s.courseId || s.courseName).trim();
        if (!map.has(key)) {
          map.set(key, { key, id: s.courseId, name: s.courseName });
        }
      }
    }

    // From Notifications
    for (const n of notifications) {
      if (n.regulationId === selectedRegulationId) {
        if (selectedCollegeId !== 'ALL' && n.college && n.college.toLowerCase() !== selectedCollegeId.toLowerCase()) {
          continue;
        }
        if (n.course) {
          const key = n.course.trim();
          if (!map.has(key)) {
            map.set(key, { key, name: n.course });
          }
        }
      }
    }

    // From SDMS Courses
    for (const c of sdmsCourses) {
      const key = String(c.id);
      if (!map.has(key)) {
        map.set(key, { key, id: c.id, name: c.name, totalYears: c.totalYears });
      }
    }

    // Standard fallback default if no explicit course found
    if (map.size === 0) {
      map.set('B.Tech', { key: 'B.Tech', name: 'B.Tech', totalYears: 4 });
      map.set('M.Tech', { key: 'M.Tech', name: 'M.Tech', totalYears: 2 });
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [selectedRegulation, selectedCollegeId, notifications, selectedRegulationId, sdmsCourses]);

  // Fetch SDMS branches when course selection changes
  useEffect(() => {
    if (!selectedRegulationId || selectedCourseId === 'ALL') {
      setSdmsBranches([]);
      return;
    }
    const courseObj = courseOptions.find((c) => c.key === selectedCourseId);
    const courseIdNum = courseObj?.id || Number(selectedCourseId);
    if (!Number.isNaN(courseIdNum) && courseIdNum > 0) {
      api
        .getSdmsBranches(courseIdNum)
        .then((data) => setSdmsBranches(Array.isArray(data) ? data : []))
        .catch(() => setSdmsBranches([]));
    }
  }, [selectedRegulationId, selectedCourseId, courseOptions]);

  // Dynamic Branches under Selected Course & Regulation
  const branchOptions = useMemo(() => {
    if (!selectedRegulationId) return [];
    const set = new Set<string>();

    for (const b of sdmsBranches) {
      if (b.name) set.add(b.name);
    }

    for (const n of notifications) {
      if (n.regulationId === selectedRegulationId) {
        if (selectedCourseId !== 'ALL') {
          const courseObj = courseOptions.find((c) => c.key === selectedCourseId);
          if (n.course && courseObj && !n.course.toLowerCase().includes(courseObj.name.toLowerCase())) {
            continue;
          }
        }
        if (n.branch && n.branch.toUpperCase() !== 'ALL') {
          // Can be comma-separated list of branches
          n.branch.split(',').map((x) => x.trim()).filter(Boolean).forEach((x) => set.add(x));
        }
      }
    }

    for (const st of students) {
      if (st.branch && st.branch !== '-' && st.branch.toUpperCase() !== 'GENERAL') {
        set.add(st.branch);
      }
    }

    for (const b of allRegulationBranches) {
      if (b && b.toUpperCase() !== 'ALL') set.add(b);
    }

    return Array.from(set).sort();
  }, [sdmsBranches, notifications, selectedRegulationId, selectedCourseId, courseOptions, students, allRegulationBranches]);

  // Fetch SDMS Year & Semester Configuration when branch is selected
  useEffect(() => {
    if (!selectedRegulationId || selectedBranch === 'ALL') {
      setBranchYearSem(null);
      return;
    }
    const matchedSdmsBranch = sdmsBranches.find(
      (b) => b.name.toLowerCase() === selectedBranch.toLowerCase() || String(b.id) === selectedBranch,
    );
    if (matchedSdmsBranch) {
      api
        .getSdmsBranchYearSemesters(matchedSdmsBranch.id)
        .then((data) => setBranchYearSem(data))
        .catch(() => setBranchYearSem(null));
    } else {
      setBranchYearSem(null);
    }
  }, [selectedRegulationId, selectedBranch, sdmsBranches]);

  // Dynamic Configurations of Course & Branch Years
  const configuredTotalYears = useMemo(() => {
    if (!selectedRegulationId) return 4;
    // 1. From SDMS branchYearSem
    if (branchYearSem?.years && branchYearSem.years.length > 0) {
      return Math.max(...branchYearSem.years.map((y) => y.yearOfStudy));
    }
    // 2. From SDMS course
    const activeCourse = courseOptions.find((c) => c.key === selectedCourseId);
    if (activeCourse?.totalYears && activeCourse.totalYears > 0) {
      return activeCourse.totalYears;
    }
    // 3. Inferred from course name
    const courseName = activeCourse?.name || (selectedCourseId !== 'ALL' ? selectedCourseId : '');
    if (/m\.?tech|mba|mca|m\.?sc|master/i.test(courseName)) return 2;
    if (/diploma|polytechnic/i.test(courseName)) return 3;
    // 4. Default B.Tech (4 Years)
    return 4;
  }, [selectedRegulationId, branchYearSem, courseOptions, selectedCourseId]);

  // Dynamic Year Options according to the course/branch duration
  const yearOptions = useMemo(() => {
    if (!selectedRegulationId) return [];
    if (branchYearSem?.years && branchYearSem.years.length > 0) {
      return branchYearSem.years.map((y) => ({
        year: y.yearOfStudy,
        label: y.label || `Year ${y.yearOfStudy}`,
      }));
    }
    const list: { year: number; label: string }[] = [];
    for (let y = 1; y <= configuredTotalYears; y++) {
      const suffix = y === 1 ? 'st' : y === 2 ? 'nd' : y === 3 ? 'rd' : 'th';
      list.push({ year: y, label: `${y}${suffix} Year (Year ${y})` });
    }
    return list;
  }, [selectedRegulationId, branchYearSem, configuredTotalYears]);

  // Dynamic Semester Options based on selected year & course configuration
  const semesterOptions = useMemo(() => {
    if (!selectedRegulationId) return [];
    if (selectedYear !== 'ALL') {
      const yNum = Number(selectedYear);
      const yearObj = branchYearSem?.years?.find((y) => y.yearOfStudy === yNum);
      if (yearObj?.semesters && yearObj.semesters.length > 0) {
        return yearObj.semesters.map((s) => ({
          semester: s.semesterNumber,
          label: s.label || `Semester ${s.semesterNumber}`,
        }));
      }
      return [
        { semester: 1, label: `Semester 1 (Sem ${(yNum - 1) * 2 + 1})` },
        { semester: 2, label: `Semester 2 (Sem ${(yNum - 1) * 2 + 2})` },
      ];
    }

    // If "ALL" years is selected: display all semesters up to total years * 2
    const totalSems = configuredTotalYears * 2;
    const list: { semester: number; label: string }[] = [];
    for (let s = 1; s <= totalSems; s++) {
      list.push({ semester: s, label: `Semester ${s}` });
    }
    return list;
  }, [selectedRegulationId, selectedYear, branchYearSem, configuredTotalYears]);

  // Distinct active examinations for this regulation
  const activeExams = useMemo<ActiveExamColumn[]>(() => {
    if (selectedRegulationId === null) return [];
    let list = notifications.filter(
      (notification) => notification.regulationId === selectedRegulationId,
    );

    if (selectedYear !== 'ALL') {
      const yNum = Number(selectedYear);
      list = list.filter((n) => !n.yearOfStudy || n.yearOfStudy === yNum);
    }

    if (selectedSemester !== 'ALL') {
      const sNum = Number(selectedSemester);
      list = list.filter((n) => !n.semester || n.semester === sNum);
    }

    if (selectedBranch !== 'ALL') {
      list = list.filter(
        (n) =>
          !n.branch ||
          n.branch.toUpperCase() === 'ALL' ||
          n.branch
            .toUpperCase()
            .split(',')
            .map((b) => b.trim())
            .includes(selectedBranch.toUpperCase()),
      );
    }

    return list.map((n) => ({
      id: n.id,
      title: n.title,
      type: n.type || 'REGULAR',
    }));
  }, [notifications, selectedRegulationId, selectedYear, selectedSemester, selectedBranch]);

  // Fetch student internal marks data across the selected regulation
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
            college: string;
            course: string;
            academicYear: string;
            yearOfStudy: number;
            semester: number;
            branch: string;
            section: string;
            subjectsMap: Map<string, StudentSubjectRow>;
          }
        >();

        for (const { notification, overview } of results) {
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
                college:
                  entry.college ||
                  notification.college ||
                  selectedRegulation?.scopes?.[0]?.collegeName ||
                  'Pydah College of Engineering',
                course:
                  entry.course ||
                  notification.course ||
                  selectedRegulation?.scopes?.[0]?.courseName ||
                  'B.Tech',
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
            college: st.college,
            course: st.course,
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
  }, [notifications, selectedRegulationId, selectedRegulation]);

  const availableSections = useMemo(
    () =>
      Array.from(
        new Set(students.map((st) => st.section).filter((section) => section && section !== '-')),
      ).sort(),
    [students],
  );

  // Filter Students based on the entire Academic Hierarchy Cascade
  const filteredStudents = useMemo(() => {
    if (!selectedRegulationId) return [];
    const query = searchQuery.trim().toLowerCase();

    return students.filter((student) => {
      // 1. College Filter
      if (selectedCollegeId !== 'ALL') {
        const colObj = collegeOptions.find((c) => c.key === selectedCollegeId);
        const targetCol = (colObj?.name || selectedCollegeId).toLowerCase();
        if (student.college && !student.college.toLowerCase().includes(targetCol)) {
          return false;
        }
      }

      // 2. Course Filter
      if (selectedCourseId !== 'ALL') {
        const courseObj = courseOptions.find((c) => c.key === selectedCourseId);
        const targetCourse = (courseObj?.name || selectedCourseId).toLowerCase();
        if (student.course && !student.course.toLowerCase().includes(targetCourse)) {
          return false;
        }
      }

      // 3. Branch Filter
      if (selectedBranch !== 'ALL' && student.branch.toUpperCase() !== selectedBranch.toUpperCase()) {
        return false;
      }

      // 4. Year Filter
      if (selectedYear !== 'ALL' && Number(student.yearOfStudy) !== Number(selectedYear)) {
        return false;
      }

      // 5. Semester Filter
      if (selectedSemester !== 'ALL' && Number(student.semester) !== Number(selectedSemester)) {
        return false;
      }

      // 6. Section Filter
      if (selectedSection !== 'ALL' && student.section.toUpperCase() !== selectedSection.toUpperCase()) {
        return false;
      }

      // 7. Search Query
      if (!query) return true;
      const matchesStudent =
        student.studentRollNumber.toLowerCase().includes(query) ||
        student.studentName.toLowerCase().includes(query) ||
        student.branch.toLowerCase().includes(query) ||
        (student.college && student.college.toLowerCase().includes(query)) ||
        (student.course && student.course.toLowerCase().includes(query));
      if (matchesStudent) return true;

      return student.subjects.some(
        (sub) =>
          sub.subjectCode.toLowerCase().includes(query) ||
          sub.subjectName.toLowerCase().includes(query),
      );
    });
  }, [
    selectedRegulationId,
    students,
    selectedCollegeId,
    collegeOptions,
    selectedCourseId,
    courseOptions,
    selectedBranch,
    selectedYear,
    selectedSemester,
    selectedSection,
    searchQuery,
  ]);

  const totalSubjectRecords = useMemo(
    () => filteredStudents.reduce((acc, st) => acc + st.subjects.length, 0),
    [filteredStudents],
  );

  // Overall internal performance stats for the selected hierarchy
  const internalStats = useMemo(() => {
    let totalEvaluated = 0;
    let totalPassed = 0;
    let totalFailed = 0;
    let totalPending = 0;

    for (const student of filteredStudents) {
      for (const sub of student.subjects) {
        const res = getInternalMarksCalculation(sub, activeExams);
        if (res.marks !== null) {
          totalEvaluated++;
          if (res.isPass) {
            totalPassed++;
          } else {
            totalFailed++;
          }
        } else {
          totalPending++;
        }
      }
    }

    const passRate = totalEvaluated > 0 ? Number(((totalPassed / totalEvaluated) * 100).toFixed(1)) : 0;
    return { totalEvaluated, totalPassed, totalFailed, totalPending, passRate };
  }, [filteredStudents, activeExams]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const paginatedStudents = filteredStudents.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleResetFilters = () => {
    setSelectedCollegeId('ALL');
    setSelectedCourseId('ALL');
    setSelectedBranch('ALL');
    setSelectedYear('ALL');
    setSelectedSemester('ALL');
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
      'Regulation',
      'College',
      'Course',
      'Branch',
      'Academic Year',
      'Year of Study',
      'Semester',
      'Section',
      'Subject Code',
      'Subject Name',
      ...examHeaders,
      'Final Internal Marks (80% Best + 20% Other / 30)',
      'Internal Result Status (Min 16 to Pass)',
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
        const calc = getInternalMarksCalculation(sub, activeExams);

        csvRows.push([
          String(sNo++),
          student.studentRollNumber,
          student.studentName,
          selectedRegulation?.code || 'N/A',
          student.college || selectedCollegeId || 'N/A',
          student.course || selectedCourseId || 'N/A',
          student.branch,
          student.academicYear,
          String(student.yearOfStudy),
          String(student.semester),
          student.section,
          sub.subjectCode,
          sub.subjectName,
          ...examMarksValues,
          calc.marks === null ? 'Pending (Awaiting 2nd Mid)' : String(calc.marks),
          calc.status === 'PENDING'
            ? 'Pending (Awaiting 2nd Mid)'
            : calc.isPass
              ? 'PASS (>= 16)'
              : 'FAIL (Below 16)',
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
        subjectCode: unlockSubjectCode,
        reason: unlockReason.trim(),
        facultyName: finalFacultyName,
        facultyEmail: finalFacultyEmail,
      });
      toast.push(res.message || 'Internal marks access unlocked successfully.', 'success');
      setIsUnlockModalOpen(false);
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
        subjectCode: unlockSubjectCode,
        reason: 'Administrative access revocation via unlock modal',
      });
      toast.push(res.message || 'Access re-locked successfully.', 'success');
      setIsUnlockModalOpen(false);
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
            <Button variant="secondary" size="sm" onClick={handleExportCsv} disabled={filteredStudents.length === 0}>
              <svg className="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export CSV
            </Button>
            <Button variant="secondary" size="sm" onClick={handleResetFilters} disabled={!selectedRegulationId}>
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
          Marks Details & Student Candidate List
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

      {/* 1. PRIMARY CASCADING FILTER TOOLBAR (Always visible so user can select Regulation) */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold">
              1
            </span>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Institutional Cascade Hierarchy Selection
            </h2>
          </div>
          <span className="text-[11px] text-slate-500">
            {selectedRegulationId
              ? 'Regulation active. Filter by College, Course, Branch, Year & Semester'
              : 'Please select a Regulation to begin'}
          </span>
        </div>

        {/* 6 Cascading Dropdowns */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {/* 1. Regulation */}
          <label className="text-[11px] font-semibold text-slate-700 block">
            <span className="flex items-center gap-1 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
              Regulation <span className="text-rose-500">*</span>
            </span>
            <select
              value={selectedRegulationId ?? ''}
              disabled={loadingNotifications || regulationOptions.length === 0}
              onChange={(event) => {
                const val = event.target.value;
                const nextId = val ? Number(val) : null;
                setSelectedRegulationId(nextId);
                setSelectedCollegeId('ALL');
                setSelectedCourseId('ALL');
                setSelectedBranch('ALL');
                setSelectedYear('ALL');
                setSelectedSemester('ALL');
                setSelectedSection('ALL');
                setCurrentPage(1);
              }}
              className="block w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">-- Select Regulation --</option>
              {regulationOptions.map((regulation) => (
                <option key={regulation.id} value={regulation.id}>
                  {regulation.code}
                  {regulation.name ? ` - ${regulation.name}` : ''}
                </option>
              ))}
            </select>
          </label>

          {/* 2. College */}
          <label className="text-[11px] font-semibold text-slate-700 block">
            <span className="flex items-center gap-1 mb-1">
              <span className={`w-1.5 h-1.5 rounded-full ${selectedRegulationId ? 'bg-sky-600' : 'bg-slate-300'}`} />
              College
            </span>
            <select
              value={selectedCollegeId}
              disabled={!selectedRegulationId}
              onChange={(event) => {
                setSelectedCollegeId(event.target.value);
                setSelectedCourseId('ALL');
                setSelectedBranch('ALL');
                setSelectedYear('ALL');
                setSelectedSemester('ALL');
                setSelectedSection('ALL');
                setCurrentPage(1);
              }}
              className={`block w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-medium ${
                !selectedRegulationId
                  ? 'bg-slate-50 text-slate-400 cursor-not-allowed border-slate-200'
                  : 'bg-white text-slate-900 focus:border-sky-500 focus:ring-1 focus:ring-sky-500'
              }`}
            >
              <option value="ALL">
                {!selectedRegulationId ? 'Select Regulation first' : 'All Colleges'}
              </option>
              {collegeOptions.map((college) => (
                <option key={college.key} value={college.key}>
                  {college.name}
                </option>
              ))}
            </select>
          </label>

          {/* 3. Course */}
          <label className="text-[11px] font-semibold text-slate-700 block">
            <span className="flex items-center gap-1 mb-1">
              <span className={`w-1.5 h-1.5 rounded-full ${selectedRegulationId ? 'bg-emerald-600' : 'bg-slate-300'}`} />
              Course
            </span>
            <select
              value={selectedCourseId}
              disabled={!selectedRegulationId}
              onChange={(event) => {
                setSelectedCourseId(event.target.value);
                setSelectedBranch('ALL');
                setSelectedYear('ALL');
                setSelectedSemester('ALL');
                setSelectedSection('ALL');
                setCurrentPage(1);
              }}
              className={`block w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-medium ${
                !selectedRegulationId
                  ? 'bg-slate-50 text-slate-400 cursor-not-allowed border-slate-200'
                  : 'bg-white text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
              }`}
            >
              <option value="ALL">
                {!selectedRegulationId ? 'Select Regulation first' : 'All Courses'}
              </option>
              {courseOptions.map((course) => (
                <option key={course.key} value={course.key}>
                  {course.name} {course.totalYears ? `(${course.totalYears} Yrs)` : ''}
                </option>
              ))}
            </select>
          </label>

          {/* 4. Branch */}
          <label className="text-[11px] font-semibold text-slate-700 block">
            <span className="flex items-center gap-1 mb-1">
              <span className={`w-1.5 h-1.5 rounded-full ${selectedRegulationId ? 'bg-amber-600' : 'bg-slate-300'}`} />
              Branch
            </span>
            <select
              value={selectedBranch}
              disabled={!selectedRegulationId}
              onChange={(event) => {
                setSelectedBranch(event.target.value);
                setSelectedYear('ALL');
                setSelectedSemester('ALL');
                setSelectedSection('ALL');
                setCurrentPage(1);
              }}
              className={`block w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-medium ${
                !selectedRegulationId
                  ? 'bg-slate-50 text-slate-400 cursor-not-allowed border-slate-200'
                  : 'bg-white text-slate-900 focus:border-amber-500 focus:ring-1 focus:ring-amber-500'
              }`}
            >
              <option value="ALL">
                {!selectedRegulationId ? 'Select Regulation first' : 'All Branches'}
              </option>
              {branchOptions.map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </select>
          </label>

          {/* 5. Year (Dynamically Configured from Course/Branch) */}
          <label className="text-[11px] font-semibold text-slate-700 block">
            <span className="flex items-center gap-1 mb-1">
              <span className={`w-1.5 h-1.5 rounded-full ${selectedRegulationId ? 'bg-violet-600' : 'bg-slate-300'}`} />
              Year of Study
            </span>
            <select
              value={selectedYear}
              disabled={!selectedRegulationId}
              onChange={(event) => {
                setSelectedYear(event.target.value);
                setSelectedSemester('ALL');
                setCurrentPage(1);
              }}
              className={`block w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-medium ${
                !selectedRegulationId
                  ? 'bg-slate-50 text-slate-400 cursor-not-allowed border-slate-200'
                  : 'bg-white text-slate-900 focus:border-violet-500 focus:ring-1 focus:ring-violet-500'
              }`}
            >
              <option value="ALL">
                {!selectedRegulationId
                  ? 'Select Regulation first'
                  : `All Years (1 - ${configuredTotalYears})`}
              </option>
              {yearOptions.map((opt) => (
                <option key={opt.year} value={String(opt.year)}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          {/* 6. Semester (Dynamically Configured from Year/Branch) */}
          <label className="text-[11px] font-semibold text-slate-700 block">
            <span className="flex items-center gap-1 mb-1">
              <span className={`w-1.5 h-1.5 rounded-full ${selectedRegulationId ? 'bg-rose-600' : 'bg-slate-300'}`} />
              Semester
            </span>
            <select
              value={selectedSemester}
              disabled={!selectedRegulationId}
              onChange={(event) => {
                setSelectedSemester(event.target.value);
                setCurrentPage(1);
              }}
              className={`block w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-medium ${
                !selectedRegulationId
                  ? 'bg-slate-50 text-slate-400 cursor-not-allowed border-slate-200'
                  : 'bg-white text-slate-900 focus:border-rose-500 focus:ring-1 focus:ring-rose-500'
              }`}
            >
              <option value="ALL">
                {!selectedRegulationId
                  ? 'Select Regulation first'
                  : selectedYear !== 'ALL'
                    ? `All Sems (Year ${selectedYear})`
                    : 'All Semesters'}
              </option>
              {semesterOptions.map((opt) => (
                <option key={opt.semester} value={String(opt.semester)}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Secondary Row: Section, Search, and Active Breadcrumbs */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
            <div className="w-36">
              <select
                value={selectedSection}
                disabled={!selectedRegulationId}
                onChange={(event) => {
                  setSelectedSection(event.target.value);
                  setCurrentPage(1);
                }}
                className={`block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 ${
                  !selectedRegulationId ? 'bg-slate-100 opacity-60 cursor-not-allowed' : 'bg-slate-50'
                }`}
              >
                <option value="ALL">All Sections</option>
                {availableSections.map((section) => (
                  <option key={section} value={section}>
                    Section {section}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-[220px] flex-1 max-w-md">
              <input
                type="search"
                value={searchQuery}
                disabled={!selectedRegulationId}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder={
                  !selectedRegulationId
                    ? 'Select a regulation first...'
                    : 'Search PIN / roll, name, subject...'
                }
                className={`block w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 ${
                  !selectedRegulationId ? 'bg-slate-100 opacity-60 cursor-not-allowed' : 'bg-slate-50 focus:bg-white focus:outline-hidden'
                }`}
              />
            </div>
          </div>

          {/* Active Cascade Pills */}
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="font-semibold text-slate-700">Cascade:</span>
            <span
              className={`px-2 py-0.5 rounded font-bold border ${
                selectedRegulation
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                  : 'bg-slate-100 text-slate-400 border-slate-200'
              }`}
            >
              {selectedRegulation?.code || 'None Selected'}
            </span>
            {selectedRegulation && (
              <>
                <span>›</span>
                <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-700 font-medium border border-sky-200">
                  {selectedCollegeId === 'ALL'
                    ? 'All Colleges'
                    : collegeOptions.find((c) => c.key === selectedCollegeId)?.name || selectedCollegeId}
                </span>
                <span>›</span>
                <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium border border-emerald-200">
                  {selectedCourseId === 'ALL'
                    ? 'All Courses'
                    : courseOptions.find((c) => c.key === selectedCourseId)?.name || selectedCourseId}
                </span>
                <span>›</span>
                <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-medium border border-amber-200">
                  {selectedBranch}
                </span>
                <span>›</span>
                <span className="px-2 py-0.5 rounded bg-violet-50 text-violet-700 font-medium border border-violet-200">
                  {selectedYear === 'ALL' ? 'All Years' : `Year ${selectedYear}`}
                </span>
                <span>›</span>
                <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-medium border border-rose-200">
                  {selectedSemester === 'ALL' ? 'All Sems' : `Sem ${selectedSemester}`}
                </span>
              </>
            )}
          </div>
        </div>
      </section>

      {/* TOP STATS OVERVIEW CARDS: ONLY RENDERED ONCE A REGULATION IS SELECTED */}
      {selectedRegulationId !== null && (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Selected Hierarchy Scope */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Academic Scope
                </p>
                <h3 className="text-base font-bold text-slate-900 truncate">
                  {selectedRegulation?.code || 'Regulation'}
                </h3>
                <p className="text-[11px] text-slate-500 truncate">
                  {selectedCollegeId === 'ALL'
                    ? 'All Colleges'
                    : collegeOptions.find((c) => c.key === selectedCollegeId)?.name || selectedCollegeId}
                </p>
              </div>
            </div>
          </div>

          {/* Dynamic Course & Branch Configuration */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Course & Branch Config
                </p>
                <h3 className="text-base font-bold text-slate-900 truncate">
                  {selectedCourseId === 'ALL'
                    ? 'All Courses'
                    : courseOptions.find((c) => c.key === selectedCourseId)?.name || selectedCourseId}
                  {selectedBranch !== 'ALL' && ` · ${selectedBranch}`}
                </h3>
                <p className="text-[11px] text-slate-500 truncate">
                  {configuredTotalYears} Years ({configuredTotalYears * 2} Semesters Configured)
                </p>
              </div>
            </div>
          </div>

          {/* Total Students in Selected Hierarchy */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Enrolled Candidate Students
                </p>
                <h3 className="text-base font-bold text-slate-900 truncate">
                  {filteredStudents.length} Students
                </h3>
                <p className="text-[11px] text-slate-500 truncate">
                  {totalSubjectRecords} Subject Registrations
                </p>
              </div>
            </div>
          </div>

          {/* Results Overview (Pass in green, Fail in rose) */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Performance
                  </p>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                    {internalStats.passRate}% Pass
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 truncate">
                  <span className="text-emerald-700 font-extrabold">{internalStats.totalPassed} Passed</span>
                  <span className="text-xs font-normal text-slate-400 ml-1">/ {internalStats.totalEvaluated}</span>
                </h3>
                <p className="text-[11px] text-slate-500 truncate">
                  <span className="text-rose-600 font-semibold">{internalStats.totalFailed} Below 16</span>
                  <span className="mx-1 text-slate-300">·</span>
                  <span className="text-amber-600 font-semibold">{internalStats.totalPending} Pending</span>
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Quick Info & Action Header: ONLY SHOWN ONCE A REGULATION IS SELECTED */}
      {selectedRegulationId !== null && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs shadow-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-slate-900 text-sm">
              Student Candidate Marks List ({selectedRegulation?.code})
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-600 font-medium">
              <strong className="text-slate-900">{filteredStudents.length}</strong> Candidate Student{filteredStudents.length === 1 ? '' : 's'}
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-600 font-medium">
              <strong className="text-slate-900">{totalSubjectRecords}</strong> Subject Records
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-600 font-medium">
              {activeExams.length} Examination{activeExams.length === 1 ? '' : 's'}
            </span>
          </div>

          {/* Quick Sems Filter Pill Strip */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-1.5">Sem:</span>
            <button
              type="button"
              onClick={() => { setSelectedSemester('ALL'); setCurrentPage(1); }}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                selectedSemester === 'ALL'
                  ? 'bg-white text-indigo-700 shadow-2xs font-bold border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Sems
            </button>
            {semesterOptions.map((s) => (
              <button
                key={s.semester}
                type="button"
                onClick={() => { setSelectedSemester(String(s.semester)); setCurrentPage(1); }}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                  selectedSemester === String(s.semester)
                    ? 'bg-white text-indigo-700 shadow-2xs font-bold border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sem {s.semester}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      {!selectedRegulationId ? (
        /* PROMPT WHEN NO REGULATION IS SELECTED - DO NOT RENDER DATA */
        <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center shadow-xs">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 mb-4 border border-indigo-100 shadow-2xs">
            <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
          </div>
          <h3 className="text-base font-bold text-slate-900">Please Select an Academic Regulation</h3>
          <p className="mt-1.5 text-xs text-slate-500 max-w-md mx-auto">
            Select a Regulation from the cascade controls above to configure course, branch, and load enrolled candidate students with internal marks.
          </p>
        </div>
      ) : loadingRows ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-xs">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
          <p className="mt-2 text-xs font-medium text-slate-600">
            Loading student candidate list and marks for {selectedRegulation?.code}...
          </p>
        </div>
      ) : activeTab === 'faculty-unlocks' ? (
        /* TAB 2: FACULTY ACCESS & UNLOCKS */
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-900 font-bold">
              !
            </span>
            <div>
              <p className="font-bold text-amber-950">4-Day Deadline Enforcement & Faculty Access Control</p>
              <p className="mt-0.5 text-amber-800">
                Marks entry is automatically open for all enrolled faculty during the 4 calendar days from each examination date.
                Once the 4-day deadlock is reached, marks entry is locked and the <strong>&quot;Unlock for Faculty&quot;</strong> action will appear to allow granting explicit faculty access overrides.
              </p>
            </div>
          </div>

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
          <svg className="mx-auto h-12 w-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <p className="mt-3 text-sm font-semibold text-slate-700">No candidate student records found for {selectedRegulation?.code}</p>
          <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
            Try adjusting the College, Course, Branch, or Year filters to view candidate students registered under this regulation.
          </p>
          <div className="mt-4">
            <Button variant="secondary" size="sm" onClick={handleResetFilters}>
              Reset Hierarchy Filters
            </Button>
          </div>
        </div>
      ) : (
        /* TAB 1: MARKS DETAILS & CANDIDATE STUDENTS LIST */
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-700 font-semibold sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-3 text-center w-12 font-semibold">#</th>
                    <th className="px-3 py-3 font-semibold min-w-[120px]">PIN / Roll No</th>
                    <th className="px-3 py-3 font-semibold min-w-[200px]">Student Name & Details</th>
                    <th className="px-3 py-3 font-semibold min-w-[180px]">Subject Code & Name</th>
                    {/* Separate Mid Exam Columns */}
                    {activeExams.map((exam) => (
                      <th
                        key={exam.id}
                        className="px-3 py-3 text-center font-semibold min-w-[130px] border-l border-slate-200/80"
                      >
                        <div className="font-bold text-slate-900">{exam.title}</div>
                        <div className="text-[10px] text-slate-500 font-normal">{exam.type}</div>
                      </th>
                    ))}
                    <th className="px-3 py-3 text-center font-semibold min-w-[160px] border-l border-slate-200/80 bg-slate-50/70">
                      <div className="text-slate-900 font-bold">Final Internal (/30)</div>
                      <div className="text-[10px] text-slate-500 font-normal">80% Best + 20% Other · Min 16</div>
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
                          <td className="px-3 py-3">
                            <div className="font-bold text-slate-900">{student.studentName}</div>
                            <div className="text-[11px] text-slate-500">
                              {student.branch} · Yr {student.yearOfStudy || 1} · Sem {student.semester || 1} {student.section ? `(${student.section})` : ''}
                            </div>
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
                      const calcResult = getInternalMarksCalculation(sub, activeExams);

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
                                <button
                                  type="button"
                                  onClick={() => setSelectedStudentDetail(student)}
                                  className="font-mono font-bold text-xs px-2.5 py-1 rounded-md bg-sky-50 text-sky-900 border border-sky-200 hover:bg-sky-100 hover:border-sky-300 transition-colors shadow-2xs inline-block text-left cursor-pointer"
                                  title="Click to view full student internal marks summary"
                                >
                                  {student.studentRollNumber}
                                </button>
                                <div className="mt-1 text-[10px] text-slate-400 font-mono">
                                  {student.academicYear}
                                </div>
                              </td>
                              <td
                                rowSpan={subjectCount}
                                className="px-3 py-3 align-top border-b border-slate-200 bg-inherit"
                              >
                                <div className="font-bold text-slate-900 text-xs">
                                  {student.studentName}
                                </div>
                                <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                  <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                    {student.branch}
                                  </span>
                                  <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                    Yr {student.yearOfStudy || 1} / Sem {student.semester || 1}
                                  </span>
                                  {student.section && student.section !== '-' && (
                                    <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-100 text-slate-700">
                                      Sec {student.section}
                                    </span>
                                  )}
                                </div>
                                <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                                  <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-200/80 text-slate-700">
                                    Total
                                  </span>
                                  <span>
                                    {calculatedTotal ? (
                                      <>
                                        <strong className="text-slate-800">{calculatedTotal.obtained}</strong>{' '}
                                        / {calculatedTotal.maximum}
                                        {calculatedTotal.isFullyCalculated && (
                                          <span className="ml-1 text-[10px] text-slate-600 font-medium">
                                            ({calculatedTotal.passCount} Pass, {calculatedTotal.failCount} Fail)
                                          </span>
                                        )}
                                      </>
                                    ) : (
                                      <strong className="text-slate-500">Calculation pending</strong>
                                    )}
                                  </span>
                                </div>
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
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-50 text-slate-500 border border-slate-200">
                                    Not Entered
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
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                    ABSENT
                                  </span>
                                </td>
                              );
                            }
                            const isMidPass = (mark.marksObtained ?? 0) >= (mark.maxMarks >= 30 ? 16 : Math.ceil(mark.maxMarks * 0.5));
                            return (
                              <td
                                key={exam.id}
                                className={`px-3 py-2.5 text-center border-l border-slate-100 ${studentBorderClass}`}
                              >
                                <span
                                  className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold border shadow-2xs ${
                                    isMidPass
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : 'bg-rose-50 text-rose-700 border-rose-200'
                                  }`}
                                >
                                  {mark.marksObtained} / {mark.maxMarks}
                                </span>
                              </td>
                            );
                          })}

                          {/* Final Internal Marks (80% Best + 20% Other / 30) - Green is Pass, Rose is Fail */}
                          <td
                            className={`px-3 py-2.5 text-center font-bold text-slate-900 border-l border-slate-100 ${studentBorderClass}`}
                          >
                            {calcResult.marks === null ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                Pending
                              </span>
                            ) : calcResult.isPass ? (
                              <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-bold text-xs bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-2xs">
                                <span className="text-sm font-extrabold text-emerald-700">{calcResult.marks}</span>
                                <span className="text-[10px] text-emerald-600 font-medium">/ 30</span>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-bold text-xs bg-rose-50 text-rose-800 border border-rose-300 shadow-2xs">
                                <span className="text-sm font-extrabold text-rose-700">{calcResult.marks}</span>
                                <span className="text-[10px] text-rose-600 font-medium">/ 30</span>
                              </div>
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
        </div>
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

      {/* Student Detailed Semester Internal Marks Modal */}
      {selectedStudentDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">
                    {selectedStudentDetail.studentName}
                  </h3>
                  <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded bg-sky-50 text-sky-900 border border-sky-200">
                    {selectedStudentDetail.studentRollNumber}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">
                    Year {selectedStudentDetail.yearOfStudy || 1} · Semester {selectedStudentDetail.semester || 1}
                  </span>
                  <span>·</span>
                  <span>Branch: <strong>{selectedStudentDetail.branch}</strong></span>
                  <span>·</span>
                  <span>Sec: <strong>{selectedStudentDetail.section || '-'}</strong></span>
                  {selectedStudentDetail.college && (
                    <>
                      <span>·</span>
                      <span>College: <strong>{selectedStudentDetail.college}</strong></span>
                    </>
                  )}
                  {selectedStudentDetail.course && (
                    <>
                      <span>·</span>
                      <span>Course: <strong>{selectedStudentDetail.course}</strong></span>
                    </>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStudentDetail(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Student Quick Stats */}
            {(() => {
              const summary = getStudentCalculatedTotal(selectedStudentDetail, activeExams);
              return (
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5 text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Subjects</p>
                    <p className="text-sm font-bold text-slate-900 mt-0.5">{selectedStudentDetail.subjects.length}</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Passed (≥16)</p>
                    <p className="text-sm font-bold text-emerald-800 mt-0.5">{summary?.passCount ?? 0}</p>
                  </div>
                  <div className="rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-700">Below 16</p>
                    <p className="text-sm font-bold text-rose-800 mt-0.5">{summary?.failCount ?? 0}</p>
                  </div>
                  <div className="rounded-lg bg-sky-50 border border-sky-200 p-2.5 text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-700">Total Score</p>
                    <p className="text-sm font-bold text-sky-900 mt-0.5">
                      {summary?.obtained ?? 0} <span className="text-[11px] font-normal text-slate-500">/ {summary?.maximum ?? 0}</span>
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* Subjects Wise List for this student */}
            <div className="mt-4 overflow-y-auto flex-1 rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold sticky top-0">
                  <tr>
                    <th className="px-3 py-2.5">Subject</th>
                    {activeExams.map((e) => (
                      <th key={e.id} className="px-3 py-2.5 text-center border-l border-slate-200">
                        {e.title}
                      </th>
                    ))}
                    <th className="px-3 py-2.5 text-center border-l border-slate-200 bg-slate-100/50">
                      Final Internal (/30)
                    </th>
                    <th className="px-3 py-2.5 text-center border-l border-slate-200">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedStudentDetail.subjects.map((sub) => {
                    const calc = getInternalMarksCalculation(sub, activeExams);
                    return (
                      <tr key={sub.subjectCode} className="hover:bg-slate-50/50">
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-slate-900">{sub.subjectCode}</div>
                          <div className="text-[11px] text-slate-500">{sub.subjectName}</div>
                        </td>
                        {activeExams.map((e) => {
                          const mark = sub.examMarks[e.id];
                          if (!mark || !mark.isEligible) {
                            return (
                              <td key={e.id} className="px-3 py-2.5 text-center text-slate-400 border-l border-slate-100">
                                -
                              </td>
                            );
                          }
                          if (!mark.isEntered) {
                            return (
                              <td key={e.id} className="px-3 py-2.5 text-center border-l border-slate-100">
                                <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                                  Not Entered
                                </span>
                              </td>
                            );
                          }
                          if (mark.isAbsent) {
                            return (
                              <td key={e.id} className="px-3 py-2.5 text-center border-l border-slate-100">
                                <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                  ABSENT
                                </span>
                              </td>
                            );
                          }
                          const isPass = (mark.marksObtained ?? 0) >= (mark.maxMarks >= 30 ? 16 : Math.ceil(mark.maxMarks * 0.5));
                          return (
                            <td key={e.id} className="px-3 py-2.5 text-center border-l border-slate-100">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${
                                  isPass
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-rose-50 text-rose-700 border-rose-200'
                                }`}
                              >
                                {mark.marksObtained} / {mark.maxMarks}
                              </span>
                            </td>
                          );
                        })}
                        <td className="px-3 py-2.5 text-center border-l border-slate-100 bg-slate-50/30">
                          {calc.marks === null ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                              Pending
                            </span>
                          ) : calc.isPass ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {calc.marks} / 30
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                              {calc.marks} / 30
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center border-l border-slate-100">
                          {calc.status === 'PENDING' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200">
                              Pending (Awaiting Mid)
                            </span>
                          ) : calc.isPass ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200">
                              PASS (≥16)
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200">
                              FAIL (&lt;16)
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex justify-end">
              <Button variant="secondary" size="sm" onClick={() => setSelectedStudentDetail(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
