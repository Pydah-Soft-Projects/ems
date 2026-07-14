'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Regulation, RegulationScope } from '@/types/regulation';
import {
  Exam,
  CreateExamInput,
  ExamType,
  LateFeeSlabInput,
} from '@/types/exam';
import { Subject, SubjectMappingEntry } from '@/types/subject';
import { SdmsBranch, SdmsBranchYearSemesters, SdmsSection } from '@/types/sdms';
import { api } from '@/lib/api';

const selectClass =
  'w-full rounded-[var(--radius)] border border-[var(--border)] bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]';

const ALL_EXAM_TYPES: { value: ExamType; label: string }[] = [
  { value: 'regular', label: 'Regular' },
  { value: 'supply', label: 'Supply' },
  { value: 'improvement', label: 'Improvement' },
  { value: 'special_supply', label: 'Special supply' },
];

const DEFAULT_CREATE_TYPES: ExamType[] = ['regular', 'supply'];

interface ExamFormProps {
  regulations: Regulation[];
  initial?: Exam | null;
  defaultRegulationId?: number;
  onSubmit: (data: CreateExamInput) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

type Step = 1 | 2 | 3 | 4;

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
  onSubmit,
  onCancel,
  loading,
}: ExamFormProps) {
  const isEdit = !!initial;

  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState('');
  /** Legacy single type — used when editing */
  const [type, setType] = useState<ExamType>('regular');
  /** Multi-type for create */
  const [types, setTypes] = useState<ExamType[]>(DEFAULT_CREATE_TYPES);
  const [regulationId, setRegulationId] = useState('');
  const [collegeId, setCollegeId] = useState('');
  const [collegeName, setCollegeName] = useState('');
  const [courseId, setCourseId] = useState('');
  const [courseName, setCourseName] = useState('');
  const [selectedBranchIds, setSelectedBranchIds] = useState<number[]>([]);
  /** Selected section names per branch; empty array = all sections */
  const [branchSections, setBranchSections] = useState<Record<number, string[]>>(
    {},
  );
  const [sectionsByBranch, setSectionsByBranch] = useState<
    Record<number, SdmsSection[]>
  >({});
  const [batch, setBatch] = useState('');
  const [yearOfStudy, setYearOfStudy] = useState('');
  const [semester, setSemester] = useState('');

  const [branches, setBranches] = useState<SdmsBranch[]>([]);
  const [yearSem, setYearSem] = useState<SdmsBranchYearSemesters | null>(null);
  const [mappedEntries, setMappedEntries] = useState<SubjectMappingEntry[]>([]);
  const [selectedFees, setSelectedFees] = useState<
    Record<number, { selected: boolean; fee: string; examDate: string }>
  >({});
  const [packageFee, setPackageFee] = useState('');

  const [applicationStartDate, setApplicationStartDate] = useState('');
  const [applicationEndDate, setApplicationEndDate] = useState('');
  const [examinationStartDate, setExaminationStartDate] = useState('');
  const [examinationEndDate, setExaminationEndDate] = useState('');
  const [lateFeeStartDate, setLateFeeStartDate] = useState('');
  const [slabs, setSlabs] = useState<LateFeeSlabInput[]>([
    { fromDay: 1, toDay: 3, amount: 100 },
  ]);
  const [instructions, setInstructions] = useState('');
  const [submitForApproval, setSubmitForApproval] = useState(false);
  const [error, setError] = useState('');
  const [loadingScope, setLoadingScope] = useState(false);

  const reg = regulations.find((r) => r.id === parseInt(regulationId, 10));
  const scopes = reg?.scopes ?? [];
  const colleges = useMemo(() => getScopedColleges(scopes), [scopes]);
  const courses = useMemo(
    () =>
      collegeId ? getScopedCourses(scopes, parseInt(collegeId, 10)) : [],
    [scopes, collegeId],
  );
  const batches = useMemo(
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

  const selectedBranches = useMemo(
    () => branches.filter((b) => selectedBranchIds.includes(b.id)),
    [branches, selectedBranchIds],
  );

  const firstBranchId = selectedBranchIds[0] ?? null;

  const mappedSubjects = useMemo(() => {
    const byId = new Map<number, Subject>();
    for (const entry of mappedEntries) {
      if (entry.subject && !byId.has(entry.subject.id)) {
        byId.set(entry.subject.id, entry.subject);
      }
    }
    return Array.from(byId.values()).sort((a, b) =>
      a.code.localeCompare(b.code),
    );
  }, [mappedEntries]);

  useEffect(() => {
    if (initial) {
      setName(initial.name);
      setType(initial.type);
      setTypes(
        initial.allowedTypes?.length
          ? [...initial.allowedTypes]
          : [initial.type],
      );
      setRegulationId(String(initial.regulationId));
      setCollegeName(initial.college ?? '');
      setCourseName(initial.course);
      setBatch(initial.batch);
      setYearOfStudy(String(initial.yearOfStudy ?? ''));
      setSemester(String(initial.semester));
      setPackageFee(
        initial.packageFee != null ? String(initial.packageFee) : '',
      );
      setApplicationStartDate(initial.applicationStartDate ?? '');
      setApplicationEndDate(initial.applicationEndDate ?? '');
      setExaminationStartDate(initial.examinationStartDate ?? '');
      setExaminationEndDate(initial.examinationEndDate ?? '');
      setLateFeeStartDate(initial.lateFeeStartDate ?? '');
      setInstructions(initial.instructions ?? '');
      setSlabs(
        initial.lateFeeSlabs?.length
          ? initial.lateFeeSlabs.map((s) => ({
              fromDay: Number(s.fromDay),
              toDay: Number(s.toDay),
              amount: Number(s.amount),
            }))
          : [{ fromDay: 1, toDay: 3, amount: 100 }],
      );
      const fees: Record<
        number,
        { selected: boolean; fee: string; examDate: string }
      > = {};
      for (const es of initial.examSubjects ?? []) {
        fees[es.subjectId] = {
          selected: true,
          fee: String(es.fee),
          examDate: es.examDate ?? '',
        };
      }
      setSelectedFees(fees);
      setSelectedBranchIds([]);
      setBranchSections({});
      setStep(1);

      const regulation = regulations.find((r) => r.id === initial.regulationId);
      const scope = regulation?.scopes?.find(
        (s) =>
          s.courseName === initial.course &&
          (!initial.college || s.collegeName === initial.college),
      );
      if (scope) {
        setCollegeId(String(scope.collegeId));
        setCollegeName(scope.collegeName);
        setCourseId(String(scope.courseId));
      }
    } else {
      setName('');
      setType('regular');
      setTypes(DEFAULT_CREATE_TYPES);
      setRegulationId(defaultRegulationId ? String(defaultRegulationId) : '');
      setCollegeId('');
      setCollegeName('');
      setCourseId('');
      setCourseName('');
      setSelectedBranchIds([]);
      setBranchSections({});
      setSectionsByBranch({});
      setBatch('');
      setYearOfStudy('');
      setSemester('');
      setYearSem(null);
      setSelectedFees({});
      setPackageFee('');
      setApplicationStartDate('');
      setApplicationEndDate('');
      setExaminationStartDate('');
      setExaminationEndDate('');
      setLateFeeStartDate('');
      setSlabs([{ fromDay: 1, toDay: 3, amount: 100 }]);
      setInstructions('');
      setSubmitForApproval(false);
      setStep(1);
    }
    setError('');
  }, [initial, defaultRegulationId, regulations]);

  useEffect(() => {
    if (!courseId) {
      setBranches([]);
      return;
    }
    api
      .getSdmsBranches(parseInt(courseId, 10))
      .then((data) => {
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
      .catch(() => setBranches([]));
  }, [courseId, initial]);

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
    if (!batch || selectedBranchIds.length === 0) {
      setSectionsByBranch({});
      return;
    }
    let cancelled = false;
    Promise.all(
      selectedBranchIds.map(async (id) => {
        try {
          const sections = await api.getSdmsBranchSections(id, batch);
          return [id, sections] as const;
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
  }, [selectedBranchIds, batch]);

  useEffect(() => {
    if (
      !regulationId ||
      !courseName ||
      selectedBranches.length === 0 ||
      !batch ||
      !yearOfStudy ||
      !semester
    ) {
      setMappedEntries([]);
      return;
    }
    let cancelled = false;
    setLoadingScope(true);
    Promise.all(
      selectedBranches.map((b) =>
        api.getSubjectMappings({
          regulationId: parseInt(regulationId, 10),
          course: courseName,
          branch: b.name,
          batch,
          yearOfStudy: parseInt(yearOfStudy, 10),
          semester: parseInt(semester, 10),
        }),
      ),
    )
      .then((results) => {
        if (cancelled) return;
        if (results.length === 0) {
          setMappedEntries([]);
          return;
        }
        const idSets = results.map(
          (entries) =>
            new Set(
              entries
                .filter((e) => e.subject)
                .map((e) => e.subject!.id),
            ),
        );
        let intersection = idSets[0];
        for (let i = 1; i < idSets.length; i++) {
          intersection = new Set(
            [...intersection].filter((id) => idSets[i].has(id)),
          );
        }
        const byId = new Map<number, SubjectMappingEntry>();
        for (const entries of results) {
          for (const e of entries) {
            if (
              e.subject &&
              intersection.has(e.subject.id) &&
              !byId.has(e.subject.id)
            ) {
              byId.set(e.subject.id, e);
            }
          }
        }
        const intersected = Array.from(byId.values());
        setMappedEntries(intersected);
        setSelectedFees((prev) => {
          const next = { ...prev };
          for (const e of intersected) {
            if (e.subject && next[e.subject.id] === undefined) {
              next[e.subject.id] = {
                selected: false,
                fee: '180',
                examDate: '',
              };
            }
          }
          return next;
        });
      })
      .catch(() => {
        if (!cancelled) setMappedEntries([]);
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
    batch,
    yearOfStudy,
    semester,
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
          setYearOfStudy('');
          setSemester('');
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

  function resetDownstreamFromRegulation() {
    setCollegeId('');
    setCollegeName('');
    setCourseId('');
    setCourseName('');
    setSelectedBranchIds([]);
    setBranchSections({});
    setBatch('');
    setYearOfStudy('');
    setSemester('');
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
        !courseName ||
        selectedBranchIds.length === 0 ||
        !batch
      ) {
        setError(
          'Name, regulation, college, programme, at least one branch, and batch are required.',
        );
        return false;
      }
      const year = parseInt(yearOfStudy, 10);
      const sem = parseInt(semester, 10);
      if (isNaN(year) || year < 1 || isNaN(sem) || sem < 1) {
        setError(
          'Select program year and semester from the branch configuration.',
        );
        return false;
      }
    }
    if (current === 2) {
      const selected = Object.entries(selectedFees).filter(
        ([, v]) => v.selected,
      );
      if (selected.length === 0) {
        setError('Select at least one mapped subject and set fees.');
        return false;
      }
      for (const [, v] of selected) {
        const fee = parseFloat(v.fee);
        if (isNaN(fee) || fee < 0) {
          setError('Subject fees must be valid non-negative numbers.');
          return false;
        }
        if (!v.examDate) {
          setError('Set an exam date for every selected subject.');
          return false;
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

    const subjects = Object.entries(selectedFees)
      .filter(([, v]) => v.selected)
      .map(([id, v]) => ({
        subjectId: parseInt(id, 10),
        fee: parseFloat(v.fee),
        examDate: v.examDate,
      }));

    const pkg = packageFee ? parseFloat(packageFee) : undefined;
    if (packageFee && (isNaN(pkg!) || pkg! < 0)) {
      setError('Package fee must be valid.');
      return;
    }

    const scopesPayload = selectedBranches.map((b) => ({
      branch: b.name,
      branchId: b.id,
      sections: branchSections[b.id] ?? [],
    }));
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
          branch: primaryBranch,
          batch,
          yearOfStudy: parseInt(yearOfStudy, 10),
          semester: parseInt(semester, 10),
          scopes: scopesPayload,
          subjects,
          packageFee: pkg,
          applicationStartDate: applicationStartDate || undefined,
          applicationEndDate: applicationEndDate || undefined,
          examinationStartDate: examinationStartDate || undefined,
          examinationEndDate: examinationEndDate || undefined,
          lateFeeStartDate: lateFeeStartDate || undefined,
          lateFeeSlabs: slabs.filter(
            (s) => s.fromDay > 0 && s.toDay > 0 && s.amount >= 0,
          ),
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
          branch: primaryBranch,
          batch,
          yearOfStudy: parseInt(yearOfStudy, 10),
          semester: parseInt(semester, 10),
          scopes: scopesPayload,
          subjects,
          packageFee: pkg,
          applicationStartDate: applicationStartDate || undefined,
          applicationEndDate: applicationEndDate || undefined,
          examinationStartDate: examinationStartDate || undefined,
          examinationEndDate: examinationEndDate || undefined,
          lateFeeStartDate: lateFeeStartDate || undefined,
          lateFeeSlabs: slabs.filter(
            (s) => s.fromDay > 0 && s.toDay > 0 && s.amount >= 0,
          ),
          instructions: instructions.trim() || undefined,
          submitForApproval,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save examination');
    }
  }

  const selectedYear = yearSem?.years.find(
    (y) => y.yearOfStudy === parseInt(yearOfStudy, 10),
  );

  const selectedCount = Object.values(selectedFees).filter(
    (v) => v.selected,
  ).length;

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
                    ? 'bg-emerald-100 text-emerald-700'
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
                  setCourseId('');
                  setCourseName('');
                  setSelectedBranchIds([]);
                  setBranchSections({});
                  setBatch('');
                  setYearOfStudy('');
                  setSemester('');
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
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Programme
              </label>
              <select
                value={courseId}
                onChange={(e) => {
                  const id = e.target.value;
                  setCourseId(id);
                  const c = courses.find((x) => x.id === parseInt(id, 10));
                  setCourseName(c?.name ?? '');
                  setSelectedBranchIds([]);
                  setBranchSections({});
                  setBatch('');
                  setYearOfStudy('');
                  setSemester('');
                }}
                className={selectClass}
                required
                disabled={!collegeId}
              >
                <option value="">Select programme</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Branches
            </label>
            {!courseId ? (
              <p className="text-sm text-[var(--muted)]">
                Select a programme to load branches.
              </p>
            ) : branches.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                No SDMS branches for this programme.
              </p>
            ) : (
              <div className="max-h-72 space-y-3 overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] p-3">
                {branches.map((b) => {
                  const checked = selectedBranchIds.includes(b.id);
                  const available = sectionsByBranch[b.id] ?? [];
                  const selectedSecs = branchSections[b.id] ?? [];
                  return (
                    <div key={b.id} className="space-y-1.5">
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleBranch(b)}
                          disabled={!courseId}
                        />
                        {b.name}
                        {b.code ? (
                          <span className="font-normal text-[var(--muted)]">
                            ({b.code})
                          </span>
                        ) : null}
                      </label>
                      {checked && batch && (
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
                      {checked && !batch && (
                        <p className="ml-6 text-xs text-[var(--muted)]">
                          Select a batch to load sections.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Batch
              </label>
              <select
                value={batch}
                onChange={(e) => {
                  setBatch(e.target.value);
                  setBranchSections({});
                }}
                className={selectClass}
                required
                disabled={!courseId}
              >
                <option value="">Select batch</option>
                {batches.map((b) => (
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
                disabled={!firstBranchId}
              >
                <option value="">Select year</option>
                {yearSem?.years.map((y) => (
                  <option key={y.yearOfStudy} value={y.yearOfStudy}>
                    {y.label}
                  </option>
                ))}
              </select>
              {selectedBranchIds.length > 1 && (
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Year/semester from first selected branch.
                </p>
              )}
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
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          {loadingScope ? (
            <p className="text-sm text-[var(--muted)]">
              Loading mapped subjects (intersection across branches)...
            </p>
          ) : mappedSubjects.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              No common subject mappings for the selected branches /
              regulation / programme / batch / year / semester. Create
              mappings first.
            </p>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] p-3">
              <p className="mb-2 text-xs text-[var(--muted)]">
                Select subjects, set fee, and the date that paper will be held.
              </p>
              {mappedSubjects.map((subject) => {
                const row = selectedFees[subject.id] ?? {
                  selected: false,
                  fee: '180',
                  examDate: '',
                };
                return (
                  <label
                    key={subject.id}
                    className="flex flex-wrap items-center gap-3 rounded-md px-2 py-2 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={row.selected}
                      onChange={(e) =>
                        setSelectedFees((prev) => ({
                          ...prev,
                          [subject.id]: {
                            ...row,
                            selected: e.target.checked,
                          },
                        }))
                      }
                    />
                    <span className="min-w-[10rem] flex-1 text-sm">
                      <span className="font-medium">{subject.code}</span>
                      <span className="text-[var(--muted)]">
                        {' '}
                        — {subject.name}
                      </span>
                    </span>
                    <input
                      type="number"
                      min={0}
                      step="1"
                      value={row.fee}
                      disabled={!row.selected}
                      onChange={(e) =>
                        setSelectedFees((prev) => ({
                          ...prev,
                          [subject.id]: { ...row, fee: e.target.value },
                        }))
                      }
                      className="w-24 rounded-[var(--radius)] border border-[var(--border)] px-2 py-1.5 text-sm disabled:bg-slate-50"
                      placeholder="Fee"
                      aria-label={`Fee ${subject.code}`}
                    />
                    <input
                      type="date"
                      value={row.examDate}
                      disabled={!row.selected}
                      onChange={(e) =>
                        setSelectedFees((prev) => ({
                          ...prev,
                          [subject.id]: {
                            ...row,
                            examDate: e.target.value,
                          },
                        }))
                      }
                      className="rounded-[var(--radius)] border border-[var(--border)] px-2 py-1.5 text-sm disabled:bg-slate-50"
                      aria-label={`Exam date ${subject.code}`}
                    />
                  </label>
                );
              })}
            </div>
          )}
          <Input
            label="Package fee (optional)"
            type="number"
            min={0}
            value={packageFee}
            onChange={(e) => setPackageFee(e.target.value)}
            placeholder="Applied when all subjects selected"
          />
          <p className="text-xs text-[var(--muted)]">
            {selectedCount} subject{selectedCount !== 1 ? 's' : ''} selected
            {selectedBranches.length > 1
              ? ` · common to ${selectedBranches.length} branches`
              : ''}
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

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">Late fee slabs</p>
              <Button
                type="button"
                variant="secondary"
                className="!px-3 !py-1.5 text-xs"
                onClick={() =>
                  setSlabs((prev) => [
                    ...prev,
                    { fromDay: 1, toDay: 3, amount: 100 },
                  ])
                }
              >
                Add slab
              </Button>
            </div>
            <div className="space-y-2">
              {slabs.map((slab, idx) => (
                <div key={idx} className="grid grid-cols-4 gap-2">
                  <input
                    type="number"
                    min={1}
                    value={slab.fromDay}
                    onChange={(e) =>
                      setSlabs((rows) =>
                        rows.map((r, i) =>
                          i === idx
                            ? { ...r, fromDay: parseInt(e.target.value, 10) || 0 }
                            : r,
                        ),
                      )
                    }
                    className={selectClass}
                    placeholder="From day"
                  />
                  <input
                    type="number"
                    min={1}
                    value={slab.toDay}
                    onChange={(e) =>
                      setSlabs((rows) =>
                        rows.map((r, i) =>
                          i === idx
                            ? { ...r, toDay: parseInt(e.target.value, 10) || 0 }
                            : r,
                        ),
                      )
                    }
                    className={selectClass}
                    placeholder="To day"
                  />
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
                    className={selectClass}
                    placeholder="Amount"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    className="!text-red-600"
                    onClick={() =>
                      setSlabs((rows) => rows.filter((_, i) => i !== idx))
                    }
                    disabled={slabs.length <= 1}
                  >
                    Remove
                  </Button>
                </div>
              ))}
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
              {reviewTypes.map(examTypeLabel).join(' + ')} · {collegeName} /{' '}
              {courseName} / {batch} · Y{yearOfStudy} / S{semester}
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
              {packageFee ? ` · Package fee: ${packageFee}` : ''}
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
