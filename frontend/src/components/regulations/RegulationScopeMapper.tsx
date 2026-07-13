'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import {
  ClaimedRegulationBatch,
  RegulationScope,
  RegulationScopeInput,
} from '@/types/regulation';
import { SdmsCollege, SdmsCourse } from '@/types/sdms';

export type ScopeFormState = RegulationScopeInput[];

export function scopesToFormInput(scopes: RegulationScope[]): ScopeFormState {
  const map = new Map<string, RegulationScopeInput>();

  for (const scope of scopes) {
    const key = `${scope.collegeId}:${scope.courseId}`;
    if (!map.has(key)) {
      map.set(key, {
        collegeId: scope.collegeId,
        collegeName: scope.collegeName,
        courseId: scope.courseId,
        courseName: scope.courseName,
        batches: [],
      });
    }
    const entry = map.get(key)!;
    if (!entry.batches.includes(scope.batch)) {
      entry.batches.push(scope.batch);
    }
  }

  return Array.from(map.values());
}

export function flattenScopeForm(value: ScopeFormState): RegulationScopeInput[] {
  return value.filter((entry) => entry.batches.length > 0);
}

export function getSelectedCollegeIdsFromScopes(scopes: ScopeFormState): number[] {
  return [...new Set(scopes.map((s) => s.collegeId))];
}

interface RegulationScopeMapperProps {
  value: ScopeFormState;
  onChange: (value: ScopeFormState) => void;
  selectedCollegeIds: number[];
  onSelectedCollegeIdsChange: (ids: number[]) => void;
  /** When set, batches claimed by this regulation are not treated as unavailable. */
  excludeRegulationId?: number;
  /** Only active regulations reserve batches; inactive drafts may select any batch. */
  regulationActive?: boolean;
}

function scopeKey(collegeId: number, courseId: number, batch: string) {
  return `${collegeId}:${courseId}:${batch}`;
}

