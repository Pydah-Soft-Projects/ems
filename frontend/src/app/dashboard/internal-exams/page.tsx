/* eslint-disable react-hooks/set-state-in-effect */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { Regulation } from '@/types/regulation';
import { Exam, ExamStatus, CreateExamInput } from '@/types/exam';
import { SubjectMappingEntry } from '@/types/subject';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { LoadingBlock } from '@/components/ui/Spinner';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { TextareaField } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { StatusFilter } from '@/components/ui/SoftSearch';

interface InternalScopeOption {
  key: string;
  collegeId: number;
  college: string;
  courseId: number;
  course: string;
  branchId: number;
  branch: string;
  batch: string;
  yearOfStudy: number;
  semester: number;
  mappings: SubjectMappingEntry[];
}

interface ScopeDisplayRow {
  college?: string | null;
  course: string;
  branch: string;
  section?: string | null;
  batch: string;
  yearOfStudy: number;
  semester: number;
}

interface GroupedScopeDisplay {
  college?: string | null;
  course: string;
  batch: string;
  yearOfStudy: number;
  semester: number;
  branches: string[];
}

const creationSteps = ['Scope', 'Subjects', 'Dates', 'Review'];
type ExamStatusFilter = 'all' | ExamStatus;

const statusTabs: { id: ExamStatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Draft' },
  { id: 'pending_approval', label: 'Pending approval' },
  { id: 'approved', label: 'Approved' },
  { id: 'published', label: 'Published' },
  { id: 'rejected', label: 'Rejected' },
];

interface FilterOption {
  value: string;
  label: string;
}

function MultiSelectFilter({
  label,
  options,
  values,
  onChange,
  disabled,
  emptyMessage,
}: {
  label: string;
  options: FilterOption[];
  values: string[];
  onChange: (values: string[]) => void;
  disabled: boolean;
  emptyMessage: string;
}) {
  const allSelected = options.length > 0 && values.length === options.length;

  function toggle(value: string) {
    onChange(
      values.includes(value)
        ? values.filter((selected) => selected !== value)
        : [...values, value],
    );
  }

  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-slate-700">
          {label}
          {values.length > 0 ? ` (${values.length} selected)` : ''}
        </h3>
        {options.length > 0 ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(allSelected ? [] : options.map((option) => option.value))}
            className="text-xs font-medium text-[var(--primary)] hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
        ) : null}
      </div>
      {options.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--border)] bg-slate-50 p-3 text-xs text-[var(--muted)]">
          {emptyMessage}
        </p>
      ) : (
        <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-[var(--border)] bg-white p-2">
          {options.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={values.includes(option.value)}
                disabled={disabled}
                onChange={() => toggle(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      )}
    </section>
  );
}

function groupMappings(mappings: SubjectMappingEntry[]): InternalScopeOption[] {
  const grouped = new Map<string, InternalScopeOption>();
  for (const mapping of mappings) {
    const parts = [
      mapping.collegeId,
      mapping.courseId,
      mapping.branchId,
      mapping.batch,
      mapping.yearOfStudy,
      mapping.semester,
    ];
    const key = JSON.stringify(parts);
    const scope = grouped.get(key);
    if (scope) {
      scope.mappings.push(mapping);
    } else {
      grouped.set(key, {
        key,
        collegeId: mapping.collegeId,
        college: mapping.collegeName,
        courseId: mapping.courseId,
        course: mapping.courseName,
        branchId: mapping.branchId,
        branch: mapping.branchName,
        batch: mapping.batch,
        yearOfStudy: mapping.yearOfStudy,
        semester: mapping.semester,
        mappings: [mapping],
      });
    }
  }
  return [...grouped.values()].sort((a, b) =>
    `${a.college} ${a.course} ${a.branch} ${a.batch} ${a.yearOfStudy} ${a.semester}`
      .localeCompare(
        `${b.college} ${b.course} ${b.branch} ${b.batch} ${b.yearOfStudy} ${b.semester}`,
      ),
  );
}

function groupScopeDisplayRows(rows: ScopeDisplayRow[]): GroupedScopeDisplay[] {
  const grouped = new Map<string, GroupedScopeDisplay>();
  for (const row of rows) {
    const common = {
      college: row.college,
      course: row.course,
      batch: row.batch,
      yearOfStudy: row.yearOfStudy,
      semester: row.semester,
    };
    const key = JSON.stringify(common);
    const branch = row.section
      ? `${row.branch} (${row.section})`
      : row.branch;
    const group = grouped.get(key);
    if (group) {
      if (!group.branches.includes(branch)) group.branches.push(branch);
    } else {
      grouped.set(key, { ...common, branches: [branch] });
    }
  }
  return [...grouped.values()];
}

