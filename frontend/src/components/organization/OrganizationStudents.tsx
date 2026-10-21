'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  SdmsCollege,
  SdmsCourse,
  SdmsBranch,
  SdmsStudent,
} from '@/types/sdms';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { LoadingBlock } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';

const selectClass =
  'rounded-[var(--radius)] border border-[var(--border)] bg-white px-3.5 py-2 text-sm outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]';

export function OrganizationStudents({ connected }: { connected: boolean }) {
  const [colleges, setColleges] = useState<SdmsCollege[]>([]);
  const [courses, setCourses] = useState<SdmsCourse[]>([]);
  const [branches, setBranches] = useState<SdmsBranch[]>([]);
  const [collegeId, setCollegeId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [students, setStudents] = useState<SdmsStudent[]>([]);
  const [studentTotal, setStudentTotal] = useState(0);
  const [studentPage, setStudentPage] = useState(1);
  const [studentSearch, setStudentSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!connected) return;
    api.getSdmsColleges().then(setColleges).catch(() => setColleges([]));
  }, [connected]);

  useEffect(() => {
    if (colleges.length === 1 && !collegeId) {
      setCollegeId(String(colleges[0].id));
    }
  }, [colleges, collegeId]);

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

  const loadStudents = useCallback(async () => {
    if (!connected) return;
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
  }, [
    connected,
    colleges,
    courses,
    branches,
    collegeId,
    courseId,
    branchId,
    studentSearch,
    studentPage,
  ]);

  useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  return (
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
          <LoadingBlock />
        ) : students.length === 0 ? (
          <EmptyState
            title="No students found"
            description="Adjust filters or check the student database connection."
          />
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
  );
}
