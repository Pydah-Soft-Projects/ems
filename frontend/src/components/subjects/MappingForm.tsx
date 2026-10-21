'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Regulation, RegulationScope } from '@/types/regulation';
import {
  Subject,
  SubjectMappingEntry,
  CreateSubjectMappingInput,
  SubjectMappingAssignment,
  ReplaceScopeMappingInput,
} from '@/types/subject';
import { SdmsBranch, SdmsBranchYearSemesters } from '@/types/sdms';
import { api } from '@/lib/api';

const selectClass =
  'w-full rounded-[var(--radius)] border border-[var(--border)] bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]';

type MappingMode = 'scope' | 'subject';

interface MappingFormProps {
  regulations: Regulation[];
  /** Flat mapping rows — used to load siblings when editing a scope */
  allMappings?: SubjectMappingEntry[];
  initial?: SubjectMappingEntry | null;
  defaultRegulationId?: number;
  defaultMode?: MappingMode;
  onSubmit: (data: CreateSubjectMappingInput) => Promise<void>;
  onReplaceScope: (data: ReplaceScopeMappingInput) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

type SubjectRow = {
  key: string;
  subjectId: string;
  branchId: string;
  yearOfStudy: string;
  semester: string;
  sectionMode: 'all' | 'selected';
  selectedSections: string[];
};

function courseKey(collegeId: number, courseId: number) {
  return `${collegeId}:${courseId}`;
}

function batchKey(collegeId: number, courseId: number, batch: string) {
  return `${collegeId}:${courseId}:${batch}`;
}

function parseCourseKey(key: string) {
  const [collegeId, courseId] = key.split(':').map(Number);
  return { collegeId, courseId };
}

function parseBatchKey(key: string) {
  const parts = key.split(':');
  return {
    collegeId: Number(parts[0]),
    courseId: Number(parts[1]),
    batch: parts.slice(2).join(':'),
  };
}

function scopeSiblingKey(m: SubjectMappingEntry) {
  return [
    m.regulationId,
    m.collegeId,
    m.courseId,
    m.branchId,
    m.batch,
    m.yearOfStudy,
    m.semester,
    m.sectionKey ?? '*',
  ].join('|');
}

function getScopedColleges(scopes: RegulationScope[]) {
  const map = new Map<number, { id: number; name: string }>();
  for (const scope of scopes) {
    if (!map.has(scope.collegeId)) {
      map.set(scope.collegeId, { id: scope.collegeId, name: scope.collegeName });
    }
  }
  return Array.from(map.values());
}

function getScopedCourses(scopes: RegulationScope[], collegeId: number) {
  const map = new Map<number, { id: number; name: string }>();
  for (const scope of scopes) {
    if (scope.collegeId !== collegeId) continue;
    if (!map.has(scope.courseId)) {
      map.set(scope.courseId, { id: scope.courseId, name: scope.courseName });
    }
  }
  return Array.from(map.values());
}

function getScopedBatches(
  scopes: RegulationScope[],
  collegeId: number,
  courseId: number,
) {
  const batches = new Set<string>();
  for (const scope of scopes) {
    if (scope.collegeId === collegeId && scope.courseId === courseId) {
      batches.add(scope.batch);
    }
  }
  return Array.from(batches).sort((a, b) => b.localeCompare(a));
}

function newRowKey() {
  // crypto.randomUUID is only available in secure contexts (HTTPS / localhost).
  // Fall back for LAN HTTP access (e.g. http://192.168.x.x).
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `row-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function newSubjectRow(): SubjectRow {
  return {
    key: newRowKey(),
    subjectId: '',
    branchId: '',
    yearOfStudy: '',
    semester: '',
    sectionMode: 'all',
    selectedSections: [],
  };
}

export function MappingForm({
  regulations,
  allMappings = [],
  initial,
  defaultRegulationId,
  defaultMode = 'scope',
  onSubmit,
  onReplaceScope,
  onCancel,
  loading,
}: MappingFormProps) {
  const isEdit = !!initial;
  const [mode, setMode] = useState<MappingMode>(isEdit ? 'scope' : defaultMode);

  const [regulationId, setRegulationId] = useState('');
  const [collegeId, setCollegeId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [batch, setBatch] = useState('');
  const [yearOfStudy, setYearOfStudy] = useState('');
  const [semester, setSemester] = useState('');
  const [sectionMode, setSectionMode] = useState<'all' | 'selected'>('all');
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<number[]>([]);

  // Multi-select for subject-mode create (colleges/courses/batches)
  const [selectedCollegeIds, setSelectedCollegeIds] = useState<number[]>([]);
  const [selectedCourseKeys, setSelectedCourseKeys] = useState<string[]>([]);
  const [selectedBatchKeys, setSelectedBatchKeys] = useState<string[]>([]);
  const [subjectRows, setSubjectRows] = useState<SubjectRow[]>([newSubjectRow()]);

  const [branches, setBranches] = useState<SdmsBranch[]>([]);
  const [branchesByCourse, setBranchesByCourse] = useState<
    Record<string, SdmsBranch[]>
  >({});
  const [yearSem, setYearSem] = useState<SdmsBranchYearSemesters | null>(null);
  const [yearSemByBranch, setYearSemByBranch] = useState<
    Record<number, SdmsBranchYearSemesters>
  >({});
  const [availableSubjects, setAvailableSubjects] = useState<Subject[]>([]);
  const [previous, setPrevious] = useState<ReplaceScopeMappingInput['previous']>();
  const [error, setError] = useState('');
  const [loadingMeta, setLoadingMeta] = useState(false);

  const selectedRegulation = regulations.find(
    (r) => r.id === parseInt(regulationId, 10),
  );
  const scopes = selectedRegulation?.scopes ?? [];
  const scopedColleges = useMemo(() => getScopedColleges(scopes), [scopes]);

  useEffect(() => {
    if (scopedColleges.length === 1 && !collegeId) {
      setCollegeId(String(scopedColleges[0].id));
    }
  }, [scopedColleges, collegeId]);

  useEffect(() => {
    if (scopedColleges.length === 1 && selectedCollegeIds.length === 0) {
      setSelectedCollegeIds([scopedColleges[0].id]);
    }
  }, [scopedColleges, selectedCollegeIds.length]);

  const scopedCourses = useMemo(
    () =>
      collegeId ? getScopedCourses(scopes, parseInt(collegeId, 10)) : [],
    [scopes, collegeId],
  );

  useEffect(() => {
    if (scopedCourses.length === 1 && !courseId) {
      setCourseId(String(scopedCourses[0].id));
    }
  }, [scopedCourses, courseId]);

  const scopedBatches = useMemo(
    () =>
      collegeId && courseId
        ? getScopedBatches(
            scopes,
            parseInt(collegeId, 10),
            parseInt(courseId, 10),
          )
        : [],
    [scopes, collegeId, courseId],
  );

  const multiCourses = useMemo(() => {
    const map = new Map<
      string,
      { key: string; collegeId: number; collegeName: string; courseId: number; courseName: string }
    >();
    for (const scope of scopes) {
      if (!selectedCollegeIds.includes(scope.collegeId)) continue;
      const key = courseKey(scope.collegeId, scope.courseId);
      if (!map.has(key)) {
        map.set(key, {
          key,
          collegeId: scope.collegeId,
          collegeName: scope.collegeName,
          courseId: scope.courseId,
          courseName: scope.courseName,
        });
      }
    }
    return Array.from(map.values());
  }, [scopes, selectedCollegeIds]);

  useEffect(() => {
    if (multiCourses.length === 1 && selectedCourseKeys.length === 0) {
      setSelectedCourseKeys([multiCourses[0].key]);
    }
  }, [multiCourses, selectedCourseKeys.length]);

  const multiBatches = useMemo(() => {
    const options: { key: string; label: string; batch: string }[] = [];
    const seen = new Set<string>();
    for (const scope of scopes) {
      const key = courseKey(scope.collegeId, scope.courseId);
      if (!selectedCourseKeys.includes(key)) continue;
      const bKey = batchKey(scope.collegeId, scope.courseId, scope.batch);
      if (seen.has(bKey)) continue;
      seen.add(bKey);
      options.push({
        key: bKey,
        batch: scope.batch,
        label: `${scope.collegeName} → ${scope.courseName} → ${scope.batch}`,
      });
    }
    return options;
  }, [scopes, selectedCourseKeys]);

  const allBranches = useMemo(() => {
    const list: (SdmsBranch & {
      courseKey: string;
      collegeName: string;
      courseName: string;
    })[] = [];
    for (const course of multiCourses) {
      if (!selectedCourseKeys.includes(course.key)) continue;
      for (const branch of branchesByCourse[course.key] ?? []) {
        list.push({
          ...branch,
          courseKey: course.key,
          collegeName: course.collegeName,
          courseName: course.courseName,
        });
      }
    }
    return list;
  }, [multiCourses, selectedCourseKeys, branchesByCourse]);

  // Init from edit / defaults
  useEffect(() => {
    if (initial) {
      setMode('scope');
      setRegulationId(String(initial.regulationId));
      setCollegeId(String(initial.collegeId));
      setCourseId(String(initial.courseId));
      setBranchId(String(initial.branchId));
      setBatch(initial.batch);
      setYearOfStudy(String(initial.yearOfStudy));
      setSemester(String(initial.semester));
      setSectionMode(initial.sectionMode ?? 'all');
      setSelectedSections(initial.sections ?? []);
      setPrevious({
        collegeId: initial.collegeId,
        courseId: initial.courseId,
        branchId: initial.branchId,
        batch: initial.batch,
        yearOfStudy: initial.yearOfStudy,
        semester: initial.semester,
        sectionKey: initial.sectionKey ?? '*',
      });

      const key = scopeSiblingKey(initial);
      const siblings = allMappings.filter((m) => scopeSiblingKey(m) === key);
      setSelectedSubjectIds(
        siblings.length > 0
          ? siblings.map((m) => m.subjectId)
          : [initial.subjectId],
      );
    } else {
      setMode(defaultMode);
      setRegulationId(defaultRegulationId ? String(defaultRegulationId) : '');
      setCollegeId('');
      setCourseId('');
      setBranchId('');
      setBatch('');
      setYearOfStudy('');
      setSemester('');
      setSectionMode('all');
      setSelectedSections([]);
      setSelectedSubjectIds([]);
      setPrevious(undefined);
      setSelectedCollegeIds([]);
      setSelectedCourseKeys([]);
      setSelectedBatchKeys([]);
      setSubjectRows([newSubjectRow()]);
    }
    setError('');
  }, [initial, defaultRegulationId, defaultMode, allMappings]);

  useEffect(() => {
    if (!regulationId) {
      setAvailableSubjects([]);
      return;
    }
    api
      .getSubjects(parseInt(regulationId, 10))
      .then(setAvailableSubjects)
      .catch(() => setAvailableSubjects([]));
  }, [regulationId]);

  // Scope mode: load branches for selected course
  useEffect(() => {
    if (mode !== 'scope' || !courseId) {
      if (mode === 'scope') setBranches([]);
      return;
    }
    setLoadingMeta(true);
    api
      .getSdmsBranches(parseInt(courseId, 10))
      .then(setBranches)
      .catch(() => setBranches([]))
      .finally(() => setLoadingMeta(false));
  }, [mode, courseId]);

  // Scope mode: year/sem/sections for branch
  useEffect(() => {
    if (mode !== 'scope' || !branchId) {
      if (mode === 'scope') setYearSem(null);
      return;
    }
    api
      .getSdmsBranchYearSemesters(parseInt(branchId, 10))
      .then((data) => {
        setYearSem(data);
        if (!data.sections?.enabled) {
          setSectionMode('all');
          setSelectedSections([]);
        }
      })
      .catch(() => setYearSem(null));
  }, [mode, branchId]);

  // Subject mode: load branches for selected courses
  useEffect(() => {
    if (mode !== 'subject' || selectedCourseKeys.length === 0) return;
    let cancelled = false;
    Promise.all(
      selectedCourseKeys.map(async (key) => {
        const { courseId: id } = parseCourseKey(key);
        const data = await api.getSdmsBranches(id);
        return [key, data] as const;
      }),
    )
      .then((entries) => {
        if (cancelled) return;
        const next: Record<string, SdmsBranch[]> = {};
        for (const [key, data] of entries) next[key] = data;
        setBranchesByCourse(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [mode, selectedCourseKeys]);

  // Subject mode: year sem per branch in rows
  useEffect(() => {
    if (mode !== 'subject') return;
    const ids = [
      ...new Set(
        subjectRows
          .map((r) => parseInt(r.branchId, 10))
          .filter((id) => id > 0 && !yearSemByBranch[id]),
      ),
    ];
    if (ids.length === 0) return;
    let cancelled = false;
    Promise.all(
      ids.map(async (id) => [id, await api.getSdmsBranchYearSemesters(id)] as const),
    )
      .then((entries) => {
        if (cancelled) return;
        setYearSemByBranch((prev) => {
          const next = { ...prev };
          for (const [id, data] of entries) next[id] = data;
          return next;
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [mode, subjectRows, yearSemByBranch]);

  function collegeName() {
    return (
      scopedColleges.find((c) => c.id === parseInt(collegeId, 10))?.name ?? ''
    );
  }
  function courseName() {
    return (
      scopedCourses.find((c) => c.id === parseInt(courseId, 10))?.name ?? ''
    );
  }
  function branchName() {
    return branches.find((b) => b.id === parseInt(branchId, 10))?.name ?? '';
  }

  function toggleSubjectId(id: number) {
    setSelectedSubjectIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!regulationId) {
      setError('Regulation is required.');
      return;
    }

    if (mode === 'scope') {
      if (
        !collegeId ||
        !courseId ||
        !branchId ||
        !batch ||
        !yearOfStudy ||
        !semester
      ) {
        setError('Select college, programme, branch, batch, year, and semester.');
        return;
      }
      if (selectedSubjectIds.length === 0) {
        setError('Select at least one subject for this academic scope.');
        return;
      }
      const hasSections = yearSem?.sections?.enabled === true;
      const modeSections =
        hasSections && sectionMode === 'selected' && selectedSections.length > 0
          ? ('selected' as const)
          : ('all' as const);

      try {
        await onReplaceScope({
          regulationId: parseInt(regulationId, 10),
          collegeId: parseInt(collegeId, 10),
          collegeName: collegeName() || (initial?.collegeName ?? ''),
          courseId: parseInt(courseId, 10),
          courseName: courseName() || (initial?.courseName ?? ''),
          branchId: parseInt(branchId, 10),
          branchName: branchName() || (initial?.branchName ?? ''),
          batch,
          yearOfStudy: parseInt(yearOfStudy, 10),
          semester: parseInt(semester, 10),
          sectionMode: modeSections,
          sections: modeSections === 'selected' ? selectedSections : undefined,
          subjectIds: selectedSubjectIds,
          previous: isEdit ? previous : undefined,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save mapping');
      }
      return;
    }

    // Subject-centric create
    if (selectedCollegeIds.length === 0 || selectedCourseKeys.length === 0) {
      setError('Select colleges and programmes from the regulation scope.');
      return;
    }
    if (selectedBatchKeys.length === 0) {
      setError('Select at least one batch.');
      return;
    }

    const assignments: SubjectMappingAssignment[] = [];
    for (const row of subjectRows) {
      const subject = availableSubjects.find(
        (s) => s.id === parseInt(row.subjectId, 10),
      );
      const branch = allBranches.find((b) => b.id === parseInt(row.branchId, 10));
      const course = branch
        ? multiCourses.find((c) => c.key === branch.courseKey)
        : undefined;
      const year = parseInt(row.yearOfStudy, 10);
      const sem = parseInt(row.semester, 10);
      if (!subject || !branch || !course || isNaN(year) || isNaN(sem)) {
        setError('Complete every subject assignment row.');
        return;
      }
      const rowSectionMode =
        row.sectionMode === 'selected' && row.selectedSections.length > 0
          ? 'selected'
          : 'all';
      const batches = selectedBatchKeys
        .map(parseBatchKey)
        .filter(
          (b) =>
            b.collegeId === course.collegeId && b.courseId === course.courseId,
        );
      if (batches.length === 0) {
        setError(`No batch selected for ${branch.name}.`);
        return;
      }
      for (const b of batches) {
        assignments.push({
          subjectId: subject.id,
          collegeId: course.collegeId,
          collegeName: course.collegeName,
          courseId: course.courseId,
          courseName: course.courseName,
          branchId: branch.id,
          branchName: branch.name,
          batch: b.batch,
          yearOfStudy: year,
          semester: sem,
          sectionMode: rowSectionMode,
          sections:
            rowSectionMode === 'selected' ? row.selectedSections : undefined,
        });
      }
    }

    try {
      await onSubmit({
        regulationId: parseInt(regulationId, 10),
        assignments,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save mapping');
    }
  }

  const selectedYear = yearSem?.years.find(
    (y) => y.yearOfStudy === parseInt(yearOfStudy, 10),
  );
  const hasSections = yearSem?.sections?.enabled === true;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {!isEdit && (
        <div className="inline-flex rounded-[var(--radius)] border border-[var(--border)] bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => setMode('scope')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              mode === 'scope'
                ? 'bg-[var(--primary)] text-white'
                : 'text-slate-600'
            }`}
          >
            Scope → subjects
          </button>
          <button
            type="button"
            onClick={() => setMode('subject')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              mode === 'subject'
                ? 'bg-[var(--primary)] text-white'
                : 'text-slate-600'
            }`}
          >
            Subject → scopes
          </button>
        </div>
      )}

      <p className="text-xs text-[var(--muted)]">
        Both modes write the same mapping table — updates in either view stay in
        sync.
      </p>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          Regulation
        </label>
        <select
          value={regulationId}
          onChange={(e) => {
            setRegulationId(e.target.value);
            setCollegeId('');
            setCourseId('');
            setBranchId('');
            setBatch('');
            setSelectedSubjectIds([]);
            setSelectedCollegeIds([]);
            setSelectedCourseKeys([]);
            setSelectedBatchKeys([]);
          }}
          className={selectClass}
          required
        >
          <option value="">Select regulation</option>
          {regulations.map((reg) => (
            <option key={reg.id} value={reg.id}>
              {reg.code} — {reg.name}
            </option>
          ))}
        </select>
      </div>

      {mode === 'scope' ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                College
              </label>
              <select
                value={collegeId}
                onChange={(e) => {
                  setCollegeId(e.target.value);
                  setCourseId('');
                  setBranchId('');
                  setBatch('');
                  setYearOfStudy('');
                  setSemester('');
                }}
                className={selectClass}
                required
                disabled={!regulationId}
              >
                <option value="">Select college</option>
                {scopedColleges.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Programme
              </label>
              <select
                value={courseId}
                onChange={(e) => {
                  setCourseId(e.target.value);
                  setBranchId('');
                  setBatch('');
                  setYearOfStudy('');
                  setSemester('');
                }}
                className={selectClass}
                required
                disabled={!collegeId}
              >
                <option value="">Select programme</option>
                {scopedCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Branch
              </label>
              <select
                value={branchId}
                onChange={(e) => {
                  setBranchId(e.target.value);
                  setYearOfStudy('');
                  setSemester('');
                  setSectionMode('all');
                  setSelectedSections([]);
                }}
                className={selectClass}
                required
                disabled={!courseId || loadingMeta}
              >
                <option value="">Select branch</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Batch
              </label>
              <select
                value={batch}
                onChange={(e) => setBatch(e.target.value)}
                className={selectClass}
                required
                disabled={!courseId}
              >
                <option value="">Select batch</option>
                {scopedBatches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Program year
              </label>
              <select
                value={yearOfStudy}
                onChange={(e) => {
                  setYearOfStudy(e.target.value);
                  setSemester('');
                }}
                className={selectClass}
                required
                disabled={!branchId}
              >
                <option value="">Select year</option>
                {yearSem?.years.map((y) => (
                  <option key={y.yearOfStudy} value={y.yearOfStudy}>
                    {y.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Semester
              </label>
              <select
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                className={selectClass}
                required
                disabled={!yearOfStudy}
              >
                <option value="">Select semester</option>
                {selectedYear?.semesters.map((s) => (
                  <option key={s.semesterNumber} value={s.semesterNumber}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Sections
            </label>
            {!branchId ? (
              <p className="text-xs text-[var(--muted)]">Select a branch first.</p>
            ) : !hasSections ? (
              <div className="rounded-lg border border-dashed border-[var(--border)] bg-slate-50 px-3 py-2 text-sm">
                All sections (default) — this branch has no section split.
              </div>
            ) : (
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={sectionMode === 'all'}
                    onChange={() => {
                      setSectionMode('all');
                      setSelectedSections([]);
                    }}
                  />
                  All sections
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={sectionMode === 'selected'}
                    onChange={() => setSectionMode('selected')}
                  />
                  Selected sections
                </label>
                {sectionMode === 'selected' && (
                  <div className="flex flex-wrap gap-2">
                    {yearSem?.sections.items.map((s) => (
                      <label
                        key={s.name}
                        className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={selectedSections.includes(s.name)}
                          onChange={(e) =>
                            setSelectedSections((prev) =>
                              e.target.checked
                                ? [...prev, s.name]
                                : prev.filter((x) => x !== s.name),
                            )
                          }
                        />
                        {s.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Subjects for this scope
            </label>
            {!regulationId ? (
              <p className="text-sm text-[var(--muted)]">Select a regulation.</p>
            ) : availableSubjects.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                Create subjects under this regulation first.
              </p>
            ) : (
              <div className="max-h-52 space-y-1 overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] p-3">
                {availableSubjects.map((subject) => (
                  <label
                    key={subject.id}
                    className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-1.5 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSubjectIds.includes(subject.id)}
                      onChange={() => toggleSubjectId(subject.id)}
                      className="mt-0.5"
                    />
                    <span className="text-sm">
                      <span className="font-medium">{subject.code}</span>
                      <span className="text-[var(--muted)]">
                        {' '}
                        — {subject.name}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <section>
            <p className="text-sm font-semibold">1. Colleges</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {scopedColleges.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selectedCollegeIds.includes(c.id)}
                    onChange={(e) =>
                      setSelectedCollegeIds((prev) =>
                        e.target.checked
                          ? [...prev, c.id]
                          : prev.filter((id) => id !== c.id),
                      )
                    }
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </section>
          {selectedCollegeIds.length > 0 && (
            <section>
              <p className="text-sm font-semibold">2. Programmes</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {multiCourses.map((c) => (
                  <label
                    key={c.key}
                    className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCourseKeys.includes(c.key)}
                      onChange={(e) =>
                        setSelectedCourseKeys((prev) =>
                          e.target.checked
                            ? [...prev, c.key]
                            : prev.filter((k) => k !== c.key),
                        )
                      }
                    />
                    {c.collegeName} → {c.courseName}
                  </label>
                ))}
              </div>
            </section>
          )}
          {selectedCourseKeys.length > 0 && (
            <section>
              <p className="text-sm font-semibold">3. Batches</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {multiBatches.map((b) => (
                  <label
                    key={b.key}
                    className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedBatchKeys.includes(b.key)}
                      onChange={(e) =>
                        setSelectedBatchKeys((prev) =>
                          e.target.checked
                            ? [...prev, b.key]
                            : prev.filter((k) => k !== b.key),
                        )
                      }
                    />
                    {b.label}
                  </label>
                ))}
              </div>
            </section>
          )}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">4. Subject assignments</p>
              <Button
                type="button"
                variant="secondary"
                className="!px-3 !py-1.5 text-xs"
                onClick={() =>
                  setSubjectRows((rows) => [...rows, newSubjectRow()])
                }
              >
                Add row
              </Button>
            </div>
            <div className="space-y-3">
              {subjectRows.map((row) => {
                const ys = yearSemByBranch[parseInt(row.branchId, 10)];
                const year = ys?.years.find(
                  (y) => y.yearOfStudy === parseInt(row.yearOfStudy, 10),
                );
                const rowHasSections = ys?.sections?.enabled === true;
                return (
                  <div
                    key={row.key}
                    className="space-y-2 rounded-[var(--radius)] border p-3"
                  >
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <select
                        value={row.subjectId}
                        onChange={(e) =>
                          setSubjectRows((rows) =>
                            rows.map((r) =>
                              r.key === row.key
                                ? { ...r, subjectId: e.target.value }
                                : r,
                            ),
                          )
                        }
                        className={selectClass}
                        required
                      >
                        <option value="">Subject</option>
                        {availableSubjects.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.code} — {s.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={row.branchId}
                        onChange={(e) =>
                          setSubjectRows((rows) =>
                            rows.map((r) =>
                              r.key === row.key
                                ? {
                                    ...r,
                                    branchId: e.target.value,
                                    yearOfStudy: '',
                                    semester: '',
                                    sectionMode: 'all',
                                    selectedSections: [],
                                  }
                                : r,
                            ),
                          )
                        }
                        className={selectClass}
                        required
                      >
                        <option value="">Branch</option>
                        {allBranches.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.collegeName} → {b.courseName} → {b.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={row.yearOfStudy}
                        onChange={(e) =>
                          setSubjectRows((rows) =>
                            rows.map((r) =>
                              r.key === row.key
                                ? {
                                    ...r,
                                    yearOfStudy: e.target.value,
                                    semester: '',
                                  }
                                : r,
                            ),
                          )
                        }
                        className={selectClass}
                        required
                      >
                        <option value="">Year</option>
                        {ys?.years.map((y) => (
                          <option key={y.yearOfStudy} value={y.yearOfStudy}>
                            {y.label}
                          </option>
                        ))}
                      </select>
                      <select
                        value={row.semester}
                        onChange={(e) =>
                          setSubjectRows((rows) =>
                            rows.map((r) =>
                              r.key === row.key
                                ? { ...r, semester: e.target.value }
                                : r,
                            ),
                          )
                        }
                        className={selectClass}
                        required
                      >
                        <option value="">Sem</option>
                        {year?.semesters.map((s) => (
                          <option
                            key={s.semesterNumber}
                            value={s.semesterNumber}
                          >
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {row.branchId && (
                      <div className="text-xs">
                        {!rowHasSections ? (
                          <span className="text-[var(--muted)]">
                            Sections: All (default)
                          </span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="inline-flex items-center gap-1">
                              <input
                                type="radio"
                                checked={row.sectionMode === 'all'}
                                onChange={() =>
                                  setSubjectRows((rows) =>
                                    rows.map((r) =>
                                      r.key === row.key
                                        ? {
                                            ...r,
                                            sectionMode: 'all',
                                            selectedSections: [],
                                          }
                                        : r,
                                    ),
                                  )
                                }
                              />
                              All
                            </label>
                            <label className="inline-flex items-center gap-1">
                              <input
                                type="radio"
                                checked={row.sectionMode === 'selected'}
                                onChange={() =>
                                  setSubjectRows((rows) =>
                                    rows.map((r) =>
                                      r.key === row.key
                                        ? { ...r, sectionMode: 'selected' }
                                        : r,
                                    ),
                                  )
                                }
                              />
                              Selected
                            </label>
                            {row.sectionMode === 'selected' &&
                              ys?.sections.items.map((s) => (
                                <label
                                  key={s.name}
                                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5"
                                >
                                  <input
                                    type="checkbox"
                                    checked={row.selectedSections.includes(
                                      s.name,
                                    )}
                                    onChange={(e) =>
                                      setSubjectRows((rows) =>
                                        rows.map((r) =>
                                          r.key === row.key
                                            ? {
                                                ...r,
                                                selectedSections: e.target
                                                  .checked
                                                  ? [
                                                      ...r.selectedSections,
                                                      s.name,
                                                    ]
                                                  : r.selectedSections.filter(
                                                      (x) => x !== s.name,
                                                    ),
                                              }
                                            : r,
                                        ),
                                      )
                                    }
                                  />
                                  {s.name}
                                </label>
                              ))}
                          </div>
                        )}
                      </div>
                    )}
                    {subjectRows.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="!px-2 !py-1 text-xs !text-red-600"
                        onClick={() =>
                          setSubjectRows((rows) =>
                            rows.filter((r) => r.key !== row.key),
                          )
                        }
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      {error && (
        <div className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-3 border-t border-[var(--border)] pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading
            ? 'Saving...'
            : isEdit
              ? 'Update mapping'
              : 'Save mappings'}
        </Button>
      </div>
    </form>
  );
}
