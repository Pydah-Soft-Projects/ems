'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Regulation, RegulationScope } from '@/types/regulation';
import {
  Subject,
  SubjectMappingEntry,
  CreateSubjectMappingInput,
  SubjectMappingAssignment,
} from '@/types/subject';
import { SdmsBranch } from '@/types/sdms';
import { api } from '@/lib/api';

const selectClass =
  'w-full rounded-[var(--radius)] border border-[var(--border)] bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]';

interface MappingFormProps {
  regulations: Regulation[];
  initial?: SubjectMappingEntry | null;
  defaultRegulationId?: number;
  onSubmit: (data: CreateSubjectMappingInput) => Promise<void>;
  onUpdate?: (id: number, data: SubjectMappingAssignment) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

type AssignmentRow = {
  key: string;
  subjectId: string;
  branchId: string;
  batchKey: string;
  yearOfStudy: string;
  semester: string;
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

function getScopedColleges(scopes: RegulationScope[]) {
  const map = new Map<number, { id: number; name: string }>();
  for (const scope of scopes) {
    if (!map.has(scope.collegeId)) {
      map.set(scope.collegeId, {
        id: scope.collegeId,
        name: scope.collegeName,
      });
    }
  }
  return Array.from(map.values());
}

function getScopedCourseOptions(
  scopes: RegulationScope[],
  selectedCollegeIds: number[],
) {
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
}

function getScopedBatchOptions(
  scopes: RegulationScope[],
  selectedCourseKeys: string[],
) {
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
  return options.sort((a, b) => b.batch.localeCompare(a.batch));
}

function newRow(): AssignmentRow {
  return {
    key: crypto.randomUUID(),
    subjectId: '',
    branchId: '',
    batchKey: '',
    yearOfStudy: '',
    semester: '',
  };
}

export function MappingForm({
  regulations,
  initial,
  defaultRegulationId,
  onSubmit,
  onUpdate,
  onCancel,
  loading,
}: MappingFormProps) {
  const [regulationId, setRegulationId] = useState('');
  const [selectedCollegeIds, setSelectedCollegeIds] = useState<number[]>([]);
  const [selectedCourseKeys, setSelectedCourseKeys] = useState<string[]>([]);
  const [selectedBatchKeys, setSelectedBatchKeys] = useState<string[]>([]);
  const [branchesByCourse, setBranchesByCourse] = useState<
    Record<string, SdmsBranch[]>
  >({});
  const [availableSubjects, setAvailableSubjects] = useState<Subject[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([newRow()]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [error, setError] = useState('');

  const isEdit = !!initial;

  const selectedRegulation = regulations.find(
    (reg) => reg.id === parseInt(regulationId, 10),
  );
  const scopes = selectedRegulation?.scopes ?? [];

  const scopedColleges = useMemo(() => getScopedColleges(scopes), [scopes]);
  const scopedCourses = useMemo(
    () => getScopedCourseOptions(scopes, selectedCollegeIds),
    [scopes, selectedCollegeIds],
  );
  const scopedBatches = useMemo(
    () => getScopedBatchOptions(scopes, selectedCourseKeys),
    [scopes, selectedCourseKeys],
  );

  const allBranches = useMemo(() => {
    const list: (SdmsBranch & {
      courseKey: string;
      collegeName: string;
      courseName: string;
    })[] = [];
    for (const course of scopedCourses) {
      if (!selectedCourseKeys.includes(course.key)) continue;
      const branches = branchesByCourse[course.key] ?? [];
      for (const branch of branches) {
        list.push({
          ...branch,
          courseKey: course.key,
          collegeName: course.collegeName,
          courseName: course.courseName,
        });
      }
    }
    return list;
  }, [scopedCourses, selectedCourseKeys, branchesByCourse]);

  useEffect(() => {
    if (initial) {
      setRegulationId(String(initial.regulationId));
      setSelectedCollegeIds([initial.collegeId]);
      setSelectedCourseKeys([courseKey(initial.collegeId, initial.courseId)]);
      setSelectedBatchKeys([
        batchKey(initial.collegeId, initial.courseId, initial.batch),
      ]);
      setAssignments([
        {
          key: String(initial.id),
          subjectId: String(initial.subjectId),
          branchId: String(initial.branchId),
          batchKey: batchKey(
            initial.collegeId,
            initial.courseId,
            initial.batch,
          ),
          yearOfStudy: String(initial.yearOfStudy),
          semester: String(initial.semester),
        },
      ]);
    } else {
      setRegulationId(defaultRegulationId ? String(defaultRegulationId) : '');
      setSelectedCollegeIds([]);
      setSelectedCourseKeys([]);
      setSelectedBatchKeys([]);
      setAssignments([newRow()]);
    }
    setError('');
  }, [initial, defaultRegulationId]);

  useEffect(() => {
    if (!regulationId) {
      setAvailableSubjects([]);
      return;
    }
    setLoadingSubjects(true);
    api
      .getSubjects(parseInt(regulationId, 10))
      .then(setAvailableSubjects)
      .catch(() => setAvailableSubjects([]))
      .finally(() => setLoadingSubjects(false));
  }, [regulationId]);

  useEffect(() => {
    if (selectedCourseKeys.length === 0) return;

    let cancelled = false;
    setLoadingBranches(true);

    Promise.all(
      selectedCourseKeys.map(async (key) => {
        const { courseId } = parseCourseKey(key);
        const branches = await api.getSdmsBranches(courseId);
        return [key, branches] as const;
      }),
    )
      .then((entries) => {
        if (cancelled) return;
        const next: Record<string, SdmsBranch[]> = {};
        for (const [key, branches] of entries) {
          next[key] = branches;
        }
        setBranchesByCourse(next);
      })
      .catch(() => {
        if (!cancelled) setBranchesByCourse({});
      })
      .finally(() => {
        if (!cancelled) setLoadingBranches(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCourseKeys]);

  function toggleCollege(id: number, checked: boolean) {
    setSelectedCollegeIds((prev) => {
      const next = checked
        ? [...new Set([...prev, id])]
        : prev.filter((x) => x !== id);
      if (!checked) {
        const removedCourseKeys = scopedCourses
          .filter((c) => c.collegeId === id)
          .map((c) => c.key);
        setSelectedCourseKeys((keys) =>
          keys.filter((k) => !removedCourseKeys.includes(k)),
        );
        setSelectedBatchKeys((keys) =>
          keys.filter((k) => {
            const { collegeId } = parseBatchKey(k);
            return collegeId !== id;
          }),
        );
      }
      return next;
    });
  }

  function toggleCourse(key: string, checked: boolean) {
    setSelectedCourseKeys((prev) => {
      const next = checked
        ? [...new Set([...prev, key])]
        : prev.filter((x) => x !== key);
      if (!checked) {
        setSelectedBatchKeys((keys) =>
          keys.filter((k) => {
            const { collegeId, courseId } = parseBatchKey(k);
            const { collegeId: cId, courseId: coId } = parseCourseKey(key);
            return !(collegeId === cId && courseId === coId);
          }),
        );
      }
      return next;
    });
  }

  function toggleBatch(key: string, checked: boolean) {
    setSelectedBatchKeys((prev) =>
      checked ? [...new Set([...prev, key])] : prev.filter((x) => x !== key),
    );
  }

  function updateRow(key: string, patch: Partial<AssignmentRow>) {
    setAssignments((rows) =>
      rows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function batchesForBranch(branchId: string) {
    const branch = allBranches.find((b) => b.id === parseInt(branchId, 10));
    if (!branch) return scopedBatches.filter((b) => selectedBatchKeys.includes(b.key));
    return scopedBatches.filter((b) => {
      if (!selectedBatchKeys.includes(b.key)) return false;
      const parsed = parseBatchKey(b.key);
      const course = parseCourseKey(branch.courseKey);
      return (
        parsed.collegeId === course.collegeId &&
        parsed.courseId === course.courseId
      );
    });
  }

  function buildAssignment(row: AssignmentRow): SubjectMappingAssignment | null {
    const subject = availableSubjects.find(
      (s) => s.id === parseInt(row.subjectId, 10),
    );
    const branch = allBranches.find(
      (b) => b.id === parseInt(row.branchId, 10),
    );
    const batchParsed = row.batchKey ? parseBatchKey(row.batchKey) : null;
    const course = batchParsed
      ? scopedCourses.find(
          (c) =>
            c.collegeId === batchParsed.collegeId &&
            c.courseId === batchParsed.courseId,
        )
      : branch
        ? scopedCourses.find((c) => c.key === branch.courseKey)
        : undefined;

    const year = parseInt(row.yearOfStudy, 10);
    const sem = parseInt(row.semester, 10);

    if (!subject || !branch || !course || !batchParsed || isNaN(year) || isNaN(sem)) {
      return null;
    }

    return {
      subjectId: subject.id,
      collegeId: course.collegeId,
      collegeName: course.collegeName,
      courseId: course.courseId,
      courseName: course.courseName,
      branchId: branch.id,
      branchName: branch.name,
      batch: batchParsed.batch,
      yearOfStudy: year,
      semester: sem,
    };
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!regulationId) {
      setError('Regulation is required.');
      return;
    }

    if (isEdit && initial && onUpdate) {
      const assignment = buildAssignment(assignments[0]);
      if (!assignment) {
        setError('Complete subject, branch, batch, year, and semester.');
        return;
      }
      try {
        await onUpdate(initial.id, assignment);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save mapping');
      }
      return;
    }

    if (selectedCollegeIds.length === 0) {
      setError('Select at least one college from the regulation scope.');
      return;
    }
    if (selectedCourseKeys.length === 0) {
      setError('Select at least one programme.');
      return;
    }
    if (selectedBatchKeys.length === 0) {
      setError('Select at least one batch.');
      return;
    }

    const built = assignments
      .map(buildAssignment)
      .filter((a): a is SubjectMappingAssignment => a !== null);

    if (built.length === 0) {
      setError('Add at least one valid subject assignment row.');
      return;
    }
    if (built.length !== assignments.length) {
      setError('Fill subject, branch, batch, year, and semester for every row.');
      return;
    }

    try {
      await onSubmit({
        regulationId: parseInt(regulationId, 10),
        assignments: built,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save mapping');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          Regulation
        </label>
        <select
          value={regulationId}
          onChange={(e) => {
            setRegulationId(e.target.value);
            if (!isEdit) {
              setSelectedCollegeIds([]);
              setSelectedCourseKeys([]);
              setSelectedBatchKeys([]);
              setAssignments([newRow()]);
            }
          }}
          className={selectClass}
          required
          disabled={isEdit}
        >
          <option value="">Select regulation</option>
          {regulations.map((reg) => (
            <option key={reg.id} value={reg.id}>
              {reg.code} — {reg.name}
            </option>
          ))}
        </select>
      </div>

      {!isEdit && (
        <>
          <section>
            <p className="text-sm font-semibold text-slate-900">
              1. Colleges (regulation scope)
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {scopedColleges.map((college) => (
                <label
                  key={college.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2"
                >
                  <input
                    type="checkbox"
                    checked={selectedCollegeIds.includes(college.id)}
                    onChange={(e) => toggleCollege(college.id, e.target.checked)}
                    disabled={!regulationId}
                  />
                  <span className="text-sm">{college.name}</span>
                </label>
              ))}
            </div>
          </section>

          {selectedCollegeIds.length > 0 && (
            <section>
              <p className="text-sm font-semibold text-slate-900">
                2. Programmes
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {scopedCourses.map((course) => (
                  <label
                    key={course.key}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCourseKeys.includes(course.key)}
                      onChange={(e) => toggleCourse(course.key, e.target.checked)}
                    />
                    <span className="text-sm">
                      {course.collegeName} → {course.courseName}
                    </span>
                  </label>
                ))}
              </div>
            </section>
          )}

          {selectedCourseKeys.length > 0 && (
            <section>
              <p className="text-sm font-semibold text-slate-900">
                3. Batches (admission years)
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {scopedBatches.map((batch) => (
                  <label
                    key={batch.key}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedBatchKeys.includes(batch.key)}
                      onChange={(e) => toggleBatch(batch.key, e.target.checked)}
                    />
                    {batch.label}
                  </label>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-900">
            {isEdit ? 'Assignment' : '4. Subject assignments'}
          </p>
          {!isEdit && (
            <Button
              type="button"
              variant="secondary"
              className="!px-3 !py-1.5 text-xs"
              onClick={() => setAssignments((rows) => [...rows, newRow()])}
              disabled={
                selectedBatchKeys.length === 0 || availableSubjects.length === 0
              }
            >
              Add row
            </Button>
          )}
        </div>
        <p className="mb-3 text-xs text-[var(--muted)]">
          One subject can appear on multiple branches with different year and
          semester — e.g. CSE Year 2 Sem 2 and ECE Year 3 Sem 1.
        </p>

        {loadingSubjects ? (
          <p className="text-sm text-[var(--muted)]">Loading subjects...</p>
        ) : availableSubjects.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Create subjects under this regulation first.
          </p>
        ) : (
          <div className="space-y-3">
            {assignments.map((row) => (
              <div
                key={row.key}
                className="grid gap-3 rounded-[var(--radius)] border border-[var(--border)] p-3 sm:grid-cols-2 lg:grid-cols-6"
              >
                <div className="lg:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Subject
                  </label>
                  <select
                    value={row.subjectId}
                    onChange={(e) =>
                      updateRow(row.key, { subjectId: e.target.value })
                    }
                    className={selectClass}
                    required
                  >
                    <option value="">Select subject</option>
                    {availableSubjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.code} — {subject.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="lg:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Branch
                  </label>
                  <select
                    value={row.branchId}
                    onChange={(e) =>
                      updateRow(row.key, {
                        branchId: e.target.value,
                        batchKey: '',
                      })
                    }
                    className={selectClass}
                    required
                    disabled={loadingBranches && !isEdit}
                  >
                    <option value="">Select branch</option>
                    {allBranches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.collegeName} → {branch.courseName} →{' '}
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Batch
                  </label>
                  <select
                    value={row.batchKey}
                    onChange={(e) =>
                      updateRow(row.key, { batchKey: e.target.value })
                    }
                    className={selectClass}
                    required
                    disabled={!row.branchId}
                  >
                    <option value="">Batch</option>
                    {batchesForBranch(row.branchId).map((batch) => (
                      <option key={batch.key} value={batch.key}>
                        {batch.batch}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      Year
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={row.yearOfStudy}
                      onChange={(e) =>
                        updateRow(row.key, { yearOfStudy: e.target.value })
                      }
                      className={selectClass}
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      Sem
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={row.semester}
                      onChange={(e) =>
                        updateRow(row.key, { semester: e.target.value })
                      }
                      className={selectClass}
                      required
                    />
                  </div>
                </div>
                {!isEdit && assignments.length > 1 && (
                  <div className="flex items-end sm:col-span-2 lg:col-span-6">
                    <Button
                      type="button"
                      variant="ghost"
                      className="!px-3 !py-1.5 text-xs !text-red-600"
                      onClick={() =>
                        setAssignments((rows) =>
                          rows.filter((r) => r.key !== row.key),
                        )
                      }
                    >
                      Remove row
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

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
          {loading ? 'Saving...' : isEdit ? 'Update assignment' : 'Create mappings'}
        </Button>
      </div>
    </form>
  );
}
