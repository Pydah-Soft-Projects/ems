/* eslint-disable react-hooks/set-state-in-effect */

'use client';

import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Regulation, RegulationScope } from '@/types/regulation';
import {
  Exam,
  CreateExamInput,
  ExamType,
  ExamSession,
  ExamSubjectFeeInput,
  PackageFeeEntry,
  SupplyFeeBranchEntry,
} from '@/types/exam';
import { Subject } from '@/types/subject';
import { SdmsBranch, SdmsBranchYearSemesters, SdmsSection } from '@/types/sdms';
import { api } from '@/lib/api';

const selectClass =
  'w-full rounded-[var(--radius)] border border-[var(--border)] bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]';

const ALL_EXAM_TYPES: { value: ExamType; label: string }[] = [
  { value: 'regular', label: 'Regular' },
  { value: 'supply', label: 'Supply' },
];

const DEFAULT_CREATE_TYPES: ExamType[] = ['regular', 'supply'];

interface ExamFormProps {
  regulations: Regulation[];
  initial?: Exam | null;
  defaultRegulationId?: number;
  defaultStep?: Step;
  onSubmit: (data: CreateExamInput) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

type Step = 1 | 2 | 3 | 4;

interface SubjectRowState {
  selected: boolean;
  fee: string;
  examDate: string;
  session: ExamSession | '';
  startTime: string;
  endTime: string;
  duration: string;
}

const EMPTY_ROW: SubjectRowState = {
  selected: false,
  fee: '0',
  examDate: '',
  session: '',
  startTime: '',
  endTime: '',
  duration: '',
};

function isCountBasedType(t: ExamType) {
  return t === 'supply';
}

const compactInputClass =
  'w-full min-w-0 rounded-[var(--radius)] border border-[var(--border)] bg-white px-2.5 py-1.5 text-sm outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)] disabled:bg-slate-50 disabled:text-slate-500';

function ConfigField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0 space-y-1">
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

/** Section-specific subject groups per branch; '' = all sections */
type SectionGroups = Record<string, Subject[]>;

function rowKey(branchName: string, section: string, subjectId: number) {
  return `${branchName}|${section}|${subjectId}`;
}

function parseRowKey(key: string): {
  branch: string;
  section: string;
  subjectId: number;
} {
  const idSep = key.lastIndexOf('|');
  const subjectId = parseInt(key.slice(idSep + 1), 10);
  const rest = key.slice(0, idSep);
  const secSep = rest.lastIndexOf('|');
  return {
    branch: rest.slice(0, secSep),
    section: rest.slice(secSep + 1),
    subjectId,
  };
}

/** Key for package-fee inputs; '' section = whole branch */
function pkgKey(branchName: string, section: string) {
  return `${branchName}|${section}`;
}

function parsePkgKey(key: string): { branch: string; section: string } {
  const sep = key.lastIndexOf('|');
  return { branch: key.slice(0, sep), section: key.slice(sep + 1) };
}

function computeDuration(start: string, end: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff > 0 ? diff : null;
}

function nextDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + 1);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function examTypeLabel(t: ExamType): string {
  return ALL_EXAM_TYPES.find((x) => x.value === t)?.label ?? t;
}

function getScopedColleges(scopes: RegulationScope[]) {
  const map = new Map<number, { id: number; name: string }>();
  for (const s of scopes) {
    if (!map.has(s.collegeId)) {
      map.set(s.collegeId, { id: s.collegeId, name: s.collegeName });
    }
  }
  return Array.from(map.values());
}

function getScopedCourses(scopes: RegulationScope[], collegeId: number) {
  const map = new Map<number, { id: number; name: string }>();
  for (const s of scopes) {
    if (s.collegeId !== collegeId) continue;
    if (!map.has(s.courseId)) {
      map.set(s.courseId, { id: s.courseId, name: s.courseName });
    }
  }
  return Array.from(map.values());
}

function getScopedBatches(
  scopes: RegulationScope[],
  collegeId: number,
  courseId: number,
) {
  return [
    ...new Set(
      scopes
        .filter((s) => s.collegeId === collegeId && s.courseId === courseId)
        .map((s) => s.batch),
    ),
  ].sort((a, b) => b.localeCompare(a));
}