export default function InternalExamsPage() {
  const toast = useToast();
  const user = getStoredUser();
  const canRead = can(user, ['internal_exams:read', 'internal_exams:write']);
  const canWrite = can(user, 'internal_exams:write');
  const canSubmit = can(user, 'exams:submit');
  const canApprove = can(user, 'exams:approve');
  const canPublish = can(user, 'exams:publish');
  const [regulations, setRegulations] = useState<Regulation[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [statusFilter, setStatusFilter] = useState<ExamStatusFilter>('all');
  const [listCollege, setListCollege] = useState('all');
  const [listCourse, setListCourse] = useState('all');
  const [listBranch, setListBranch] = useState('all');
  const [listYear, setListYear] = useState('all');
  const [listSemester, setListSemester] = useState('all');
  const [savingAction, setSavingAction] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectExam, setRejectExam] = useState<Exam | null>(null);
  const [rejectRemarks, setRejectRemarks] = useState('');
  const [viewExam, setViewExam] = useState<Exam | null>(null);
  const [publishExam, setPublishExam] = useState<Exam | null>(null);
  const [mappings, setMappings] = useState<SubjectMappingEntry[]>([]);
  const [regulationId, setRegulationId] = useState('');
  const [collegeIds, setCollegeIds] = useState<string[]>([]);
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [batches, setBatches] = useState<string[]>([]);
  const [yearOfStudies, setYearOfStudies] = useState<string[]>([]);
  const [semesters, setSemesters] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [examDates, setExamDates] = useState<Record<number, string>>({});
  const [selectedSubjects, setSelectedSubjects] = useState<Set<number>>(
    new Set(),
  );
  const [editingExamId, setEditingExamId] = useState<number | null>(null);
  const [creationOpen, setCreationOpen] = useState(false);
  const [creationStep, setCreationStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMappings, setLoadingMappings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [regulationList, examList] = await Promise.all([
        api.getInternalExamRegulations(),
        api.getInternalExams(),
      ]);
      setRegulations(regulationList.filter((regulation) => regulation.status === 'active'));
      setExams(examList);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to load internal examination notifications.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canRead) void load();
  }, [canRead, load]);

  useEffect(() => {
    if (!regulationId) {
      setMappings([]);
      setCollegeIds([]);
      setCourseIds([]);
      setBranchIds([]);
      setBatches([]);
      setYearOfStudies([]);
      setSemesters([]);
      return;
    }
    let cancelled = false;
    setLoadingMappings(true);
    setError('');
    api
      .getInternalExamSubjectMappings(Number(regulationId))
      .then((entries) => {
        if (!cancelled) setMappings(entries);
      })
      .catch((err) => {
        if (!cancelled) {
          setMappings([]);
          setError(
            err instanceof ApiError
              ? err.message
              : 'Failed to load mapped subjects.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingMappings(false);
      });
    return () => {
      cancelled = true;
    };
  }, [regulationId]);

  const scopes = useMemo(() => groupMappings(mappings), [mappings]);
  const courseScoped = useMemo(
    () =>
      scopes.filter((scope) => collegeIds.includes(String(scope.collegeId))),
    [collegeIds, scopes],
  );
  const branchScoped = useMemo(
    () =>
      courseScoped.filter((scope) =>
        courseIds.includes(String(scope.courseId)),
      ),
    [courseIds, courseScoped],
  );
  const batchScoped = useMemo(
    () =>
      branchScoped.filter((scope) =>
        branchIds.includes(String(scope.branchId)),
      ),
    [branchIds, branchScoped],
  );
  const yearScoped = useMemo(
    () => batchScoped.filter((scope) => batches.includes(scope.batch)),
    [batches, batchScoped],
  );
  const semesterScoped = useMemo(
    () =>
      yearScoped.filter((scope) =>
        yearOfStudies.includes(String(scope.yearOfStudy)),
      ),
    [yearOfStudies, yearScoped],
  );
  const collegeOptions = useMemo(
    () =>
      [...new Map(
        scopes.map((scope) => [
          String(scope.collegeId),
          { value: String(scope.collegeId), label: scope.college },
        ]),
      ).values()],
    [scopes],
  );
  const courseOptions = useMemo(
    () =>
      [...new Map(
        courseScoped.map((scope) => [
          String(scope.courseId),
          { value: String(scope.courseId), label: scope.course },
        ]),
      ).values()],
    [courseScoped],
  );
  const branchOptions = useMemo(
    () =>
      [...new Map(
        branchScoped.map((scope) => [
          String(scope.branchId),
          { value: String(scope.branchId), label: scope.branch },
        ]),
      ).values()],
    [branchScoped],
  );
  const batchOptions = useMemo(
    () =>
      [...new Set(batchScoped.map((scope) => scope.batch))]
        .sort()
        .map((value) => ({ value, label: value })),
    [batchScoped],
  );
  const yearOptions = useMemo(
    () =>
      [...new Set(yearScoped.map((scope) => scope.yearOfStudy))]
        .sort((a, b) => a - b)
        .map((value) => ({ value: String(value), label: `Year ${value}` })),
    [yearScoped],
  );
  const semesterOptions = useMemo(
    () =>
      [...new Set(semesterScoped.map((scope) => scope.semester))]
        .sort((a, b) => a - b)
        .map((value) => ({ value: String(value), label: `Semester ${value}` })),
    [semesterScoped],
  );
  const selectedScopes = useMemo(
    () =>
      scopes.filter(
        (scope) =>
          collegeIds.includes(String(scope.collegeId)) &&
          courseIds.includes(String(scope.courseId)) &&
          branchIds.includes(String(scope.branchId)) &&
          batches.includes(scope.batch) &&
          yearOfStudies.includes(String(scope.yearOfStudy)) &&
          semesters.includes(String(scope.semester)),
      ),
    [
      batches,
      branchIds,
      collegeIds,
      courseIds,
      scopes,
      semesters,
      yearOfStudies,
    ],
  );
  const selectedMappings = useMemo(
    () => selectedScopes.flatMap((scope) => scope.mappings),
    [selectedScopes],
  );
  const subjects = useMemo(() => {
    if (selectedScopes.length === 0) return [];
    const unique = new Map<number, SubjectMappingEntry['subject']>();
    selectedMappings.forEach((mapping) => {
      if (mapping.subject) unique.set(mapping.subjectId, mapping.subject);
    });
    return [...unique.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [selectedScopes.length, selectedMappings]);

  const listScopeRows = useMemo(
    () =>
      exams.flatMap((exam) =>
        exam.scopes?.length
          ? exam.scopes
          : [
              {
                college: exam.college,
                course: exam.course,
                branch: exam.branch,
                batch: exam.batch,
                yearOfStudy: exam.yearOfStudy,
                semester: exam.semester,
                section: null,
              },
            ],
      ),
    [exams],
  );
  const listColleges = useMemo(
    () =>
      [...new Set(listScopeRows.map((scope) => scope.college).filter((value): value is string => !!value))]
        .sort((a, b) => a.localeCompare(b)),
    [listScopeRows],
  );
  const listCourses = useMemo(
    () =>
      [...new Set(
        listScopeRows
          .filter((scope) => listCollege === 'all' || scope.college === listCollege)
          .map((scope) => scope.course),
      )].sort((a, b) => a.localeCompare(b)),
    [listCollege, listScopeRows],
  );
  const listBranches = useMemo(
    () =>
      [...new Set(
        listScopeRows
          .filter(
            (scope) =>
              (listCollege === 'all' || scope.college === listCollege) &&
              (listCourse === 'all' || scope.course === listCourse),
          )
          .map((scope) => scope.branch),
      )].sort((a, b) => a.localeCompare(b)),
    [listCollege, listCourse, listScopeRows],
  );
  const listYears = useMemo(
    () =>
      [...new Set(
        listScopeRows
          .filter(
            (scope) =>
              (listCollege === 'all' || scope.college === listCollege) &&
              (listCourse === 'all' || scope.course === listCourse) &&
              (listBranch === 'all' || scope.branch === listBranch),
          )
          .map((scope) => scope.yearOfStudy),
      )].sort((a, b) => a - b),
    [listBranch, listCollege, listCourse, listScopeRows],
  );
  const listSemesters = useMemo(
    () =>
      [...new Set(
        listScopeRows
          .filter(
            (scope) =>
              (listCollege === 'all' || scope.college === listCollege) &&
              (listCourse === 'all' || scope.course === listCourse) &&
              (listBranch === 'all' || scope.branch === listBranch) &&
              (listYear === 'all' || String(scope.yearOfStudy) === listYear),
          )
          .map((scope) => scope.semester),
      )].sort((a, b) => a - b),
    [listBranch, listCollege, listCourse, listScopeRows, listYear],
  );
  const filteredExams = useMemo(
    () =>
      exams.filter((exam) => {
        if (statusFilter !== 'all' && exam.status !== statusFilter) return false;
        const savedScopes = exam.scopes ?? [];
        const scopesForExam =
          savedScopes.length > 0
            ? savedScopes
            : [
                {
                  college: exam.college,
                  course: exam.course,
                  branch: exam.branch,
                  yearOfStudy: exam.yearOfStudy,
                  semester: exam.semester,
                  section: null,
                },
              ];
        return scopesForExam.some(
          (scope) =>
            (listCollege === 'all' || scope.college === listCollege) &&
            (listCourse === 'all' || scope.course === listCourse) &&
            (listBranch === 'all' || scope.branch === listBranch) &&
            (listYear === 'all' || String(scope.yearOfStudy) === listYear) &&
            (listSemester === 'all' || String(scope.semester) === listSemester),
        );
      }),
    [exams, listBranch, listCollege, listCourse, listSemester, listYear, statusFilter],
  );

  function changeRegulation(value: string) {
    setRegulationId(value);
    setCollegeIds([]);
    setCourseIds([]);
    setBranchIds([]);
    setBatches([]);
    setYearOfStudies([]);
    setSemesters([]);
    setSelectedSubjects(new Set());
    setExamDates({});
    setSuccess('');
  }

  function changeCollege(values: string[]) {
    setCollegeIds(values);
    setCourseIds([]);
    setBranchIds([]);
    setBatches([]);
    setYearOfStudies([]);
    setSemesters([]);
    setSelectedSubjects(new Set());
    setExamDates({});
  }

  function changeCourse(values: string[]) {
    setCourseIds(values);
    setBranchIds([]);
    setBatches([]);
    setYearOfStudies([]);
    setSemesters([]);
    setSelectedSubjects(new Set());
    setExamDates({});
  }

  function changeBranch(values: string[]) {
    setBranchIds(values);
    setBatches([]);
    setYearOfStudies([]);
    setSemesters([]);
    setSelectedSubjects(new Set());
    setExamDates({});
  }

  function changeBatch(values: string[]) {
    setBatches(values);
    setYearOfStudies([]);
    setSemesters([]);
    setSelectedSubjects(new Set());
    setExamDates({});
  }

  function changeYear(values: string[]) {
    setYearOfStudies(values);
    setSemesters([]);
    setSelectedSubjects(new Set());
    setExamDates({});
  }

  function changeSemester(values: string[]) {
    setSemesters(values);
    setSelectedSubjects(new Set());
    setExamDates({});
  }

  function toggleSubject(subjectId: number, checked: boolean) {
    setSelectedSubjects((previous) => {
      const next = new Set(previous);
      if (checked) next.add(subjectId);
      else next.delete(subjectId);
      return next;
    });
  }

  function closeCreation() {
    setCreationOpen(false);
    setCreationStep(1);
    setEditingExamId(null);
    setRegulationId('');
    setCollegeIds([]);
    setCourseIds([]);
    setBranchIds([]);
    setBatches([]);
    setYearOfStudies([]);
    setSemesters([]);
    setName('');
    setSelectedSubjects(new Set());
    setExamDates({});
    setError('');
  }

  async function openEdit(exam: Exam) {
    setSavingAction(true);
    setError('');
    try {
      const entries = await api.getInternalExamSubjectMappings(exam.regulationId);
      const availableScopes = groupMappings(entries);
      const matchingScopes = availableScopes.filter((scope) =>
        exam.scopes?.some(
          (savedScope) =>
            savedScope.college === scope.college &&
            savedScope.course === scope.course &&
            savedScope.branch === scope.branch &&
            savedScope.batch === scope.batch &&
            Number(savedScope.yearOfStudy) === scope.yearOfStudy &&
            Number(savedScope.semester) === scope.semester,
        ),
      );
      if (matchingScopes.length === 0) {
        throw new Error('The saved academic scopes could not be matched to current subject mappings.');
      }

      setMappings(entries);
      setRegulationId(String(exam.regulationId));
      setCollegeIds([
        ...new Set(matchingScopes.map((scope) => String(scope.collegeId))),
      ]);
      setCourseIds([
        ...new Set(matchingScopes.map((scope) => String(scope.courseId))),
      ]);
      setBranchIds([
        ...new Set(matchingScopes.map((scope) => String(scope.branchId))),
      ]);
      setBatches([...new Set(matchingScopes.map((scope) => scope.batch))]);
      setYearOfStudies([
        ...new Set(matchingScopes.map((scope) => String(scope.yearOfStudy))),
      ]);
      setSemesters([
        ...new Set(matchingScopes.map((scope) => String(scope.semester))),
      ]);
      setName(exam.name);
      setSelectedSubjects(
        new Set(
          (exam.examSubjects ?? []).map((subject) => subject.subjectId),
        ),
      );
      setExamDates(
        Object.fromEntries(
          (exam.examSubjects ?? [])
            .filter((subject) => subject.examDate)
            .map((subject) => [
              subject.subjectId,
              String(subject.examDate).slice(0, 10),
            ]),
        ),
      );
      setEditingExamId(exam.id);
      setCreationStep(1);
      setCreationOpen(true);
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : 'Failed to load the internal examination for editing.',
      );
    } finally {
      setSavingAction(false);
    }
  }

  function continueCreation() {
    setError('');
    if (creationStep === 1) {
      if (!name.trim()) {
        setError('Enter an internal examination notification name.');
        return;
      }
      if (!regulationId || selectedScopes.length === 0) {
        setError('Select a regulation and at least one complete academic scope.');
        return;
      }
    }
    if (creationStep === 2 && selectedSubjects.size === 0) {
      setError('Select at least one subject.');
      return;
    }
    if (
      creationStep === 2 &&
      selectedScopes.some(
        (scope) =>
          !scope.mappings.some((mapping) =>
            selectedSubjects.has(mapping.subjectId),
          ),
      )
    ) {
      setError('Select at least one mapped subject for every selected academic scope.');
      return;
    }
    if (
      creationStep === 3 &&
      [...selectedSubjects].some((subjectId) => !examDates[subjectId])
    ) {
      setError('Set an examination date for every selected subject.');
      return;
    }
    setCreationStep((step) => Math.min(step + 1, creationSteps.length));
  }

  async function createNotification() {
    if (!selectedScopes.length || !regulationId) {
      setError('Select a regulation and at least one complete academic scope.');
      return;
    }
    if (!name.trim()) {
      setError('Enter an internal examination notification name.');
      return;
    }
    if (selectedSubjects.size === 0) {
      setError('Select at least one subject.');
      return;
    }
    const missingDate = [...selectedSubjects].some(
      (subjectId) => !examDates[subjectId],
    );
    if (missingDate) {
      setError('Set an examination date for every selected subject.');
      return;
    }

    const chosenMappings = selectedMappings.filter((mapping) =>
      selectedSubjects.has(mapping.subjectId),
    );
    if (
      selectedScopes.some(
        (scope) =>
          !scope.mappings.some((mapping) =>
            selectedSubjects.has(mapping.subjectId),
          ),
      )
    ) {
      setError('Select at least one mapped subject for every selected academic scope.');
      return;
    }
    const subjectsByScope = new Map<
      string,
      CreateExamInput['subjects'][number]
    >();
    chosenMappings.forEach((mapping) => {
      const mappedSections =
        mapping.sectionMode === 'selected' && mapping.sections?.length
          ? mapping.sections
          : [null];
      mappedSections.forEach((section) => {
        const key = `${mapping.branchName}|${section ?? ''}|${mapping.subjectId}`;
        subjectsByScope.set(key, {
          subjectId: mapping.subjectId,
          branch: mapping.branchName,
          ...(section ? { section } : {}),
          fee: 0,
          examDate: examDates[mapping.subjectId],
        });
      });
    });
    const subjects = [...subjectsByScope.values()];
    const dates = subjects.map((subject) => subject.examDate).sort();
    const uniqueBy = <T,>(values: T[]) => [...new Set(values)];
    const payload: CreateExamInput = {
      name: name.trim(),
      examCategory: 'INTERNAL',
      type: 'regular',
      types: ['regular'],
      regulationId: Number(regulationId),
      college: uniqueBy(selectedScopes.map((scope) => scope.college))
        .join(', ')
        .slice(0, 150),
      course: uniqueBy(selectedScopes.map((scope) => scope.course)).join(', '),
      courses: uniqueBy(selectedScopes.map((scope) => scope.course)),
      batch: uniqueBy(selectedScopes.map((scope) => scope.batch)).join(', '),
      batches: uniqueBy(selectedScopes.map((scope) => scope.batch)),
      yearOfStudy: selectedScopes[0].yearOfStudy,
      yearOfStudies: uniqueBy(selectedScopes.map((scope) => scope.yearOfStudy)),
      semester: selectedScopes[0].semester,
      semesters: uniqueBy(selectedScopes.map((scope) => scope.semester)),
      scopes: selectedScopes.map((scope) => {
        const scopeMappings = scope.mappings.filter((mapping) =>
          selectedSubjects.has(mapping.subjectId),
        );
        const sections = uniqueBy(
          scopeMappings.flatMap((mapping) =>
            mapping.sectionMode === 'selected' ? mapping.sections ?? [] : [],
          ),
        );
        return {
          college: scope.college,
          branch: scope.branch,
          branchId: scope.branchId,
          course: scope.course,
          courseId: scope.courseId,
          batch: scope.batch,
          yearOfStudy: scope.yearOfStudy,
          semester: scope.semester,
          sections,
        };
      }),
      subjects,
      examinationStartDate: dates[0],
      examinationEndDate: dates[dates.length - 1],
    };

    const isEditing = editingExamId !== null;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (isEditing && editingExamId !== null) {
        await api.updateInternalExam(editingExamId, payload);
      } else {
        await api.createInternalExam(payload);
      }
      closeCreation();
      setSuccess(
        isEditing
          ? 'Internal examination changes saved.'
          : 'Internal examination notification saved as a draft.',
      );
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : isEditing
            ? 'Failed to update the internal examination.'
            : 'Failed to create the internal examination notification.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitForApproval(exam: Exam) {
    setSavingAction(true);
    setError('');
    try {
      await api.submitExam(exam.id);
      toast.push('Internal examination submitted for approval.', 'success');
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to submit the internal examination.',
      );
    } finally {
      setSavingAction(false);
    }
  }

  async function handleApprove(exam: Exam) {
    setSavingAction(true);
    setError('');
    try {
      await api.approveExam(exam.id);
      toast.push('Internal examination approved.', 'success');
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to approve the internal examination.',
      );
    } finally {
      setSavingAction(false);
    }
  }

  async function handlePublish() {
    if (!publishExam) return;
    setSavingAction(true);
    setError('');
    try {
      await api.publishExam(publishExam.id);
      setPublishExam(null);
      toast.push('Internal examination published.', 'success');
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to publish the internal examination.',
      );
    } finally {
      setSavingAction(false);
    }
  }

  function openRejectDialog(exam: Exam) {
    setRejectExam(exam);
    setRejectRemarks('');
    setError('');
    setRejectOpen(true);
  }

  async function handleReject() {
    if (!rejectExam) return;
    if (!rejectRemarks.trim()) {
      setError('Rejection remarks are required.');
      return;
    }
    setSavingAction(true);
    setError('');
    try {
      await api.rejectExam(rejectExam.id, rejectRemarks.trim());
      setRejectOpen(false);
      setRejectExam(null);
      toast.push('Internal examination rejected.', 'warning');
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to reject the internal examination.',
      );
    } finally {
      setSavingAction(false);
    }
  }

  if (!canRead) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-white p-6 text-sm text-[var(--muted)]">
        You do not have permission to view internal examination notifications.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Internal Examinations"
        description="Create an internal exam notification from mapped subjects and save it as a draft."
        action={
          canWrite ? (
            <Button
              type="button"
              onClick={() => {
                closeCreation();
                setError('');
                setSuccess('');
                setCreationStep(1);
                setCreationOpen(true);
              }}
            >
              + New internal examination
            </Button>
          ) : undefined
        }
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {success ? <Alert tone="success">{success}</Alert> : null}

      {canWrite && creationOpen ? (
        <Card>
          <CardHeader
            title={editingExamId == null ? 'Create internal examination' : 'Edit internal examination'}
            description={
              editingExamId == null
                ? 'Scope → mapped subjects → dates → review.'
                : 'Update the notification scope, subjects and examination dates.'
            }
          />
          <CardBody className="space-y-5">
            <ol className="grid grid-cols-2 gap-3 border-b border-[var(--border)] pb-4 sm:grid-cols-4">
              {creationSteps.map((step, index) => {
                const stepNumber = index + 1;
                const active = creationStep === stepNumber;
                const complete = creationStep > stepNumber;
                return (
                  <li
                    key={step}
                    aria-current={active ? 'step' : undefined}
                    className={`flex items-center gap-2 text-sm ${
                      active || complete
                        ? 'font-medium text-slate-900'
                        : 'text-[var(--muted)]'
                    }`}
                  >
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-xs ${
                        active
                          ? 'bg-slate-900 text-white'
                          : complete
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {stepNumber}
                    </span>
                    {step}
                  </li>
                );
              })}
            </ol>

            {creationStep === 1 ? (
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1 text-sm md:col-span-2">
                  <span className="font-medium text-slate-700">
                    Examination name
                  </span>
                  <input
                    className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="e.g. Internal Examination - Semester 1"
                    maxLength={200}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-slate-700">Regulation</span>
                  <select
                    className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2"
                    value={regulationId}
                    onChange={(event) => changeRegulation(event.target.value)}
                  >
                    <option value="">Select regulation</option>
                    {regulations.map((regulation) => (
                      <option key={regulation.id} value={regulation.id}>
                        {regulation.code} — {regulation.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 md:col-span-2">
                  <MultiSelectFilter
                    label="College"
                    options={collegeOptions}
                    values={collegeIds}
                    onChange={changeCollege}
                    disabled={!regulationId || loadingMappings}
                    emptyMessage="Select a regulation to load colleges."
                  />
                  <MultiSelectFilter
                    label="Programme"
                    options={courseOptions}
                    values={courseIds}
                    onChange={changeCourse}
                    disabled={collegeIds.length === 0 || loadingMappings}
                    emptyMessage="Select at least one college to load programmes."
                  />
                  <MultiSelectFilter
                    label="Branch"
                    options={branchOptions}
                    values={branchIds}
                    onChange={changeBranch}
                    disabled={courseIds.length === 0 || loadingMappings}
                    emptyMessage="Select at least one programme to load branches."
                  />
                  <MultiSelectFilter
                    label="Batch"
                    options={batchOptions}
                    values={batches}
                    onChange={changeBatch}
                    disabled={branchIds.length === 0 || loadingMappings}
                    emptyMessage="Select at least one branch to load batches."
                  />
                  <MultiSelectFilter
                    label="Program year"
                    options={yearOptions}
                    values={yearOfStudies}
                    onChange={changeYear}
                    disabled={batches.length === 0 || loadingMappings}
                    emptyMessage="Select at least one batch to load program years."
                  />
                  <MultiSelectFilter
                    label="Semester"
                    options={semesterOptions}
                    values={semesters}
                    onChange={changeSemester}
                    disabled={yearOfStudies.length === 0 || loadingMappings}
                    emptyMessage="Select at least one program year to load semesters."
                  />
                  {regulationId && !loadingMappings && scopes.length === 0 ? (
                    <p className="text-sm text-[var(--muted)] sm:col-span-2 lg:col-span-3">
                      No mapped academic scopes exist for this regulation.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {creationStep === 2 ? (
              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">
                    Select mapped subjects
                  </h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {selectedScopes.length > 0
                      ? `${selectedScopes.length} academic scope${selectedScopes.length === 1 ? '' : 's'} selected`
                      : 'Choose subjects for the selected academic scope.'}
                  </p>
                </div>
                {subjects.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-[var(--border)] p-4 text-sm text-[var(--muted)]">
                    No mapped subjects are available for this scope.
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {subjects.map((subject) => (
                      <label
                        key={subject.id}
                        className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-white p-3 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={selectedSubjects.has(subject.id)}
                          onChange={(event) =>
                            toggleSubject(subject.id, event.target.checked)
                          }
                        />
                        <span>
                          <span className="font-medium">{subject.code}</span>
                          <span className="ml-2 text-[var(--muted)]">
                            {subject.name}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </section>
            ) : null}

            {creationStep === 3 ? (
              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">
                    Examination dates
                  </h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Choose a date for each selected subject.
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {subjects
                    .filter((subject) => selectedSubjects.has(subject.id))
                    .map((subject) => (
                      <label
                        key={subject.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-white p-3 text-sm"
                      >
                        <span>
                          <span className="font-medium">{subject.code}</span>
                          <span className="ml-2 text-[var(--muted)]">
                            {subject.name}
                          </span>
                        </span>
                        <input
                          type="date"
                          aria-label={`Exam date for ${subject.code}`}
                          className="rounded-md border border-[var(--border)] px-2 py-1.5"
                          value={examDates[subject.id] ?? ''}
                          onChange={(event) =>
                            setExamDates((previous) => ({
                              ...previous,
                              [subject.id]: event.target.value,
                            }))
                          }
                        />
                      </label>
                    ))}
                </div>
              </section>
            ) : null}

            {creationStep === 4 ? (
              <section className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">
                    Review internal examination
                  </h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Confirm the notification details before saving it as a draft.
                  </p>
                </div>
                <dl className="grid gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-[var(--muted)]">Examination name</dt>
                    <dd className="font-medium text-slate-900">{name}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--muted)]">Regulation</dt>
                    <dd className="font-medium text-slate-900">
                      {regulations.find(
                        (regulation) => String(regulation.id) === regulationId,
                      )?.code ?? '—'}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-[var(--muted)]">Academic scope</dt>
                    {selectedScopes.length > 0 ? (
                      <dd className="mt-2 grid gap-2 sm:grid-cols-2">
                        {groupScopeDisplayRows(selectedScopes).map((scope) => (
                          <div
                            key={JSON.stringify(scope)}
                            className="rounded-lg border border-[var(--border)] bg-white p-3 font-medium text-slate-900"
                          >
                            <p>
                              {scope.college ? `${scope.college} · ` : ''}
                              {scope.course}
                            </p>
                            <p className="mt-1 text-xs font-normal text-slate-700">
                              {scope.branches.join(' · ')}
                            </p>
                            <p className="mt-1 text-xs font-normal text-[var(--muted)]">
                              {scope.batch} · Y{scope.yearOfStudy} / S{scope.semester}
                            </p>
                          </div>
                        ))}
                      </dd>
                    ) : (
                      <dd className="font-medium text-slate-900">—</dd>
                    )}
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="mb-1 text-[var(--muted)]">Subjects and dates</dt>
                    <dd>
                      <ul className="divide-y divide-slate-200">
                        {subjects
                          .filter((subject) => selectedSubjects.has(subject.id))
                          .map((subject) => (
                            <li
                              key={subject.id}
                              className="flex justify-between gap-3 py-2"
                            >
                              <span>
                                <span className="font-medium">{subject.code}</span>
                                <span className="ml-2 text-[var(--muted)]">
                                  {subject.name}
                                </span>
                              </span>
                              <time className="shrink-0 font-medium">
                                {examDates[subject.id]}
                              </time>
                            </li>
                          ))}
                      </ul>
                    </dd>
                  </div>
                </dl>
              </section>
            ) : null}

            <div className="flex flex-wrap justify-between gap-3 border-t border-[var(--border)] pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={closeCreation}
                disabled={saving}
              >
                Cancel
              </Button>
              <div className="flex gap-2">
                {creationStep > 1 ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setError('');
                      setCreationStep((step) => Math.max(step - 1, 1));
                    }}
                    disabled={saving}
                  >
                    Back
                  </Button>
                ) : null}
                {creationStep < creationSteps.length ? (
                  <Button
                    type="button"
                    onClick={continueCreation}
                    disabled={loadingMappings || saving}
                  >
                    Next
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={() => void createNotification()}
                    disabled={saving}
                  >
                    {saving
                      ? 'Saving…'
                      : editingExamId == null
                        ? 'Save draft'
                        : 'Save changes'}
                  </Button>
                )}
              </div>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <StatusFilter
        items={statusTabs.map((item) => ({
          ...item,
          count:
            item.id === 'all'
              ? exams.length
              : exams.filter((exam) => exam.status === item.id).length,
        }))}
        value={statusFilter}
        onChange={setStatusFilter}
      />

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex items-center gap-2">
          <svg
            className="h-4 w-4 text-[var(--primary)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
            />
          </svg>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Academic filters
          </span>
          {filteredExams.length !== exams.length ? (
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-800">
              Filtered: {filteredExams.length} of {exams.length}
            </span>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="space-y-1 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            College
            <select
              value={listCollege}
              onChange={(event) => {
                setListCollege(event.target.value);
                setListCourse('all');
                setListBranch('all');
                setListYear('all');
                setListSemester('all');
              }}
              className="h-9 w-full cursor-pointer truncate rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium normal-case tracking-normal text-slate-800"
            >
              <option value="all">All colleges</option>
              {listColleges.map((college) => (
                <option key={college} value={college}>{college}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            Course
            <select
              value={listCourse}
              onChange={(event) => {
                setListCourse(event.target.value);
                setListBranch('all');
                setListYear('all');
                setListSemester('all');
              }}
              className="h-9 w-full cursor-pointer truncate rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium normal-case tracking-normal text-slate-800"
            >
              <option value="all">All courses</option>
              {listCourses.map((course) => (
                <option key={course} value={course}>{course}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            Branch
            <select
              value={listBranch}
              onChange={(event) => {
                setListBranch(event.target.value);
                setListYear('all');
                setListSemester('all');
              }}
              className="h-9 w-full cursor-pointer truncate rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium normal-case tracking-normal text-slate-800"
            >
              <option value="all">All branches</option>
              {listBranches.map((branch) => (
                <option key={branch} value={branch}>{branch}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            Year
            <select
              value={listYear}
              onChange={(event) => {
                setListYear(event.target.value);
                setListSemester('all');
              }}
              className="h-9 w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium normal-case tracking-normal text-slate-800"
            >
              <option value="all">All years</option>
              {listYears.map((year) => (
                <option key={year} value={year}>Year {year}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            Semester
            <select
              value={listSemester}
              onChange={(event) => setListSemester(event.target.value)}
              className="h-9 w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium normal-case tracking-normal text-slate-800"
            >
              <option value="all">All semesters</option>
              {listSemesters.map((semester) => (
                <option key={semester} value={semester}>Semester {semester}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <Card>
        <CardHeader
          title={statusFilter === 'all' ? 'Internal examinations' : `${statusFilter.replace(/_/g, ' ')} internal examinations`}
          description={`${filteredExams.length} examination${filteredExams.length === 1 ? '' : 's'}`}
        />
        <CardBody className="!p-0">
          {loading ? (
            <LoadingBlock />
          ) : filteredExams.length === 0 ? (
            <p className="py-16 text-center text-sm text-[var(--muted)]">
              No internal examinations match the selected filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-slate-50/80 text-left">
                    <th className="px-5 py-3.5 font-semibold text-slate-600">Name</th>
                    <th className="px-5 py-3.5 font-semibold text-slate-600">Regulation</th>
                    <th className="px-5 py-3.5 font-semibold text-slate-600">Scope</th>
                    <th className="px-5 py-3.5 font-semibold text-slate-600">Type</th>
                    <th className="px-5 py-3.5 font-semibold text-slate-600">Subjects</th>
                    <th className="px-5 py-3.5 font-semibold text-slate-600">Status</th>
                    <th className="px-5 py-3.5 text-right font-semibold text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {filteredExams.map((exam) => (
                    <tr key={exam.id} className="transition hover:bg-slate-50/50">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-900">{exam.name}</p>
                        {exam.rejectionRemarks ? (
                          <p className="mt-0.5 text-xs text-red-600">
                            Rejected: {exam.rejectionRemarks}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {regulations.find((regulation) => regulation.id === exam.regulationId)?.code ?? `#${exam.regulationId}`}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {groupScopeDisplayRows(
                          exam.scopes?.length
                            ? exam.scopes
                            : [{
                                college: exam.college,
                                course: exam.course,
                                branch: exam.branch,
                                batch: exam.batch,
                                yearOfStudy: exam.yearOfStudy,
                                semester: exam.semester,
                              }],
                        ).map((scope) => (
                          <p
                            key={JSON.stringify(scope)}
                            className="mb-2 last:mb-0"
                          >
                            <span className="block text-xs font-medium text-slate-700">
                              {scope.college ? `${scope.college} · ` : ''}
                              {scope.course}
                            </span>
                            <span className="block text-xs">
                              {scope.branches.join(' · ')}
                            </span>
                            <span className="block text-xs text-[var(--muted)]">
                              {scope.batch} · Y{scope.yearOfStudy} / S{scope.semester}
                            </span>
                          </p>
                        ))}
                      </td>
                      <td className="px-5 py-4">
                        <Badge variant="default">Internal</Badge>
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {exam.examSubjects?.length ?? 0}
                      </td>
                      <td className="px-5 py-4">
                        <Badge
                          variant={
                            exam.status === 'published' || exam.status === 'approved'
                              ? 'success'
                              : exam.status === 'pending_approval'
                                ? 'warning'
                                : exam.status === 'rejected'
                                  ? 'danger'
                                  : 'default'
                          }
                        >
                          {exam.status.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            className="!px-2.5 !py-1.5 text-xs"
                            disabled={savingAction}
                            onClick={() => setViewExam(exam)}
                          >
                            View
                          </Button>
                          {canWrite && (exam.status === 'draft' || exam.status === 'rejected') ? (
                            <Button
                              variant="ghost"
                              className="!px-2.5 !py-1.5 text-xs"
                              disabled={savingAction}
                              onClick={() => void openEdit(exam)}
                            >
                              Edit
                            </Button>
                          ) : null}
                          {(exam.status === 'draft' || exam.status === 'rejected') && canSubmit ? (
                            <Button
                              variant="ghost"
                              className="!px-2.5 !py-1.5 text-xs"
                              disabled={savingAction}
                              onClick={() => void handleSubmitForApproval(exam)}
                            >
                              Submit
                            </Button>
                          ) : null}
                          {exam.status === 'pending_approval' && canApprove ? (
                            <>
                              <Button
                                variant="ghost"
                                className="!px-2.5 !py-1.5 text-xs !text-[var(--success)]"
                                disabled={savingAction}
                                onClick={() => void handleApprove(exam)}
                              >
                                Approve
                              </Button>
                              <Button
                                variant="ghost"
                                className="!px-2.5 !py-1.5 text-xs !text-red-600"
                                disabled={savingAction}
                                onClick={() => openRejectDialog(exam)}
                              >
                                Reject
                              </Button>
                            </>
                          ) : null}
                          {exam.status === 'approved' && canPublish ? (
                            <Button
                              variant="primary"
                              className="!px-2.5 !py-1.5 text-xs"
                              disabled={savingAction}
                              onClick={() => setPublishExam(exam)}
                            >
                              Publish
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Dialog
        open={viewExam !== null}
        onClose={() => setViewExam(null)}
        title={viewExam?.name ?? 'Internal examination'}
        description="Internal examination notification details."
        size="lg"
        footer={
          <Button variant="secondary" onClick={() => setViewExam(null)}>
            Close
          </Button>
        }
      >
        {viewExam ? (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Status</p>
                <p className="mt-1 capitalize text-sm font-medium text-slate-900">
                  {viewExam.status.replace(/_/g, ' ')}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Regulation</p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {regulations.find((regulation) => regulation.id === viewExam.regulationId)?.code ??
                    `#${viewExam.regulationId}`}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Examination dates</p>
                <p className="mt-1 text-sm text-slate-900">
                  {viewExam.examinationStartDate
                    ? String(viewExam.examinationStartDate).slice(0, 10)
                    : 'Not set'}
                  {viewExam.examinationEndDate &&
                  viewExam.examinationEndDate !== viewExam.examinationStartDate
                    ? ` – ${String(viewExam.examinationEndDate).slice(0, 10)}`
                    : ''}
                </p>
              </div>
            </div>
            {viewExam.rejectionRemarks ? (
              <Alert tone="danger">{viewExam.rejectionRemarks}</Alert>
            ) : null}
            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Academic scope</h3>
              <div className="space-y-2">
                {groupScopeDisplayRows(
                  viewExam.scopes?.length
                    ? viewExam.scopes
                    : [{
                        college: viewExam.college,
                        course: viewExam.course,
                        branch: viewExam.branch,
                        batch: viewExam.batch,
                        yearOfStudy: viewExam.yearOfStudy,
                        semester: viewExam.semester,
                        section: null,
                      }],
                ).map((scope) => (
                  <p
                    key={JSON.stringify(scope)}
                    className="rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 text-sm text-slate-700"
                  >
                    {scope.college ? `${scope.college} · ` : ''}
                    {scope.course}
                    <span className="block">{scope.branches.join(' · ')}</span>
                    <span className="block text-xs text-[var(--muted)]">
                      {scope.batch} · Y{scope.yearOfStudy} / S{scope.semester}
                    </span>
                  </p>
                ))}
              </div>
            </section>
            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Subjects and dates</h3>
              <div className="max-h-64 overflow-y-auto rounded-lg border border-[var(--border)]">
                {(viewExam.examSubjects ?? []).map((subject) => (
                  <div
                    key={subject.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2 last:border-b-0"
                  >
                    <span className="text-sm text-slate-800">
                      {subject.subject?.code ? `${subject.subject.code} · ` : ''}
                      {subject.subject?.name ?? `Subject #${subject.subjectId}`}
                      {subject.branch ? ` · ${subject.branch}` : ''}
                    </span>
                    <span className="text-sm text-[var(--muted)]">
                      {subject.examDate
                        ? String(subject.examDate).slice(0, 10)
                        : 'Date not set'}
                    </span>
                  </div>
                ))}
                {viewExam.examSubjects?.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-[var(--muted)]">No subjects are attached.</p>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={publishExam !== null}
        onClose={() => {
          if (!savingAction) setPublishExam(null);
        }}
        onConfirm={handlePublish}
        title="Publish internal examination"
        description={
          publishExam
            ? `Publish "${publishExam.name}"? This publishes the notification only and does not run external exam enrollment or hall-ticket workflows.`
            : undefined
        }
        confirmLabel={savingAction ? 'Publishing…' : 'Publish'}
        tone="primary"
        loading={savingAction}
      />

      <ConfirmDialog
        open={rejectOpen}
        onClose={() => {
          if (!savingAction) {
            setRejectOpen(false);
            setError('');
          }
        }}
        onConfirm={handleReject}
        title="Reject internal examination"
        description={
          rejectExam ? `Provide remarks for "${rejectExam.name}".` : undefined
        }
        confirmLabel={savingAction ? 'Rejecting…' : 'Reject'}
        tone="danger"
        loading={savingAction}
      >
        <TextareaField
          label="Rejection remarks"
          value={rejectRemarks}
          onChange={(event) => setRejectRemarks(event.target.value)}
          rows={4}
          placeholder="Rejection remarks..."
        />
        {error ? <Alert tone="danger" className="mt-3">{error}</Alert> : null}
      </ConfirmDialog>
    </div>
  );
}