export function RegulationScopeMapper({
  value,
  onChange,
  selectedCollegeIds,
  onSelectedCollegeIdsChange,
  excludeRegulationId,
  regulationActive = true,
}: RegulationScopeMapperProps) {
  const [colleges, setColleges] = useState<SdmsCollege[]>([]);
  const [loadingColleges, setLoadingColleges] = useState(true);
  const [coursesByCollege, setCoursesByCollege] = useState<
    Record<number, SdmsCourse[]>
  >({});
  const [loadingCourses, setLoadingCourses] = useState<Record<number, boolean>>(
    {},
  );
  const [batchesByCourse, setBatchesByCourse] = useState<
    Record<string, string[]>
  >({});
  const [loadingBatches, setLoadingBatches] = useState<Record<string, boolean>>(
    {},
  );
  const [claimedBatches, setClaimedBatches] = useState<ClaimedRegulationBatch[]>(
    [],
  );
  const loadedCoursesRef = useRef(new Set<number>());
  const loadedBatchesRef = useRef(new Set<string>());

  useEffect(() => {
    setLoadingColleges(true);
    api
      .getSdmsColleges()
      .then(setColleges)
      .catch(() => setColleges([]))
      .finally(() => setLoadingColleges(false));
  }, []);

  useEffect(() => {
    if (!regulationActive) {
      setClaimedBatches([]);
      return;
    }
    api
      .getClaimedRegulationBatches(excludeRegulationId)
      .then(setClaimedBatches)
      .catch(() => setClaimedBatches([]));
  }, [regulationActive, excludeRegulationId]);

  const claimedByKey = new Map(
    claimedBatches.map((row) => [
      scopeKey(row.collegeId, row.courseId, row.batch),
      row,
    ]),
  );

  function getBatchClaim(collegeId: number, courseId: number, batch: string) {
    return claimedByKey.get(scopeKey(collegeId, courseId, batch));
  }

  const loadCourses = useCallback(async (collegeId: number) => {
    if (loadedCoursesRef.current.has(collegeId)) return;
    loadedCoursesRef.current.add(collegeId);
    setLoadingCourses((prev) => ({ ...prev, [collegeId]: true }));
    try {
      const courses = await api.getSdmsCourses(collegeId);
      setCoursesByCollege((prev) => ({ ...prev, [collegeId]: courses }));
    } catch {
      setCoursesByCollege((prev) => ({ ...prev, [collegeId]: [] }));
    } finally {
      setLoadingCourses((prev) => ({ ...prev, [collegeId]: false }));
    }
  }, []);

  const loadBatches = useCallback(async (collegeId: number, courseId: number) => {
    const batchKey = `${collegeId}:${courseId}`;
    if (loadedBatchesRef.current.has(batchKey)) return;
    loadedBatchesRef.current.add(batchKey);
    setLoadingBatches((prev) => ({ ...prev, [batchKey]: true }));
    try {
      const batches = await api.getSdmsBatches({ collegeId, courseId });
      setBatchesByCourse((prev) => ({ ...prev, [batchKey]: batches }));
    } catch {
      setBatchesByCourse((prev) => ({ ...prev, [batchKey]: [] }));
    } finally {
      setLoadingBatches((prev) => ({ ...prev, [batchKey]: false }));
    }
  }, []);

  useEffect(() => {
    selectedCollegeIds.forEach((id) => {
      void loadCourses(id);
    });
  }, [selectedCollegeIds, loadCourses]);

  useEffect(() => {
    value.forEach((entry) => {
      void loadBatches(entry.collegeId, entry.courseId);
    });
  }, [value, loadBatches]);

  function toggleCollege(college: SdmsCollege, checked: boolean) {
    if (checked) {
      const next = selectedCollegeIds.includes(college.id)
        ? selectedCollegeIds
        : [...selectedCollegeIds, college.id];
      onSelectedCollegeIdsChange(next);
      void loadCourses(college.id);
    } else {
      onSelectedCollegeIdsChange(
        selectedCollegeIds.filter((id) => id !== college.id),
      );
      onChange(value.filter((v) => v.collegeId !== college.id));
    }
  }

  function toggleCourse(
    college: SdmsCollege,
    course: SdmsCourse,
    checked: boolean,
  ) {
    if (checked) {
      const exists = value.some(
        (v) => v.collegeId === college.id && v.courseId === course.id,
      );
      if (!exists) {
        onChange([
          ...value,
          {
            collegeId: college.id,
            collegeName: college.name,
            courseId: course.id,
            courseName: course.name,
            batches: [],
          },
        ]);
      }
      void loadBatches(college.id, course.id);
    } else {
      onChange(
        value.filter(
          (v) => !(v.collegeId === college.id && v.courseId === course.id),
        ),
      );
    }
  }

  function toggleBatch(
    collegeId: number,
    courseId: number,
    batch: string,
    checked: boolean,
  ) {
    if (checked && regulationActive && getBatchClaim(collegeId, courseId, batch)) {
      return;
    }
    onChange(
      value.map((entry) => {
        if (entry.collegeId !== collegeId || entry.courseId !== courseId) {
          return entry;
        }
        const batches = checked
          ? [...new Set([...entry.batches, batch])]
          : entry.batches.filter((b) => b !== batch);
        return { ...entry, batches };
      }),
    );
  }

  function isCourseSelected(collegeId: number, courseId: number) {
    return value.some(
      (v) => v.collegeId === collegeId && v.courseId === courseId,
    );
  }

  function getEntry(collegeId: number, courseId: number) {
    return value.find(
      (v) => v.collegeId === collegeId && v.courseId === courseId,
    );
  }

  const selectedColleges = colleges.filter((c) =>
    selectedCollegeIds.includes(c.id),
  );

  return (
    <div className="space-y-5">
      {/* Step A: Colleges */}
      <section>
        <p className="text-sm font-semibold text-slate-900">1. Select colleges</p>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          Choose one or more colleges that follow this regulation.
        </p>
        <div className="mt-3 rounded-[var(--radius)] border border-[var(--border)] p-3">
          {loadingColleges ? (
            <p className="text-sm text-[var(--muted)]">Loading colleges...</p>
          ) : colleges.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No colleges found in SDMS.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {colleges.map((college) => {
                const checked = selectedCollegeIds.includes(college.id);
                return (
                  <label
                    key={college.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition ${
                      checked
                        ? 'border-[var(--primary)] bg-[var(--primary-soft)]'
                        : 'border-[var(--border)] hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggleCollege(college, e.target.checked)}
                      className="h-4 w-4 shrink-0 rounded border-[var(--border)] accent-[var(--primary)]"
                    />
                    <span className="text-sm font-medium text-slate-900">
                      {college.name}
                      {college.code ? (
                        <span className="ml-1 font-normal text-[var(--muted)]">
                          ({college.code})
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Step B: Programmes per college */}
      {selectedColleges.length > 0 && (
        <section>
          <p className="text-sm font-semibold text-slate-900">
            2. Select programmes (courses)
          </p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Each college can include different programmes under this regulation.
          </p>
          <div className="mt-3 space-y-3">
            {selectedColleges.map((college) => {
              const courses = coursesByCollege[college.id];
              const isLoading = loadingCourses[college.id];

              return (
                <div
                  key={college.id}
                  className="rounded-[var(--radius)] border border-[var(--border)] bg-slate-50/40 p-4"
                >
                  <p className="mb-3 text-sm font-semibold text-slate-800">
                    {college.name}
                  </p>
                  {isLoading ? (
                    <p className="text-xs text-[var(--muted)]">Loading programmes...</p>
                  ) : !courses || courses.length === 0 ? (
                    <p className="text-xs text-[var(--muted)]">
                      No programmes found for this college.
                    </p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {courses.map((course) => {
                        const courseSelected = isCourseSelected(
                          college.id,
                          course.id,
                        );
                        return (
                          <label
                            key={course.id}
                            className={`flex cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 py-2 transition ${
                              courseSelected
                                ? 'border-[var(--primary)] ring-1 ring-[var(--primary)]'
                                : 'border-[var(--border)] hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={courseSelected}
                              onChange={(e) =>
                                toggleCourse(college, course, e.target.checked)
                              }
                              className="h-4 w-4 shrink-0 rounded accent-[var(--primary)]"
                            />
                            <span className="text-sm text-slate-800">{course.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Step C: Batches per programme */}
      {value.length > 0 && (
        <section>
          <p className="text-sm font-semibold text-slate-900">
            3. Select batches (admission years)
          </p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Pick which student batches are covered for each programme. Each batch
            can belong to only one active regulation.
          </p>
          <div className="mt-3 space-y-3">
            {value.map((entry) => {
              const batchKey = `${entry.collegeId}:${entry.courseId}`;
              const batches = batchesByCourse[batchKey];
              const isLoading = loadingBatches[batchKey];

              return (
                <div
                  key={batchKey}
                  className="rounded-[var(--radius)] border border-[var(--border)] p-4"
                >
                  <p className="text-sm font-medium text-slate-800">
                    {entry.collegeName}
                    <span className="mx-1.5 text-[var(--muted)]">→</span>
                    {entry.courseName}
                  </p>
                  <div className="mt-2">
                    {isLoading ? (
                      <p className="text-xs text-[var(--muted)]">Loading batches...</p>
                    ) : !batches || batches.length === 0 ? (
                      <p className="text-xs text-[var(--muted)]">
                        No batches found for this programme.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {batches.map((batch) => {
                          const checked = entry.batches.includes(batch);
                          const claim = regulationActive
                            ? getBatchClaim(entry.collegeId, entry.courseId, batch)
                            : undefined;
                          const isClaimed = !!claim;
                          return (
                            <label
                              key={batch}
                              title={
                                isClaimed
                                  ? `Already used in active regulation ${claim.regulationCode}`
                                  : undefined
                              }
                              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${
                                isClaimed
                                  ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                                  : checked
                                    ? 'cursor-pointer border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]'
                                    : 'cursor-pointer border-[var(--border)] bg-white hover:bg-slate-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={isClaimed}
                                onChange={(e) =>
                                  toggleBatch(
                                    entry.collegeId,
                                    entry.courseId,
                                    batch,
                                    e.target.checked,
                                  )
                                }
                                className="h-3.5 w-3.5 rounded accent-[var(--primary)] disabled:opacity-40"
                              />
                              <span>{batch}</span>
                              {isClaimed ? (
                                <span className="text-[10px] font-medium uppercase tracking-wide">
                                  {claim.regulationCode}
                                </span>
                              ) : null}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