export function ExamForm({
  regulations,
  initial,
  defaultRegulationId,
  defaultStep = 1,
  onSubmit,
  onCancel,
  loading,
}: ExamFormProps) {
  const isEdit = !!initial;

  const [step, setStep] = useState<Step>(defaultStep);
  const [name, setName] = useState('');
  /** Multi-type for create and edit */
  const [types, setTypes] = useState<ExamType[]>(DEFAULT_CREATE_TYPES);
  const [regulationId, setRegulationId] = useState('');
  const [collegeId, setCollegeId] = useState('');
  const [collegeName, setCollegeName] = useState('');
  const [selectedCourseIds, setSelectedCourseIds] = useState<number[]>([]);
  const [selectedBranchIds, setSelectedBranchIds] = useState<number[]>([]);
  /** Selected section names per branch; empty array = all sections */
  const [branchSections, setBranchSections] = useState<Record<number, string[]>>(
    {},
  );
  const [sectionsByBranch, setSectionsByBranch] = useState<
    Record<number, SdmsSection[]>
  >({});
  const [selectedBatches, setSelectedBatches] = useState<string[]>([]);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [selectedSemesters, setSelectedSemesters] = useState<number[]>([]);

  const batch = selectedBatches.join(', ');
  const yearOfStudy = selectedYears.length > 0 ? String(selectedYears[0]) : '';
  const semester = selectedSemesters.length > 0 ? String(selectedSemesters[0]) : '';

  const [branches, setBranches] = useState<SdmsBranch[]>([]);
  const [yearSem, setYearSem] = useState<SdmsBranchYearSemesters | null>(null);
  /** Mapped subjects grouped per branch name, then per section ('' = all sections) */
  const [mappedByBranch, setMappedByBranch] = useState<
    Record<string, SectionGroups>
  >({});
  /** Row state keyed by `${branchName}|${section}|${subjectId}` */
  const [selectedFees, setSelectedFees] = useState<
    Record<string, SubjectRowState>
  >({});
  const [packageFee, setPackageFee] = useState('');
  const [duplicateHallTicketFee, setDuplicateHallTicketFee] = useState('');
  /** Branch/section package fees keyed by `${branchName}|${section}` ('' section = whole branch) */
  const [packageFeeByScope, setPackageFeeByScope] = useState<
    Record<string, string>
  >({});
  /** Bulk helper for package fees */
  const [bulkPackageFee, setBulkPackageFee] = useState('');
  /** Default supply tiers as strings: index 0 = 1 subject */
  const [supplyFeeByCount, setSupplyFeeByCount] = useState<string[]>([]);
  /** Per-branch supply tier overrides */
  const [supplyFeeByBranch, setSupplyFeeByBranch] = useState<
    Record<string, string[]>
  >({});

  const [applicationStartDate, setApplicationStartDate] = useState('');
  const [applicationEndDate, setApplicationEndDate] = useState('');
  const [examinationStartDate, setExaminationStartDate] = useState('');
  const [examinationEndDate, setExaminationEndDate] = useState('');
  const [lateFeeStartDate, setLateFeeStartDate] = useState('');
  const [slabs, setSlabs] = useState<
    { fromDate: string; toDate: string | null; amount: number }[]
  >([{ fromDate: '', toDate: null, amount: 100 }]);
  const [instructions, setInstructions] = useState('');
  const [submitForApproval, setSubmitForApproval] = useState(false);
  const [error, setError] = useState('');
  const [loadingScope, setLoadingScope] = useState(false);

  const reg = useMemo(
    () => regulations.find((r) => r.id === parseInt(regulationId, 10)),
    [regulations, regulationId],
  );
  const scopes = useMemo(() => reg?.scopes ?? [], [reg]);
  const colleges = useMemo(() => getScopedColleges(scopes), [scopes]);
  const courses = useMemo(
    () =>
      collegeId ? getScopedCourses(scopes, parseInt(collegeId, 10)) : [],
    [scopes, collegeId],
  );
  const selectedCourses = useMemo(
    () => courses.filter((c) => selectedCourseIds.includes(c.id)),
    [courses, selectedCourseIds],
  );
  const courseId = selectedCourseIds.length > 0 ? String(selectedCourseIds[0]) : '';
  const courseName = selectedCourses.map((c) => c.name).join(', ');

  const batches = useMemo(() => {
    if (!collegeId || selectedCourseIds.length === 0) return [];
    const set = new Set<string>();
    const cid = parseInt(collegeId, 10);
    for (const cId of selectedCourseIds) {
      const bList = getScopedBatches(scopes, cid, cId);
      for (const b of bList) set.add(b);
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [scopes, collegeId, selectedCourseIds]);

  const selectedBranches = useMemo(
    () => branches.filter((b) => selectedBranchIds.includes(b.id)),
    [branches, selectedBranchIds],
  );

  const firstBranchId = selectedBranchIds[0] ?? null;

  /** Row keys visible in the current branch/section groups */
  const visibleRowKeys = useMemo(() => {
    const set = new Set<string>();
    for (const [branchName, groups] of Object.entries(mappedByBranch)) {
      for (const [section, subjects] of Object.entries(groups)) {
        for (const s of subjects) set.add(rowKey(branchName, section, s.id));
      }
    }
    return set;
  }, [mappedByBranch]);

  /** Package fee scopes: one per branch, plus one per section-specific group */
  const packageScopes = useMemo(() => {
    const rows: { branch: string; section: string }[] = [];
    for (const b of selectedBranches) {
      rows.push({ branch: b.name, section: '' });
      // Sections that have their own subject groups (section-specific
      // mappings) plus sections explicitly scoped in step 1 — each gets its
      // own package fee row.
      const sections = new Set<string>(
        Object.keys(mappedByBranch[b.name] ?? {}).filter(Boolean),
      );
      for (const sec of branchSections[b.id] ?? []) {
        if (sec.trim()) sections.add(sec.trim());
      }
      for (const section of [...sections].sort((a, z) => a.localeCompare(z))) {
        rows.push({ branch: b.name, section });
      }
    }
    return rows;
  }, [selectedBranches, mappedByBranch, branchSections]);

  const totalMappedCount = useMemo(
    () =>
      Object.values(mappedByBranch).reduce(
        (sum, groups) =>
          sum +
          Object.values(groups).reduce((s, list) => s + list.length, 0),
        0,
      ),
    [mappedByBranch],
  );

  /** Max unique selected papers for any branch */
  const maxSupplySubjectCount = useMemo(() => {
    let max = 0;
    for (const b of selectedBranches) {
      const ids = new Set<number>();
      const groups = mappedByBranch[b.name] ?? {};
      for (const [section, subjects] of Object.entries(groups)) {
        for (const s of subjects) {
          const key = rowKey(b.name, section, s.id);
          if (selectedFees[key]?.selected) ids.add(s.id);
        }
      }
      if (ids.size > max) max = ids.size;
    }
    return max;
  }, [selectedBranches, mappedByBranch, selectedFees]);

  /**
   * Supply fee tiers are 1 … (N − 1) where N is max papers on the exam.
   * Selecting all N papers uses the package fee instead.
   */
  const supplyTierCount = useMemo(() => {
    if (maxSupplySubjectCount <= 0) return 0;
    if (maxSupplySubjectCount === 1) return 1;
    return maxSupplySubjectCount - 1;
  }, [maxSupplySubjectCount]);

  const allowsRegular = types.includes('regular');
  const allowsSupply = types.some(isCountBasedType);

  // Keep default supply tier inputs sized to 1 … (N − 1)
  useEffect(() => {
    if (!allowsSupply || supplyTierCount < 1) return;
    setSupplyFeeByCount((prev) => {
      if (prev.length === supplyTierCount) return prev;
      const next = [...prev];
      while (next.length < supplyTierCount) next.push('');
      return next.slice(0, supplyTierCount);
    });
    setSupplyFeeByBranch((prev) => {
      const next: Record<string, string[]> = {};
      for (const [branch, tiers] of Object.entries(prev)) {
        const row = [...tiers];
        while (row.length < supplyTierCount) row.push('');
        next[branch] = row.slice(0, supplyTierCount);
      }
      return next;
    });
  }, [allowsSupply, supplyTierCount]);

  useEffect(() => {
    if (initial) {
      setName(initial.name);
      const nextTypes = (
        initial.allowedTypes?.length
          ? [...initial.allowedTypes]
          : [initial.type]
      ).filter((t): t is ExamType => t === 'regular' || t === 'supply');
      setTypes(nextTypes.length > 0 ? nextTypes : DEFAULT_CREATE_TYPES);
      setRegulationId(String(initial.regulationId));
      setCollegeName(initial.college ?? '');
      const initialBatches = initial.scopes?.length
        ? [...new Set(initial.scopes.map((s) => s.batch).filter(Boolean))]
        : (initial.batch ? initial.batch.split(',').map((b) => b.trim()).filter(Boolean) : []);
      setSelectedBatches(initialBatches.length > 0 ? initialBatches : (initial.batch ? [initial.batch] : []));
      const initialYears = initial.scopes?.length
        ? [...new Set(initial.scopes.map((s) => Number(s.yearOfStudy)).filter(Boolean))]
        : (initial.yearOfStudy ? [Number(initial.yearOfStudy)] : []);
      setSelectedYears(initialYears.length > 0 ? initialYears : (initial.yearOfStudy ? [Number(initial.yearOfStudy)] : []));
      const initialSemesters = initial.scopes?.length
        ? [...new Set(initial.scopes.map((s) => Number(s.semester)).filter(Boolean))]
        : (initial.semester ? [Number(initial.semester)] : []);
      setSelectedSemesters(initialSemesters.length > 0 ? initialSemesters : (initial.semester ? [Number(initial.semester)] : []));
      setPackageFee(
        initial.packageFee != null ? String(initial.packageFee) : '',
      );
      setDuplicateHallTicketFee(
        initial.duplicateHallTicketFee != null
          ? String(initial.duplicateHallTicketFee)
          : '',
      );
      setApplicationStartDate(
        initial.applicationStartDate ? String(initial.applicationStartDate).slice(0, 10) : '',
      );
      setApplicationEndDate(
        initial.applicationEndDate ? String(initial.applicationEndDate).slice(0, 10) : '',
      );
      setExaminationStartDate(
        initial.examinationStartDate ? String(initial.examinationStartDate).slice(0, 10) : '',
      );
      setExaminationEndDate(
        initial.examinationEndDate ? String(initial.examinationEndDate).slice(0, 10) : '',
      );
      setLateFeeStartDate(
        initial.lateFeeStartDate ? String(initial.lateFeeStartDate).slice(0, 10) : '',
      );
      setInstructions(initial.instructions ?? '');
      setSlabs(
        initial.lateFeeSlabs?.length
          ? initial.lateFeeSlabs.map((s) => ({
              fromDate: String(s.fromDate ?? '').slice(0, 10),
              toDate: s.toDate == null ? null : String(s.toDate).slice(0, 10),
              amount: Number(s.amount),
            }))
          : [
              {
                fromDate: initial.lateFeeStartDate ?? '',
                toDate: null,
                amount: 100,
              },
            ],
      );
      const fees: Record<string, SubjectRowState> = {};
      for (const es of initial.examSubjects ?? []) {
        fees[rowKey(es.branch ?? '', es.section ?? '', es.subjectId)] = {
          selected: true,
          fee: String(es.fee),
          examDate: es.examDate ?? '',
          session: (es.session as ExamSession | null) ?? '',
          startTime: es.startTime ?? '',
          endTime: es.endTime ?? '',
          duration:
            es.durationMinutes != null ? String(es.durationMinutes) : '',
        };
      }
      setSelectedFees(fees);
      const pkgFees: Record<string, string> = {};
      for (const pf of initial.packageFees ?? []) {
        pkgFees[pkgKey(pf.branch, pf.section ?? '')] = String(pf.amount);
      }
      setPackageFeeByScope(pkgFees);
      const defaultSupply = (initial.supplyFeeByCount ?? []).map((n) =>
        String(n),
      );
      setSupplyFeeByCount(defaultSupply);
      const branchSupply: Record<string, string[]> = {};
      for (const entry of initial.supplyFeesByBranch ?? []) {
        branchSupply[entry.branch] = (entry.feesByCount ?? []).map((n) =>
          String(n),
        );
      }
      setSupplyFeeByBranch(branchSupply);
      setSelectedBranchIds([]);
      setBranchSections({});

      const regulation = regulations.find((r) => r.id === initial.regulationId);
      const initialCourseNames = new Set<string>();
      if (initial.scopes?.length) {
        for (const s of initial.scopes) {
          if (s.course) {
            s.course.split(',').forEach((c) => initialCourseNames.add(c.trim()));
          }
        }
      }
      if (initial.course) {
        initial.course.split(',').forEach((c) => initialCourseNames.add(c.trim()));
      }

      const matchingScopes = regulation?.scopes?.filter(
        (s) =>
          initialCourseNames.has(s.courseName) &&
          (!initial.college || s.collegeName === initial.college),
      ) ?? [];

      if (matchingScopes.length > 0) {
        setCollegeId(String(matchingScopes[0].collegeId));
        setCollegeName(matchingScopes[0].collegeName);
        setSelectedCourseIds([...new Set(matchingScopes.map((s) => s.courseId))]);
      } else {
        const fallbackScope = regulation?.scopes?.find(
          (s) => (!initial.college || s.collegeName === initial.college),
        );
        if (fallbackScope) {
          setCollegeId(String(fallbackScope.collegeId));
          setCollegeName(fallbackScope.collegeName);
        }
      }
    } else {
      setName('');
      setTypes(DEFAULT_CREATE_TYPES);
      setRegulationId(defaultRegulationId ? String(defaultRegulationId) : '');
      setCollegeId('');
      setCollegeName('');
      setSelectedCourseIds([]);
      setSelectedBranchIds([]);
      setBranchSections({});
      setSectionsByBranch({});
      setSelectedBatches([]);
      setSelectedYears([]);
      setSelectedSemesters([]);
      setYearSem(null);
      setSelectedFees({});
      setPackageFee('');
      setDuplicateHallTicketFee('');
      setPackageFeeByScope({});
      setBulkPackageFee('');
      setSupplyFeeByCount([]);
      setSupplyFeeByBranch({});
      setApplicationStartDate('');
      setApplicationEndDate('');
      setExaminationStartDate('');
      setExaminationEndDate('');
      setLateFeeStartDate('');
      setSlabs([{ fromDate: '', toDate: null, amount: 100 }]);
      setInstructions('');
      setSubmitForApproval(false);
      setStep(1);
    }
    setError('');
  }, [initial, defaultRegulationId, regulations]);

  useEffect(() => {
    if (selectedCourseIds.length === 0) {
      setBranches([]);
      return;
    }
    let cancelled = false;
    Promise.all(
      selectedCourseIds.map((cId) =>
        api.getSdmsBranches(cId).catch(() => [] as SdmsBranch[]),
      ),
    )
      .then((lists) => {
        if (cancelled) return;
        const map = new Map<number, SdmsBranch>();
        for (const list of lists) {
          for (const b of list) {
            if (!map.has(b.id)) map.set(b.id, b);
          }
        }
        const data = Array.from(map.values()).sort((a, b) =>
          a.name.localeCompare(b.name),
        );
        setBranches(data);

        if (!initial) return;

        if (initial.scopes?.length) {
          const ids: number[] = [];
          const sections: Record<number, string[]> = {};
          for (const scope of initial.scopes) {
            const match = data.find(
              (b) =>
                (scope.branchId != null && b.id === scope.branchId) ||
                b.name === scope.branch,
            );
            if (!match) continue;
            if (!ids.includes(match.id)) ids.push(match.id);
            if (scope.section) {
              const prev = sections[match.id] ?? [];
              if (!prev.includes(scope.section)) {
                sections[match.id] = [...prev, scope.section];
              }
            }
          }
          setSelectedBranchIds(ids);
          setBranchSections(sections);
        } else if (initial.branch) {
          const match = data.find((b) => b.name === initial.branch);
          if (match) setSelectedBranchIds([match.id]);
        }
      })
      .catch(() => {
        if (!cancelled) setBranches([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCourseIds, initial]);

  useEffect(() => {
    if (!firstBranchId) {
      setYearSem(null);
      return;
    }
    api
      .getSdmsBranchYearSemesters(firstBranchId)
      .then((data) => {
        setYearSem(data);
      })
      .catch(() => setYearSem(null));
  }, [firstBranchId]);

  useEffect(() => {
    if (selectedBatches.length === 0 || selectedBranchIds.length === 0) {
      setSectionsByBranch({});
      return;
    }
    let cancelled = false;
    Promise.all(
      selectedBranchIds.map(async (id) => {
        try {
          const sectionLists = await Promise.all(
            selectedBatches.map((b) =>
              api.getSdmsBranchSections(id, b).catch(() => [] as SdmsSection[]),
            ),
          );
          const map = new Map<string, SdmsSection>();
          for (const list of sectionLists) {
            for (const sec of list) {
              if (!map.has(sec.name)) map.set(sec.name, sec);
            }
          }
          return [id, Array.from(map.values())] as const;
        } catch {
          return [id, [] as SdmsSection[]] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      const next: Record<number, SdmsSection[]> = {};
      for (const [id, sections] of entries) {
        next[id] = sections;
      }
      setSectionsByBranch(next);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedBranchIds, selectedBatches]);

  useEffect(() => {
    if (
      !regulationId ||
      !courseName ||
      selectedBranches.length === 0 ||
      selectedBatches.length === 0 ||
      selectedYears.length === 0 ||
      selectedSemesters.length === 0
    ) {
      setMappedByBranch({});
      return;
    }
    let cancelled = false;
    setLoadingScope(true);
    Promise.all(
      selectedBranches.map(async (b) => {
        try {
          const branchCourse =
            courses.find((c) => c.id === b.courseId)?.name || courseName;
          const requests: Promise<any[]>[] = [];
          for (const bch of selectedBatches) {
            for (const yr of selectedYears) {
              for (const sm of selectedSemesters) {
                requests.push(
                  api
                    .getSubjectMappings({
                      regulationId: parseInt(regulationId, 10),
                      course: branchCourse,
                      branch: b.name,
                      batch: bch,
                      yearOfStudy: yr,
                      semester: sm,
                    })
                    .catch(() => []),
                );
              }
            }
          }
          const results = await Promise.all(requests);
          const entries = results.flat();
          // Sections chosen for this branch in step 1; empty = all sections.
          const scopeSections = branchSections[b.id] ?? [];
          const groups: Record<string, Map<number, Subject>> = {};
          const put = (section: string, subject: Subject) => {
            const g = (groups[section] ??= new Map<number, Subject>());
            if (!g.has(subject.id)) g.set(subject.id, subject);
          };
          for (const e of entries) {
            if (!e.subject) continue;
            if (e.sectionMode !== 'selected' || !e.sections?.length) {
              put('', e.subject);
              continue;
            }
            for (const sec of e.sections) {
              if (
                scopeSections.length > 0 &&
                !scopeSections.some(
                  (x) => x.toLowerCase() === sec.toLowerCase(),
                )
              ) {
                continue;
              }
              put(sec, e.subject);
            }
          }
          const sectionGroups: SectionGroups = {};
          for (const [section, byId] of Object.entries(groups)) {
            sectionGroups[section] = Array.from(byId.values()).sort((x, y) =>
              x.code.localeCompare(y.code),
            );
          }
          return [b.name, sectionGroups] as const;
        } catch {
          return [b.name, {} as SectionGroups] as const;
        }
      }),
    )
      .then((results) => {
        if (cancelled) return;
        const grouped: Record<string, SectionGroups> = {};
        for (const [branchName, sectionGroups] of results) {
          grouped[branchName] = sectionGroups;
        }
        setMappedByBranch(grouped);
        setSelectedFees((prev) => {
          const next = { ...prev };
          for (const [branchName, sectionGroups] of results) {
            for (const [section, subjects] of Object.entries(sectionGroups)) {
              for (const subject of subjects) {
                const key = rowKey(branchName, section, subject.id);
                // Edit mode may have stored the row under a broader scope
                // (legacy common '' branch, or branch-wide when the mapping
                // has since become section-specific) — migrate it here.
                const legacy =
                  next[rowKey('', '', subject.id)] ??
                  (section ? next[rowKey(branchName, '', subject.id)] : undefined);
                if (next[key] === undefined) {
                  next[key] = legacy ? { ...legacy } : { ...EMPTY_ROW };
                }
              }
            }
          }
          return next;
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingScope(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    regulationId,
    courseName,
    selectedBranches,
    branchSections,
    selectedBatches,
    selectedYears,
    selectedSemesters,
  ]);

  function toggleType(t: ExamType) {
    setTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  }

  function toggleBranch(branch: SdmsBranch) {
    setSelectedBranchIds((prev) => {
      if (prev.includes(branch.id)) {
        setBranchSections((secs) => {
          const next = { ...secs };
          delete next[branch.id];
          return next;
        });
        const next = prev.filter((id) => id !== branch.id);
        if (prev[0] === branch.id) {
          setSelectedYears([]);
          setSelectedSemesters([]);
        }
        return next;
      }
      return [...prev, branch.id];
    });
  }

  function toggleSection(branchId: number, sectionName: string) {
    setBranchSections((prev) => {
      const current = prev[branchId] ?? [];
      const next = current.includes(sectionName)
        ? current.filter((s) => s !== sectionName)
        : [...current, sectionName];
      return { ...prev, [branchId]: next };
    });
  }

  function toggleCourse(course: { id: number; name: string }) {
    setSelectedCourseIds((prev) => {
      const isChecked = prev.includes(course.id);
      const next = isChecked
        ? prev.filter((id) => id !== course.id)
        : [...prev, course.id];
      if (isChecked) {
        // Prune branches belonging to this unselected course
        setSelectedBranchIds((prevBranches) => {
          const removedBranchIds = new Set(
            branches
              .filter((b) => b.courseId === course.id)
              .map((b) => b.id),
          );
          return prevBranches.filter((bId) => !removedBranchIds.has(bId));
        });
        setBranchSections((prevSecs) => {
          const removedBranchIds = new Set(
            branches
              .filter((b) => b.courseId === course.id)
              .map((b) => b.id),
          );
          const nextSecs = { ...prevSecs };
          for (const id of removedBranchIds) {
            delete nextSecs[id];
          }
          return nextSecs;
        });
      }
      return next;
    });
  }

  function toggleAllCourses() {
    if (selectedCourseIds.length === courses.length) {
      setSelectedCourseIds([]);
      setSelectedBranchIds([]);
      setBranchSections({});
      setSelectedBatches([]);
      setSelectedYears([]);
      setSelectedSemesters([]);
    } else {
      setSelectedCourseIds(courses.map((c) => c.id));
    }
  }

  function resetDownstreamFromRegulation() {
    setCollegeId('');
    setCollegeName('');
    setSelectedCourseIds([]);
    setSelectedBranchIds([]);
    setBranchSections({});
    setSelectedBatches([]);
    setSelectedYears([]);
    setSelectedSemesters([]);
  }

  function validateStep(current: Step): boolean {
    if (current === 1) {
      if (types.length === 0) {
        setError('Select at least one enrollment type (Regular / Supply).');
        return false;
      }
      if (
        !name.trim() ||
        !regulationId ||
        !collegeName ||
        selectedCourseIds.length === 0 ||
        selectedBranchIds.length === 0 ||
        selectedBatches.length === 0
      ) {
        setError(
          'Name, regulation, college, at least one programme, at least one branch, and at least one batch are required.',
        );
        return false;
      }
      if (selectedYears.length === 0) {
        setError('Select at least one program year.');
        return false;
      }
      if (selectedSemesters.length === 0) {
        setError('Select at least one semester.');
        return false;
      }
    }
    if (current === 2) {
      const selected = Object.entries(selectedFees).filter(
        ([key, v]) => v.selected && visibleRowKeys.has(key),
      );
      if (selected.length === 0) {
        setError('Select at least one mapped subject and set exam dates.');
        return false;
      }
      for (const b of selectedBranches) {
        const groups = mappedByBranch[b.name] ?? {};
        const hasAny = Object.entries(groups).some(([section, subjects]) =>
          subjects.some(
            (s) => selectedFees[rowKey(b.name, section, s.id)]?.selected,
          ),
        );
        if (!hasAny) {
          setError(
            `Select at least one subject for the ${b.name} group — students of every scoped branch need papers.`,
          );
          return false;
        }
      }
      for (const [key, v] of selected) {
        const { branch, section } = parseRowKey(key);
        const label = section
          ? `${branch} · Section ${section}`
          : branch || 'common';
        if (!v.examDate) {
          setError(`Set an exam date for every selected subject (${label} group).`);
          return false;
        }
        if (v.startTime && v.endTime) {
          if (computeDuration(v.startTime, v.endTime) == null) {
            setError(
              `End time must be after start time (${label} group).`,
            );
            return false;
          }
        }
        if (v.duration) {
          const d = parseInt(v.duration, 10);
          if (isNaN(d) || d <= 0) {
            setError(`Duration must be a positive number of minutes (${label} group).`);
            return false;
          }
        }
      }
      if (allowsRegular) {
        const hasDefault =
          packageFee.trim() !== '' &&
          !isNaN(parseFloat(packageFee)) &&
          parseFloat(packageFee) >= 0;
        const hasScoped = Object.values(packageFeeByScope).some(
          (raw) => raw.trim() !== '',
        );
        if (!hasDefault && !hasScoped) {
          setError(
            'Set a package fee for Regular enrollment (default or per branch).',
          );
          return false;
        }
      }
      for (const [key, raw] of Object.entries(packageFeeByScope)) {
        if (!raw.trim()) continue;
        const amount = parseFloat(raw);
        if (isNaN(amount) || amount < 0) {
          const { branch, section } = parsePkgKey(key);
          setError(
            `Package fee for ${branch}${section ? ` Section ${section}` : ''} must be a valid non-negative number.`,
          );
          return false;
        }
      }
      if (allowsSupply) {
        if (supplyTierCount < 1) {
          setError('Select subjects before configuring supply fees.');
          return false;
        }
        if (supplyFeeByCount.length !== supplyTierCount) {
          setError(
            `Supply fee schedule must cover 1 through ${supplyTierCount} subject(s).`,
          );
          return false;
        }
        for (let i = 0; i < supplyFeeByCount.length; i += 1) {
          const amount = parseFloat(supplyFeeByCount[i]);
          if (isNaN(amount) || amount < 0 || !supplyFeeByCount[i].trim()) {
            setError(
              `Enter a valid supply fee for ${i + 1} subject${i === 0 ? '' : 's'}.`,
            );
            return false;
          }
        }
        for (const [branch, tiers] of Object.entries(supplyFeeByBranch)) {
          if (!tiers.some((t) => t.trim() !== '')) continue;
          if (tiers.length !== supplyTierCount) {
            setError(
              `Supply fee schedule for ${branch} must cover 1 through ${supplyTierCount} subject(s).`,
            );
            return false;
          }
          for (let i = 0; i < tiers.length; i += 1) {
            const amount = parseFloat(tiers[i]);
            if (isNaN(amount) || amount < 0 || !tiers[i].trim()) {
              setError(
                `Enter a valid supply fee for ${branch} · ${i + 1} subject${i === 0 ? '' : 's'}.`,
              );
              return false;
            }
          }
        }
      }
    }
    if (current === 3) {
      if (
        applicationEndDate &&
        examinationStartDate &&
        applicationEndDate >= examinationStartDate
      ) {
        setError('Application end must be before examination start.');
        return false;
      }
      if (
        examinationStartDate &&
        examinationEndDate &&
        examinationStartDate > examinationEndDate
      ) {
        setError('Examination start cannot be after end date.');
        return false;
      }
      if (slabs.length > 0) {
        for (let i = 0; i < slabs.length; i += 1) {
          const s = slabs[i];
          const isLast = i === slabs.length - 1;
          if (!s.fromDate) {
            setError('Late fee slab "from date" is required.');
            return false;
          }
          if (!isLast && !s.toDate) {
            setError(
              'Only the last late fee slab may leave "To date" empty (until application end).',
            );
            return false;
          }
          if (s.toDate && s.fromDate > s.toDate) {
            setError('Late fee slab "from date" cannot be after "to date".');
            return false;
          }
          if (
            lateFeeStartDate &&
            s.fromDate &&
            s.fromDate < lateFeeStartDate
          ) {
            setError(
              'Late fee slab dates cannot start before the late fee start date.',
            );
            return false;
          }
          if (s.amount < 0) {
            setError('Late fee slab amount must be non-negative.');
            return false;
          }
          if (i > 0) {
            const prev = slabs[i - 1];
            if (!prev.toDate) {
              setError('Each late fee slab before the last one must have a "to date".');
              return false;
            }
            const expectedFrom = nextDate(prev.toDate);
            if (!expectedFrom || s.fromDate !== expectedFrom) {
              setError(
                `Late fee slab ${i + 1} must start on the day after the previous slab ends (${expectedFrom ?? 'invalid previous date'}).`,
              );
              return false;
            }
          }
        }
      }
    }
    setError('');
    return true;
  }

  function goNext() {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(4, s + 1) as Step);
  }

  function goBack() {
    setError('');
    setStep((s) => Math.max(1, s - 1) as Step);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validateStep(3) || !validateStep(2) || !validateStep(1)) {
      return;
    }

    const subjects: ExamSubjectFeeInput[] = Object.entries(selectedFees)
      .filter(([key, v]) => v.selected && visibleRowKeys.has(key))
      .map(([key, v]) => {
        const { branch: branchName, section, subjectId } = parseRowKey(key);
        const duration = v.duration
          ? parseInt(v.duration, 10)
          : (computeDuration(v.startTime, v.endTime) ?? undefined);
        return {
          subjectId,
          branch: branchName || undefined,
          section: section || undefined,
          fee: 0,
          examDate: v.examDate,
          session: v.session || undefined,
          startTime: v.startTime || undefined,
          endTime: v.endTime || undefined,
          durationMinutes: duration,
        };
      });

    const pkg = packageFee ? parseFloat(packageFee) : undefined;
    if (packageFee && (isNaN(pkg!) || pkg! < 0)) {
      setError('Package fee must be valid.');
      return;
    }
    const duplicateFee = duplicateHallTicketFee
      ? parseFloat(duplicateHallTicketFee)
      : undefined;
    if (
      duplicateHallTicketFee &&
      (isNaN(duplicateFee!) || duplicateFee! < 0)
    ) {
      setError('Duplicate hall ticket fee must be a valid non-negative amount.');
      return;
    }

    const scopeKeys = new Set(
      packageScopes.map((s) => pkgKey(s.branch, s.section)),
    );
    const packageFees: PackageFeeEntry[] = Object.entries(packageFeeByScope)
      .filter(([key, raw]) => scopeKeys.has(key) && raw.trim() !== '')
      .map(([key, raw]) => {
        const { branch: branchName, section } = parsePkgKey(key);
        return {
          branch: branchName,
          section: section || undefined,
          amount: parseFloat(raw),
        };
      });

    const supplyFeesPayload: number[] | undefined = allowsSupply
      ? supplyFeeByCount.map((raw) => parseFloat(raw))
      : undefined;
    const supplyFeesByBranchPayload: SupplyFeeBranchEntry[] | undefined =
      allowsSupply
        ? Object.entries(supplyFeeByBranch)
            .filter(([, tiers]) => tiers.some((t) => t.trim() !== ''))
            .map(([branch, tiers]) => ({
              branch,
              feesByCount: tiers.map((raw) => parseFloat(raw)),
            }))
        : undefined;

    const batchSummary = selectedBatches.join(', ');
    const primaryBatch = selectedBatches[0] ?? '';
    const primaryYear = selectedYears[0] ?? 1;
    const primarySemester = selectedSemesters[0] ?? 1;

    const scopesPayload = selectedBranches.map((b) => {
      const branchCourse = courses.find((c) => c.id === b.courseId);
      return {
        course: branchCourse?.name || courseName,
        courseId: branchCourse?.id || (selectedCourseIds[0] ?? undefined),
        courses: selectedCourses.map((c) => c.name),
        branch: b.name,
        branchId: b.id,
        sections: branchSections[b.id] ?? [],
        batches: selectedBatches,
        batch: primaryBatch,
        yearOfStudies: selectedYears,
        yearOfStudy: primaryYear,
        semesters: selectedSemesters,
        semester: primarySemester,
      };
    });
    const primaryBranch =
      selectedBranches[0]?.name ?? initial?.branch ?? '';

    try {
      if (isEdit) {
        await onSubmit({
          name: name.trim(),
          types,
          type: types[0],
          regulationId: parseInt(regulationId, 10),
          college: collegeName,
          course: courseName,
          courses: selectedCourses.map((c) => c.name),
          courseIds: selectedCourseIds,
          branch: primaryBranch,
          batch: batchSummary || primaryBatch,
          batches: selectedBatches,
          yearOfStudy: primaryYear,
          yearOfStudies: selectedYears,
          semester: primarySemester,
          semesters: selectedSemesters,
          scopes: scopesPayload,
          subjects,
          packageFee: pkg,
          duplicateHallTicketFee: duplicateFee,
          packageFees,
          supplyFeeByCount: supplyFeesPayload,
          supplyFeesByBranch: supplyFeesByBranchPayload,
          applicationStartDate: applicationStartDate || undefined,
          applicationEndDate: applicationEndDate || undefined,
          examinationStartDate: examinationStartDate || undefined,
          examinationEndDate: examinationEndDate || undefined,
          lateFeeStartDate: lateFeeStartDate || undefined,
          lateFeeSlabs: slabs.filter((s) => s.fromDate && s.amount >= 0),
          instructions: instructions.trim() || undefined,
        });
      } else {
        await onSubmit({
          name: name.trim(),
          types,
          type: types[0],
          regulationId: parseInt(regulationId, 10),
          college: collegeName,
          course: courseName,
          courses: selectedCourses.map((c) => c.name),
          courseIds: selectedCourseIds,
          branch: primaryBranch,
          batch: batchSummary || primaryBatch,
          batches: selectedBatches,
          yearOfStudy: primaryYear,
          yearOfStudies: selectedYears,
          semester: primarySemester,
          semesters: selectedSemesters,
          scopes: scopesPayload,
          subjects,
          packageFee: pkg,
          duplicateHallTicketFee: duplicateFee,
          packageFees,
          supplyFeeByCount: supplyFeesPayload,
          supplyFeesByBranch: supplyFeesByBranchPayload,
          applicationStartDate: applicationStartDate || undefined,
          applicationEndDate: applicationEndDate || undefined,
          examinationStartDate: examinationStartDate || undefined,
          examinationEndDate: examinationEndDate || undefined,
          lateFeeStartDate: lateFeeStartDate || undefined,
          lateFeeSlabs: slabs.filter((s) => s.fromDate && s.amount >= 0),
          instructions: instructions.trim() || undefined,
          submitForApproval,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save examination');
    }
  }

  const availableYears = useMemo(() => {
    if (yearSem?.years?.length) {
      return yearSem.years;
    }
    return [
      { yearOfStudy: 1, label: 'I Year', semesters: [{ semesterNumber: 1, label: 'Semester 1' }, { semesterNumber: 2, label: 'Semester 2' }] },
      { yearOfStudy: 2, label: 'II Year', semesters: [{ semesterNumber: 1, label: 'Semester 1' }, { semesterNumber: 2, label: 'Semester 2' }] },
      { yearOfStudy: 3, label: 'III Year', semesters: [{ semesterNumber: 1, label: 'Semester 1' }, { semesterNumber: 2, label: 'Semester 2' }] },
      { yearOfStudy: 4, label: 'IV Year', semesters: [{ semesterNumber: 1, label: 'Semester 1' }, { semesterNumber: 2, label: 'Semester 2' }] },
    ];
  }, [yearSem]);

  const availableSemesters = useMemo(() => {
    const map = new Map<number, string>();
    for (const y of availableYears) {
      if (selectedYears.length === 0 || selectedYears.includes(y.yearOfStudy)) {
        for (const s of y.semesters) {
          if (!map.has(s.semesterNumber)) {
            map.set(s.semesterNumber, s.label || `Semester ${s.semesterNumber}`);
          }
        }
      }
    }
    if (map.size === 0) {
      map.set(1, 'Semester 1');
      map.set(2, 'Semester 2');
    }
    return Array.from(map.entries()).map(([semesterNumber, label]) => ({ semesterNumber, label }));
  }, [availableYears, selectedYears]);

  const selectedYear = availableYears.find(
    (y) => selectedYears.includes(y.yearOfStudy),
  );

  const selectedCount = Object.entries(selectedFees).filter(
    ([key, v]) => v.selected && visibleRowKeys.has(key),
  ).length;

  function applyFeeToAllPackages() {
    const fee = bulkPackageFee.trim();
    if (!fee || isNaN(parseFloat(fee)) || parseFloat(fee) < 0) {
      setError('Enter a valid amount to apply to all package fees.');
      return;
    }
    setError('');
    setPackageFeeByScope((prev) => {
      const next = { ...prev };
      for (const s of packageScopes) {
        next[pkgKey(s.branch, s.section)] = fee;
      }
      return next;
    });
  }

  function applySupplyDefaultToAllBranches() {
    if (
      supplyFeeByCount.length === 0 ||
      supplyFeeByCount.some(
        (t) => !t.trim() || isNaN(parseFloat(t)) || parseFloat(t) < 0,
      )
    ) {
      setError('Enter the default supply fee schedule before applying to branches.');
      return;
    }
    setError('');
    const copy = [...supplyFeeByCount];
    setSupplyFeeByBranch(() => {
      const next: Record<string, string[]> = {};
      for (const b of selectedBranches) {
        next[b.name] = [...copy];
      }
      return next;
    });
  }

  const reviewTypes = types;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (step < 4) goNext();
        else void handleSubmit(e);
      }}
      className="space-y-5"
    >
      <div className="flex items-center gap-2 border-b border-[var(--border)] pb-4">
        {[
          { n: 1, label: 'Scope' },
          { n: 2, label: 'Subjects & fees' },
          { n: 3, label: 'Dates' },
          { n: 4, label: 'Review' },
        ].map((item, idx) => (
          <div key={item.n} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                step === item.n
                  ? 'bg-[var(--primary)] text-white'
                  : step > item.n
                    ? 'bg-[var(--success-soft)] text-[var(--success)]'
                    : 'bg-slate-100 text-slate-500'
              }`}
            >
              {step > item.n ? '✓' : item.n}
            </span>
            <span
              className={`hidden text-xs font-medium sm:inline ${
                step === item.n ? 'text-slate-900' : 'text-[var(--muted)]'
              }`}
            >
              {item.label}
            </span>
            {idx < 3 && (
              <div className="mx-1 hidden h-px flex-1 bg-[var(--border)] sm:block" />
            )}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <Input
            label="Examination name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. B.Tech 5th Sem Regular May 2026"
            required
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                {isEdit ? 'Enrollment types' : 'Enrollment types'}
              </label>
              {isEdit ? (
                <div className="flex flex-wrap gap-3 rounded-[var(--radius)] border border-[var(--border)] px-3.5 py-2.5">
                  {ALL_EXAM_TYPES.map((opt) => (
                    <label
                      key={opt.value}
                      className="flex items-center gap-2 text-sm text-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={types.includes(opt.value)}
                        onChange={() => toggleType(opt.value)}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-3 rounded-[var(--radius)] border border-[var(--border)] px-3.5 py-2.5">
                  {ALL_EXAM_TYPES.map((opt) => (
                    <label
                      key={opt.value}
                      className="flex items-center gap-2 text-sm text-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={types.includes(opt.value)}
                        onChange={() => toggleType(opt.value)}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              )}
              <p className="mt-1.5 text-xs text-[var(--muted)]">
                One examination is created. Students choose Regular or Supply
                when they enroll.
              </p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Regulation
              </label>
              <select
                value={regulationId}
                onChange={(e) => {
                  setRegulationId(e.target.value);
                  resetDownstreamFromRegulation();
                }}
                className={selectClass}
                required
                disabled={!!initial}
              >
                <option value="">Select regulation</option>
                {regulations.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code} — {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                College
              </label>
              <select
                value={collegeId}
                onChange={(e) => {
                  const id = e.target.value;
                  setCollegeId(id);
                  const c = colleges.find((x) => x.id === parseInt(id, 10));
                  setCollegeName(c?.name ?? '');
                  setSelectedCourseIds([]);
                  setSelectedBranchIds([]);
                  setBranchSections({});
                  setSelectedBatches([]);
                  setSelectedYears([]);
                  setSelectedSemesters([]);
                }}
                className={selectClass}
                required
                disabled={!regulationId}
              >
                <option value="">Select college</option>
                {colleges.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            {/* Programme Multi-Select */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700">
                  Programme{selectedCourseIds.length > 0 ? ` (${selectedCourseIds.length} selected)` : ''}
                </label>
                {courses.length > 0 && (
                  <button
                    type="button"
                    onClick={toggleAllCourses}
                    className="text-xs font-medium text-[var(--primary)] hover:underline"
                  >
                    {selectedCourseIds.length === courses.length ? 'Deselect all' : 'Select all'}
                  </button>
                )}
              </div>
              {!collegeId ? (
                <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] p-3 text-xs text-[var(--muted)] bg-slate-50">
                  Select a college to load programmes.
                </div>
              ) : courses.length === 0 ? (
                <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] p-3 text-xs text-[var(--muted)] bg-slate-50">
                  No programmes found for this college.
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] bg-white p-2.5 space-y-1">
                  {courses.map((c) => {
                    const isChecked = selectedCourseIds.includes(c.id);
                    return (
                      <label
                        key={c.id}
                        className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs font-medium cursor-pointer transition ${
                          isChecked
                            ? 'bg-sky-50 text-sky-900 font-semibold'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleCourse(c)}
                        />
                        <span>{c.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Branches
            </label>
            {selectedCourseIds.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                Select at least one programme to load branches.
              </p>
            ) : branches.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                No SDMS branches found for the selected programmes.
              </p>
            ) : (
              <div className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] p-3">
                {branches.map((b) => {
                  const checked = selectedBranchIds.includes(b.id);
                  const available = sectionsByBranch[b.id] ?? [];
                  const selectedSecs = branchSections[b.id] ?? [];
                  const branchCourse = courses.find((c) => c.id === b.courseId);
                  return (
                    <div key={b.id} className="space-y-1.5">
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleBranch(b)}
                        />
                        <span>{b.name}</span>
                        {b.code ? (
                          <span className="font-normal text-[var(--muted)]">
                            ({b.code})
                          </span>
                        ) : null}
                        {selectedCourseIds.length > 1 && branchCourse ? (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-normal text-slate-600">
                            {branchCourse.name}
                          </span>
                        ) : null}
                      </label>
                      {checked && selectedBatches.length > 0 && (
                        <div className="ml-6 space-y-1">
                          {available.length === 0 ? (
                            <p className="text-xs text-[var(--muted)]">
                              No sections listed — all sections will be included.
                            </p>
                          ) : (
                            <>
                              <p className="text-xs text-[var(--muted)]">
                                Sections (none selected = all):
                              </p>
                              <div className="flex flex-wrap gap-x-4 gap-y-1">
                                {available.map((sec) => (
                                  <label
                                    key={sec.name}
                                    className="flex items-center gap-1.5 text-xs text-slate-700"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selectedSecs.includes(sec.name)}
                                      onChange={() =>
                                        toggleSection(b.id, sec.name)
                                      }
                                    />
                                    {sec.name}
                                  </label>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                      {checked && selectedBatches.length === 0 && (
                        <p className="ml-6 text-xs text-[var(--muted)]">
                          Select at least one batch to load sections.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {/* 1. Batch Multi-Select */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700">
                  Batch{selectedBatches.length > 0 ? ` (${selectedBatches.length} selected)` : ''}
                </label>
                {batches.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedBatches.length === batches.length) {
                        setSelectedBatches([]);
                      } else {
                        setSelectedBatches([...batches]);
                      }
                      setBranchSections({});
                    }}
                    className="text-xs font-medium text-[var(--primary)] hover:underline"
                  >
                    {selectedBatches.length === batches.length ? 'Deselect all' : 'Select all'}
                  </button>
                )}
              </div>
              {selectedCourseIds.length === 0 ? (
                <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] p-3 text-xs text-[var(--muted)] bg-slate-50">
                  Select at least one programme to load batches.
                </div>
              ) : batches.length === 0 ? (
                <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] p-3 text-xs text-[var(--muted)] bg-slate-50">
                  No batches configured for the selected programmes.
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] bg-white p-2.5 space-y-1">
                  {batches.map((b) => {
                    const isChecked = selectedBatches.includes(b);
                    return (
                      <label
                        key={b}
                        className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs font-medium cursor-pointer transition ${
                          isChecked
                            ? 'bg-sky-50 text-sky-900 font-semibold'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setSelectedBatches((prev) =>
                              prev.includes(b)
                                ? prev.filter((x) => x !== b)
                                : [...prev, b],
                            );
                            setBranchSections({});
                          }}
                        />
                        <span>{b}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 2. Program Year Multi-Select */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700">
                  Program year{selectedYears.length > 0 ? ` (${selectedYears.length} selected)` : ''}
                </label>
                {availableYears.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedYears.length === availableYears.length) {
                        setSelectedYears([]);
                      } else {
                        setSelectedYears(availableYears.map((y) => y.yearOfStudy));
                      }
                    }}
                    className="text-xs font-medium text-[var(--primary)] hover:underline"
                  >
                    {selectedYears.length === availableYears.length ? 'Deselect all' : 'Select all'}
                  </button>
                )}
              </div>
              {selectedBranchIds.length === 0 ? (
                <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] p-3 text-xs text-[var(--muted)] bg-slate-50">
                  Select at least one branch to load years.
                </div>
              ) : availableYears.length === 0 ? (
                <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] p-3 text-xs text-[var(--muted)] bg-slate-50">
                  No years found for selected branch.
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] bg-white p-2.5 space-y-1">
                  {availableYears.map((y) => {
                    const isChecked = selectedYears.includes(y.yearOfStudy);
                    return (
                      <label
                        key={y.yearOfStudy}
                        className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs font-medium cursor-pointer transition ${
                          isChecked
                            ? 'bg-sky-50 text-sky-900 font-semibold'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setSelectedYears((prev) =>
                              prev.includes(y.yearOfStudy)
                                ? prev.filter((x) => x !== y.yearOfStudy)
                                : [...prev, y.yearOfStudy],
                            );
                          }}
                        />
                        <span>{y.label}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 3. Semester Multi-Select */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700">
                  Semester{selectedSemesters.length > 0 ? ` (${selectedSemesters.length} selected)` : ''}
                </label>
                {availableSemesters.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedSemesters.length === availableSemesters.length) {
                        setSelectedSemesters([]);
                      } else {
                        setSelectedSemesters(availableSemesters.map((s) => s.semesterNumber));
                      }
                    }}
                    className="text-xs font-medium text-[var(--primary)] hover:underline"
                  >
                    {selectedSemesters.length === availableSemesters.length ? 'Deselect all' : 'Select all'}
                  </button>
                )}
              </div>
              {selectedYears.length === 0 ? (
                <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] p-3 text-xs text-[var(--muted)] bg-slate-50">
                  Select program year first to choose semesters.
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] bg-white p-2.5 space-y-1">
                  {availableSemesters.map((s) => {
                    const isChecked = selectedSemesters.includes(s.semesterNumber);
                    return (
                      <label
                        key={s.semesterNumber}
                        className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs font-medium cursor-pointer transition ${
                          isChecked
                            ? 'bg-sky-50 text-sky-900 font-semibold'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setSelectedSemesters((prev) =>
                              prev.includes(s.semesterNumber)
                                ? prev.filter((x) => x !== s.semesterNumber)
                                : [...prev, s.semesterNumber],
                            );
                          }}
                        />
                        <span>{s.label}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          {loadingScope ? (
            <p className="text-sm text-[var(--muted)]">
              Loading mapped subjects per branch…
            </p>
          ) : totalMappedCount === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              No subject mappings for the selected branches / regulation /
              programme / batch / year / semester. Create mappings first.
            </p>
          ) : (
            <>
            <p className="text-xs text-[var(--muted)]">
              Papers are grouped by branch and section. Students only see their
              own branch and section. Select a paper to set date, session, and
              timings. Fees are configured below (package for Regular, count
              tiers for Supply).
            </p>

            <div className="grid gap-4 xl:grid-cols-2">
              {selectedBranches.map((b) => {
                const groups = mappedByBranch[b.name] ?? {};
                const sectionKeys = Object.keys(groups).sort((x, y) =>
                  x === '' ? -1 : y === '' ? 1 : x.localeCompare(y),
                );
                const allRows = sectionKeys.flatMap((section) =>
                  (groups[section] ?? []).map((s) => rowKey(b.name, section, s.id)),
                );
                const groupSelected = allRows.filter(
                  (key) => selectedFees[key]?.selected,
                ).length;
                return (
                  <div
                    key={b.id}
                    className="rounded-[var(--radius)] border border-[var(--border)] bg-white"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-slate-50 px-4 py-2.5">
                      <p className="text-sm font-semibold text-slate-900">
                        {b.name}
                        <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                          {groupSelected}/{allRows.length} selected
                        </span>
                      </p>
                      {allRows.length > 0 && (
                        <button
                          type="button"
                          className="text-xs font-medium text-[var(--primary)] hover:underline"
                          onClick={() =>
                            setSelectedFees((prev) => {
                              const next = { ...prev };
                              const allOn = allRows.every(
                                (key) => next[key]?.selected,
                              );
                              for (const key of allRows) {
                                next[key] = {
                                  ...(next[key] ?? EMPTY_ROW),
                                  selected: !allOn,
                                };
                              }
                              return next;
                            })
                          }
                        >
                          {groupSelected === allRows.length
                            ? 'Deselect all'
                            : 'Select all'}
                        </button>
                      )}
                    </div>
                    {allRows.length === 0 ? (
                      <p className="px-4 py-4 text-sm text-[var(--muted)]">
                        No subjects mapped for this branch in the selected
                        scope.
                      </p>
                    ) : (
                      <div className="space-y-4 p-4">
                        {sectionKeys.map((section) => {
                          const subjects = groups[section] ?? [];
                          const showSectionHeader =
                            section !== '' || sectionKeys.length > 1;
                          return (
                            <div key={section || '__all__'} className="space-y-2">
                              {showSectionHeader && (
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                                  {section
                                    ? `Section ${section}`
                                    : 'All sections (common)'}
                                </p>
                              )}
                              <div className="space-y-2">
                                {subjects.map((subject) => {
                                  const key = rowKey(b.name, section, subject.id);
                                  const row = selectedFees[key] ?? EMPTY_ROW;
                                  const update = (patch: Partial<SubjectRowState>) =>
                                    setSelectedFees((prev) => ({
                                      ...prev,
                                      [key]: { ...row, ...patch },
                                    }));
                                  const autoDuration = computeDuration(
                                    row.startTime,
                                    row.endTime,
                                  );
                                  return (
                                    <div
                                      key={key}
                                      className={`rounded-[var(--radius)] border px-3 py-2.5 transition ${
                                        row.selected
                                          ? 'border-[var(--primary)]/25 bg-[var(--primary-soft)]/20'
                                          : 'border-[var(--border)] bg-slate-50/40'
                                      }`}
                                    >
                                      <label className="flex cursor-pointer items-start gap-3">
                                        <input
                                          type="checkbox"
                                          className="mt-0.5"
                                          checked={row.selected}
                                          onChange={(e) =>
                                            update({ selected: e.target.checked })
                                          }
                                          aria-label={`Select ${subject.code}`}
                                        />
                                        <div className="min-w-0 flex-1">
                                          <p className="text-sm font-semibold text-slate-900">
                                            {subject.code}
                                          </p>
                                          <p className="text-xs leading-snug text-[var(--muted)]">
                                            {subject.name}
                                          </p>
                                        </div>
                                      </label>
                                      {row.selected ? (
                                        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
                                          <ConfigField label="Exam date">
                                            <input
                                              type="date"
                                              value={row.examDate}
                                              onChange={(e) =>
                                                update({ examDate: e.target.value })
                                              }
                                              className={compactInputClass}
                                              aria-label={`Exam date ${subject.code}`}
                                            />
                                          </ConfigField>
                                          <ConfigField label="Session">
                                            <select
                                              value={row.session}
                                              onChange={(e) =>
                                                update({
                                                  session: e.target.value as
                                                    | ExamSession
                                                    | '',
                                                })
                                              }
                                              className={compactInputClass}
                                              aria-label={`Session ${subject.code}`}
                                            >
                                              <option value="">Auto</option>
                                              <option value="FN">Forenoon</option>
                                              <option value="AN">Afternoon</option>
                                            </select>
                                          </ConfigField>
                                          <ConfigField label="Start time">
                                            <input
                                              type="time"
                                              value={row.startTime}
                                              onChange={(e) => {
                                                const startTime = e.target.value;
                                                const d = computeDuration(
                                                  startTime,
                                                  row.endTime,
                                                );
                                                update({
                                                  startTime,
                                                  duration:
                                                    d != null
                                                      ? String(d)
                                                      : row.duration,
                                                });
                                              }}
                                              className={compactInputClass}
                                              aria-label={`Start time ${subject.code}`}
                                            />
                                          </ConfigField>
                                          <ConfigField label="End time">
                                            <input
                                              type="time"
                                              value={row.endTime}
                                              onChange={(e) => {
                                                const endTime = e.target.value;
                                                const d = computeDuration(
                                                  row.startTime,
                                                  endTime,
                                                );
                                                update({
                                                  endTime,
                                                  duration:
                                                    d != null
                                                      ? String(d)
                                                      : row.duration,
                                                });
                                              }}
                                              className={compactInputClass}
                                              aria-label={`End time ${subject.code}`}
                                            />
                                          </ConfigField>
                                          <ConfigField label="Duration (min)">
                                            <input
                                              type="number"
                                              min={1}
                                              value={row.duration}
                                              onChange={(e) =>
                                                update({ duration: e.target.value })
                                              }
                                              className={compactInputClass}
                                              placeholder={
                                                autoDuration != null
                                                  ? String(autoDuration)
                                                  : 'mins'
                                              }
                                              aria-label={`Duration ${subject.code}`}
                                            />
                                          </ConfigField>
                                        </div>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] p-4">
              <p className="text-sm font-semibold text-slate-900">
                Regular package fees
                <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                  Flat fee when a student applies as Regular (all papers; no
                  subject selection)
                </span>
              </p>
              {!allowsRegular ? (
                <p className="text-xs text-[var(--muted)]">
                  Regular is not enabled for this exam — package fee not
                  required.
                </p>
              ) : (
                <>
              <Input
                label="Default package fee"
                type="number"
                min={0}
                value={packageFee}
                onChange={(e) => setPackageFee(e.target.value)}
                placeholder="Used when no branch/section package fee is set"
              />
              <Input
                label="Duplicate hall ticket fee"
                type="number"
                min={0}
                value={duplicateHallTicketFee}
                onChange={(e) => setDuplicateHallTicketFee(e.target.value)}
                placeholder="Leave blank to use the default fee"
              />
              {packageScopes.length > 0 && (
                <>
                  <div className="flex flex-wrap items-end gap-2 rounded-[var(--radius)] bg-slate-50/60 px-3 py-2.5">
                    <div className="flex-1">
                      <label className="mb-1 block text-xs font-medium text-slate-700">
                        Fee for all packages (₹)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="1"
                        value={bulkPackageFee}
                        onChange={(e) => setBulkPackageFee(e.target.value)}
                        className="w-full rounded-[var(--radius)] border border-[var(--border)] px-2.5 py-1.5 text-sm"
                        placeholder="e.g. 1500"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      className="!px-3 !py-1.5 text-xs"
                      onClick={applyFeeToAllPackages}
                    >
                      Apply to all packages
                    </Button>
                    <p className="basis-full text-xs text-[var(--muted)]">
                      Fills every branch / section package fee — edit any of
                      them individually afterwards. Section fees override the
                      branch fee; the branch fee overrides the default.
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {packageScopes.map((scope) => {
                      const key = pkgKey(scope.branch, scope.section);
                      return (
                        <label
                          key={key}
                          className="flex min-w-0 flex-col gap-1.5 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 py-2.5 text-sm"
                        >
                          <span className="text-xs font-medium text-slate-700">
                            {scope.branch}
                            {scope.section ? (
                              <span className="text-[var(--muted)]">
                                {' '}
                                · Section {scope.section}
                              </span>
                            ) : (
                              <span className="text-[var(--muted)]">
                                {' '}
                                · whole branch
                              </span>
                            )}
                          </span>
                          <input
                            type="number"
                            min={0}
                            step="1"
                            value={packageFeeByScope[key] ?? ''}
                            onChange={(e) =>
                              setPackageFeeByScope((prev) => ({
                                ...prev,
                                [key]: e.target.value,
                              }))
                            }
                            className={compactInputClass}
                            placeholder="₹ (unset)"
                            aria-label={`Package fee ${scope.branch}${scope.section ? ` section ${scope.section}` : ''}`}
                          />
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
                </>
              )}
            </div>

            {allowsSupply ? (
              <div className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Supply fees by subject count
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      Enter fee for selecting 1 through{' '}
                      {supplyTierCount || 'N−1'} subject
                      {supplyTierCount === 1 ? '' : 's'}. If all{' '}
                      {maxSupplySubjectCount || 'N'} papers are selected, the
                      package fee applies.
                    </p>
                  </div>
                  {supplyTierCount > 0 && selectedBranches.length > 0 ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="!px-3 !py-1.5 text-xs"
                      onClick={applySupplyDefaultToAllBranches}
                    >
                      Apply to all branches
                    </Button>
                  ) : null}
                </div>
                {supplyTierCount < 1 ? (
                  <p className="text-xs text-[var(--muted)]">
                    Select papers above to generate supply fee tiers.
                  </p>
                ) : (
                  <>
                    <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)]">
                      <table className="w-full min-w-[320px] text-left text-sm">
                        <thead>
                          <tr className="border-b border-[var(--border)] bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                            <th className="px-3 py-2.5">Subjects selected</th>
                            <th className="px-3 py-2.5">Default fee (₹)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {supplyFeeByCount.map((value, index) => (
                            <tr
                              key={`supply-default-${index}`}
                              className="border-b border-[var(--border)] last:border-0"
                            >
                              <td className="px-3 py-2 font-medium text-slate-800">
                                {index + 1} subject{index === 0 ? '' : 's'}
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  min={0}
                                  step="1"
                                  value={value}
                                  onChange={(e) =>
                                    setSupplyFeeByCount((prev) => {
                                      const next = [...prev];
                                      next[index] = e.target.value;
                                      return next;
                                    })
                                  }
                                  className={compactInputClass}
                                  placeholder="0"
                                  aria-label={`Default supply fee for ${index + 1} subjects`}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {selectedBranches.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Per-branch overrides (optional)
                        </p>
                        <p className="text-xs text-[var(--muted)]">
                          Leave blank to use the default. Use “Apply to all
                          branches” to copy the default into every row, then
                          edit.
                        </p>
                        <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)]">
                          <table className="w-full min-w-[480px] text-left text-sm">
                            <thead>
                              <tr className="border-b border-[var(--border)] bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2.5">
                                  Branch
                                </th>
                                {Array.from(
                                  { length: supplyTierCount },
                                  (_, i) => (
                                    <th
                                      key={`h-${i}`}
                                      className="whitespace-nowrap px-3 py-2.5 text-right"
                                    >
                                      {i + 1} subj.
                                    </th>
                                  ),
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {selectedBranches.map((b) => {
                                const tiers =
                                  supplyFeeByBranch[b.name] ??
                                  Array.from(
                                    { length: supplyTierCount },
                                    () => '',
                                  );
                                return (
                                  <tr
                                    key={b.id}
                                    className="border-b border-[var(--border)] last:border-0"
                                  >
                                    <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium text-slate-800">
                                      {b.name}
                                    </td>
                                    {tiers.map((value, index) => (
                                      <td
                                        key={`${b.id}-supply-${index}`}
                                        className="px-2 py-1.5"
                                      >
                                        <input
                                          type="number"
                                          min={0}
                                          step="1"
                                          value={value}
                                          onChange={(e) =>
                                            setSupplyFeeByBranch((prev) => {
                                              const row = [
                                                ...(prev[b.name] ??
                                                  Array.from(
                                                    {
                                                      length: supplyTierCount,
                                                    },
                                                    () => '',
                                                  )),
                                              ];
                                              row[index] = e.target.value;
                                              return {
                                                ...prev,
                                                [b.name]: row,
                                              };
                                            })
                                          }
                                          className={`${compactInputClass} text-right`}
                                          placeholder="—"
                                          aria-label={`${b.name} supply fee for ${index + 1} subjects`}
                                        />
                                      </td>
                                    ))}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
            </>
          )}
          <p className="text-xs text-[var(--muted)]">
            {selectedCount} paper{selectedCount !== 1 ? 's' : ''} selected
            across {selectedBranches.length} branch
            {selectedBranches.length !== 1 ? 'es' : ''} — each student sees
            only their own branch and section&apos;s papers.
          </p>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Application start"
              type="date"
              value={applicationStartDate}
              onChange={(e) => setApplicationStartDate(e.target.value)}
            />
            <Input
              label="Application end"
              type="date"
              value={applicationEndDate}
              onChange={(e) => setApplicationEndDate(e.target.value)}
            />
            <Input
              label="Examination start"
              type="date"
              value={examinationStartDate}
              onChange={(e) => setExaminationStartDate(e.target.value)}
            />
            <Input
              label="Examination end"
              type="date"
              value={examinationEndDate}
              onChange={(e) => setExaminationEndDate(e.target.value)}
            />
            <Input
              label="Late fee start"
              type="date"
              value={lateFeeStartDate}
              onChange={(e) => setLateFeeStartDate(e.target.value)}
            />
          </div>

          <div
            id="late-fee-slabs"
            className="rounded-[var(--radius)] border border-[var(--border)] bg-slate-50/50 p-4 scroll-mt-24"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">Late fee slabs</p>
                <p className="text-xs text-[var(--muted)]">
                  Set calendar date ranges for each late-fee amount. Only the{' '}
                  <strong>last slab</strong> may leave &quot;To date&quot; empty —
                  that applies the amount until the application end date.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                className="!px-3 !py-1.5 text-xs"
                onClick={() =>
                  setSlabs((prev) => {
                    const next = prev.map((s, i) => {
                      if (i !== prev.length - 1 || s.toDate != null) return s;
                      // Close previous open-ended slab so a new last slab can be added.
                      return {
                        ...s,
                        toDate: s.fromDate || lateFeeStartDate || '',
                      };
                    });
                    const last = next[next.length - 1];
                    let nextFrom = lateFeeStartDate || '';
                    if (last?.toDate) {
                      nextFrom = nextDate(last.toDate) ?? nextFrom;
                    }
                    return [
                      ...next,
                      { fromDate: nextFrom, toDate: null, amount: 100 },
                    ];
                  })
                }
              >
                Add slab
              </Button>
            </div>
            <div className="space-y-2">
              {slabs.map((slab, idx) => {
                const isLast = idx === slabs.length - 1;
                return (
                  <div
                    key={idx}
                    className="grid gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-white p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
                  >
                    <label className="block min-w-0">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                        From date
                      </span>
                      <input
                        type="date"
                        value={slab.fromDate}
                        min={lateFeeStartDate || undefined}
                        onChange={(e) =>
                          setSlabs((rows) =>
                            rows.map((r, i) =>
                              i === idx
                                ? { ...r, fromDate: e.target.value }
                                : r,
                            ),
                          )
                        }
                        className={compactInputClass}
                      />
                    </label>
                    <label className="block min-w-0">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                        To date {isLast ? '(optional)' : ''}
                      </span>
                      <input
                        type="date"
                        value={slab.toDate ?? ''}
                        min={slab.fromDate || lateFeeStartDate || undefined}
                        max={applicationEndDate || undefined}
                        placeholder={isLast ? 'Until application end' : 'Required'}
                        onChange={(e) => {
                          const raw = e.target.value.trim();
                          setSlabs((rows) => {
                            const nextRows = rows.map((r, i) => {
                              if (i !== idx) return r;
                              if (!isLast) {
                                return { ...r, toDate: raw || '' };
                              }
                              return {
                                ...r,
                                toDate: raw === '' ? null : raw,
                              };
                            });

                            if (!isLast && raw) {
                              const nextFrom = nextDate(raw);
                              if (nextFrom && nextRows[idx + 1]) {
                                nextRows[idx + 1] = {
                                  ...nextRows[idx + 1],
                                  fromDate: nextFrom,
                                };
                              }
                            }

                            return nextRows;
                          });
                        }}
                        className={compactInputClass}
                      />
                    </label>
                    <label className="block min-w-0">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                        Amount (₹)
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={slab.amount}
                        onChange={(e) =>
                          setSlabs((rows) =>
                            rows.map((r, i) =>
                              i === idx
                                ? {
                                    ...r,
                                    amount: parseFloat(e.target.value) || 0,
                                  }
                                : r,
                            ),
                          )
                        }
                        className={compactInputClass}
                      />
                    </label>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="ghost"
                        className="!text-red-600"
                        onClick={() =>
                          setSlabs((rows) => {
                            const next = rows.filter((_, i) => i !== idx);
                            if (next.length === 0) return next;
                            if (next.length === 1) {
                              next[0] = { ...next[0], toDate: null };
                            }
                            return next;
                          })
                        }
                        disabled={slabs.length <= 1}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Instructions
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
              className={selectClass}
              placeholder="Optional instructions for students..."
            />
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3 text-sm">
          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-slate-50/60 p-4">
            <p className="font-semibold text-slate-900">{name || '—'}</p>
            <p className="mt-1 text-[var(--muted)]">
              {reg?.code ?? '—'} ·{' '}
              Enrollment types:{' '}
              {reviewTypes.map(examTypeLabel).join(' + ')} · {collegeName} / Programme:{' '}
              {selectedCourses.map((c) => c.name).join(', ') || courseName || '—'} / Batch: {selectedBatches.join(', ') || '—'} ·{' '}
              Years: {selectedYears.map((y) => `Y${y}`).join(', ') || '—'} ·{' '}
              Semesters: {selectedSemesters.map((s) => `S${s}`).join(', ') || '—'}
            </p>
            <div className="mt-2 space-y-1">
              <p className="font-medium text-slate-800">Branches & sections</p>
              {selectedBranches.length === 0 ? (
                <p className="text-[var(--muted)]">—</p>
              ) : (
                selectedBranches.map((b) => {
                  const secs = branchSections[b.id] ?? [];
                  return (
                    <p key={b.id} className="text-[var(--muted)]">
                      {b.name}
                      {secs.length === 0
                        ? ' — all sections'
                        : ` — ${secs.join(', ')}`}
                    </p>
                  );
                })
              )}
            </div>
            <p className="mt-2">
              Subjects: <strong>{selectedCount}</strong>
              {allowsRegular && packageFee
                ? ` · Regular package: ₹${packageFee}`
                : ''}
              {allowsSupply && supplyFeeByCount.some((t) => t.trim())
                ? ` · Supply tiers: ${supplyFeeByCount
                    .map((t, i) => `${i + 1}=₹${t || '—'}`)
                    .join(', ')}`
                : ''}
              {(() => {
                const n = packageScopes.filter(
                  (s) => (packageFeeByScope[pkgKey(s.branch, s.section)] ?? '').trim() !== '',
                ).length;
                return n > 0 ? ` · ${n} branch/section package fee${n !== 1 ? 's' : ''}` : '';
              })()}
            </p>
            <p className="mt-1 text-[var(--muted)]">
              App: {applicationStartDate || '—'} → {applicationEndDate || '—'}
            </p>
            <p className="text-[var(--muted)]">
              Exam: {examinationStartDate || '—'} → {examinationEndDate || '—'}
            </p>
            <p className="mt-1 text-[var(--muted)]">
              Late fee slabs: {slabs.length}
            </p>
          </div>
          {!initial && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={submitForApproval}
                onChange={(e) => setSubmitForApproval(e.target.checked)}
              />
              Submit for approval immediately
            </label>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      <div className="flex justify-between gap-3 border-t border-[var(--border)] pt-4">
        <div>
          {step > 1 && (
            <Button type="button" variant="secondary" onClick={goBack}>
              Back
            </Button>
          )}
        </div>
        <div className="flex gap-3">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {step < 4
              ? 'Next'
              : loading
                ? 'Saving...'
                : initial
                  ? 'Update examination'
                  : submitForApproval
                    ? 'Create & submit'
                    : 'Save draft'}
          </Button>
        </div>
      </div>
    </form>
  );
}
