'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  SdmsCollege,
  SdmsCourse,
  SdmsBranch,
  SdmsAcademicYear,
  SdmsStudent,
} from '@/types/sdms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';

const selectClass =
  'rounded-[var(--radius)] border border-[var(--border)] bg-white px-3.5 py-2 text-sm outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]';

type Tab = 'hierarchy' | 'students';

export default function OrganizationPage() {
  const [tab, setTab] = useState<Tab>('hierarchy');
  const [connected, setConnected] = useState<boolean | null>(null);

  const [colleges, setColleges] = useState<SdmsCollege[]>([]);
  const [courses, setCourses] = useState<SdmsCourse[]>([]);
  const [branches, setBranches] = useState<SdmsBranch[]>([]);
  const [academicYears, setAcademicYears] = useState<SdmsAcademicYear[]>([]);
  const [batches, setBatches] = useState<string[]>([]);

  const [collegeId, setCollegeId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [branchId, setBranchId] = useState('');

  const [students, setStudents] = useState<SdmsStudent[]>([]);
  const [studentTotal, setStudentTotal] = useState(0);
  const [studentPage, setStudentPage] = useState(1);
  const [studentSearch, setStudentSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getSdmsStatus()
      .then((s) => setConnected(s.connected))
      .catch(() => setConnected(false));
  }, []);

  useEffect(() => {
    if (connected === false) return;
    api.getSdmsColleges().then(setColleges).catch(() => setColleges([]));
    api.getSdmsAcademicYears().then(setAcademicYears).catch(() => setAcademicYears([]));
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

  const loadStudents = useCallback(async () => {
    setLoading(true);
    try {
      const college = colleges.find((c) => c.id === parseInt(collegeId, 10));
      const course = courses.find((c) => c.id === parseInt(courseId, 10));
      const branch = branches.find((b) => b.id === parseInt(branchId, 10));

      const result = await api.getSdmsStudents({
        college: college?.name,
        course: course?.name,
        branch: branch?.name,
        search: studentSearch || undefined,
        page: studentPage,
        limit: 25,
      });
      setStudents(result.items);
      setStudentTotal(result.total);
    } catch {
      setStudents([]);
      setStudentTotal(0);
    } finally {
      setLoading(false);
    }
  }, [colleges, courses, branches, collegeId, courseId, branchId, studentSearch, studentPage]);

  useEffect(() => {
    if (tab === 'students' && connected) {
      loadStudents();
    }
  }, [tab, connected, loadStudents]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Student Organization"
        description="Read-only view of colleges, programs, branches, batches, academic years, and students from the student database (SDMS)."
      />

      <div className="flex items-center gap-2">
        <Badge variant={connected ? 'success' : connected === false ? 'default' : 'default'}>
          {connected === null
            ? 'Checking connection...'
            : connected
              ? 'Student DB connected (read-only)'
              : 'Student DB unavailable'}
        </Badge>
      </div>

      <div className="inline-flex rounded-[var(--radius)] border border-[var(--border)] bg-white p-1">
        <button
          type="button"
          onClick={() => setTab('hierarchy')}
          className={`rounded-md px-4 py-2 text-sm font-medium transition ${
            tab === 'hierarchy'
              ? 'bg-[var(--primary)] text-white'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          Hierarchy
        </button>
        <button
          type="button"
          onClick={() => setTab('students')}
          className={`rounded-md px-4 py-2 text-sm font-medium transition ${
            tab === 'students'
              ? 'bg-[var(--primary)] text-white'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          Students
        </button>
      </div>

      {tab === 'hierarchy' ? (
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

              {collegeId && (
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
              )}

              {collegeId && (
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
              )}

              {courseId && (
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
              )}

              {courseId && (
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
              )}

              {branchId && (
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
              )}
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
      ) : (
        <Card>
          <CardHeader
            title="Students"
            description={`${studentTotal} students — read-only from student_database`}
          />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                    setStudentPage(1);
                  }}
                  className={`${selectClass} w-full`}
                >
                  <option value="">All</option>
                  {colleges.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
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
                    setStudentPage(1);
                  }}
                  className={`${selectClass} w-full`}
                  disabled={!collegeId}
                >
                  <option value="">All</option>
                  {courses.map((c) => (
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
                    setStudentPage(1);
                  }}
                  className={`${selectClass} w-full`}
                  disabled={!courseId}
                >
                  <option value="">All</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                label="Search PIN / admission no."
                value={studentSearch}
                onChange={(e) => {
                  setStudentSearch(e.target.value);
                  setStudentPage(1);
                }}
                placeholder="Search..."
              />
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-slate-50/80">
                      <th className="px-4 py-3 font-semibold text-slate-600">Name</th>
                      <th className="px-4 py-3 font-semibold text-slate-600">PIN</th>
                      <th className="px-4 py-3 font-semibold text-slate-600">Course</th>
                      <th className="px-4 py-3 font-semibold text-slate-600">Branch</th>
                      <th className="px-4 py-3 font-semibold text-slate-600">Batch</th>
                      <th className="px-4 py-3 font-semibold text-slate-600">Year/Sem</th>
                      <th className="px-4 py-3 font-semibold text-slate-600">Section</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {students.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-medium">{s.studentName}</td>
                        <td className="px-4 py-3 text-slate-600">{s.pinNo ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{s.course ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{s.branch ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{s.batch ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-600">
                          Y{s.currentYear} / S{s.currentSemester}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{s.section ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
