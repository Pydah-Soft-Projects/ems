'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  SdmsCollege,
  SdmsCourse,
  SdmsBranch,
  SdmsAcademicYear,
} from '@/types/sdms';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

const selectClass =
  'rounded-[var(--radius)] border border-[var(--border)] bg-white px-3.5 py-2 text-sm outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]';

export function OrganizationHierarchy({ connected }: { connected: boolean }) {
  const [colleges, setColleges] = useState<SdmsCollege[]>([]);
  const [courses, setCourses] = useState<SdmsCourse[]>([]);
  const [branches, setBranches] = useState<SdmsBranch[]>([]);
  const [academicYears, setAcademicYears] = useState<SdmsAcademicYear[]>([]);
  const [batches, setBatches] = useState<string[]>([]);
  const [collegeId, setCollegeId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [branchId, setBranchId] = useState('');

  useEffect(() => {
    if (!connected) return;
    api.getSdmsColleges().then(setColleges).catch(() => setColleges([]));
    api
      .getSdmsAcademicYears()
      .then(setAcademicYears)
      .catch(() => setAcademicYears([]));
  }, [connected]);

  useEffect(() => {
    if (!collegeId) {
      setCourses([]);
      return;
    }
    api
      .getSdmsCourses(parseInt(collegeId, 10))
      .then(setCourses)
      .catch(() => setCourses([]));
  }, [collegeId]);

  useEffect(() => {
    if (!courseId) {
      setBranches([]);
      return;
    }
    api
      .getSdmsBranches(parseInt(courseId, 10))
      .then(setBranches)
      .catch(() => setBranches([]));
  }, [courseId]);

  useEffect(() => {
    if (!branchId) {
      setBatches([]);
      return;
    }
    api
      .getSdmsBatches({ branchId: parseInt(branchId, 10) })
      .then(setBatches)
      .catch(() => setBatches([]));
  }, [branchId]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader
          title="Organizational hierarchy"
          description="College → Course → Branch → Batches"
        />
        <CardBody className="space-y-4">
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
              }}
              className={`${selectClass} w-full`}
            >
              <option value="">All colleges ({colleges.length})</option>
              {colleges.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {collegeId ? (
            <>
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">
                  Courses ({courses.length})
                </p>
                <ul className="max-h-40 space-y-1 overflow-y-auto text-sm text-slate-600">
                  {courses.map((c) => (
                    <li key={c.id}>
                      {c.name}
                      <span className="text-[var(--muted)]">
                        {' '}
                        — {c.totalYears}y / {c.semestersPerYear} sem/yr
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Course
                </label>
                <select
                  value={courseId}
                  onChange={(e) => {
                    setCourseId(e.target.value);
                    setBranchId('');
                  }}
                  className={`${selectClass} w-full`}
                >
                  <option value="">Select course</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : null}

          {courseId ? (
            <>
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">
                  Branches ({branches.length})
                </p>
                <ul className="max-h-40 space-y-1 overflow-y-auto text-sm text-slate-600">
                  {branches.map((b) => (
                    <li key={b.id}>{b.name}</li>
                  ))}
                </ul>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Branch
                </label>
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  className={`${selectClass} w-full`}
                >
                  <option value="">Select branch</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : null}

          {branchId ? (
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">
                Batches ({batches.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {batches.map((b) => (
                  <Badge key={b} variant="default">
                    {b}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Academic years"
          description={`${academicYears.length} sessions`}
        />
        <CardBody className="!p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-slate-50/80">
                  <th className="px-5 py-3 font-semibold text-slate-600">Label</th>
                  <th className="px-5 py-3 font-semibold text-slate-600">Period</th>
                  <th className="px-5 py-3 font-semibold text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {academicYears.map((year) => (
                  <tr key={year.id}>
                    <td className="px-5 py-3 font-medium">{year.yearLabel}</td>
                    <td className="px-5 py-3 text-slate-600">
                      {year.startDate ?? '—'} → {year.endDate ?? '—'}
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={year.isActive ? 'success' : 'default'}>
                        {year.isActive ? 'active' : 'inactive'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
