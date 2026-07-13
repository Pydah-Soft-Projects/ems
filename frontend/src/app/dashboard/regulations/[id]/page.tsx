'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import {
  RegulationDetail,
  RegulationBatchInsight,
} from '@/types/regulation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';

type SelectedBatch = {
  collegeId: number;
  collegeName: string;
  courseId: number;
  courseName: string;
  batch: string;
};

export default function RegulationDetailPage() {
  const params = useParams();
  const id = parseInt(String(params.id), 10);

  const [detail, setDetail] = useState<RegulationDetail | null>(null);
  const [insight, setInsight] = useState<RegulationBatchInsight | null>(null);
  const [selected, setSelected] = useState<SelectedBatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [insightLoading, setInsightLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isNaN(id)) return;
    setLoading(true);
    api
      .getRegulationDetail(id)
      .then(setDetail)
      .catch(() => setError('Failed to load regulation.'))
      .finally(() => setLoading(false));
  }, [id]);

  async function selectBatch(batch: SelectedBatch) {
    setSelected(batch);
    setInsightLoading(true);
    try {
      const data = await api.getRegulationBatchInsight(id, {
        collegeId: batch.collegeId,
        courseId: batch.courseId,
        batch: batch.batch,
      });
      setInsight(data);
    } catch {
      setInsight(null);
    } finally {
      setInsightLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
      </div>
    );
  }

  if (!detail || error) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[var(--danger)]">{error || 'Not found'}</p>
        <Link href="/dashboard/regulations">
          <Button variant="secondary">Back to regulations</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${detail.code} — ${detail.name}`}
        description={detail.description ?? 'Regulation scope and student coverage from SDMS'}
        action={
          <Link href="/dashboard/regulations">
            <Button variant="secondary">Back to list</Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardBody className="py-4">
            <p className="text-xs text-[var(--muted)]">Status</p>
            <div className="mt-1">
              <StatusBadge status={detail.status} />
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="py-4">
            <p className="text-xs text-[var(--muted)]">Colleges</p>
            <p className="mt-1 text-2xl font-semibold">{detail.summary.collegeCount}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="py-4">
            <p className="text-xs text-[var(--muted)]">Courses</p>
            <p className="mt-1 text-2xl font-semibold">{detail.summary.courseCount}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="py-4">
            <p className="text-xs text-[var(--muted)]">Students (mapped batches)</p>
            <p className="mt-1 text-2xl font-semibold">{detail.summary.totalStudents}</p>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Scope"
            description="Colleges → courses → batches under this regulation"
          />
          <CardBody className="space-y-4">
            {detail.colleges.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No scope mapped yet.</p>
            ) : (
              detail.colleges.map((college) => (
                <div key={college.collegeId} className="rounded-lg border border-[var(--border)] p-3">
                  <p className="font-semibold text-slate-900">{college.collegeName}</p>
                  <div className="mt-2 space-y-3">
                    {college.courses.map((course) => (
                      <div key={course.courseId}>
                        <p className="text-sm font-medium text-slate-700">
                          {course.courseName}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-2">
                          {course.batches.map((b) => {
                            const active =
                              selected?.collegeId === college.collegeId &&
                              selected?.courseId === course.courseId &&
                              selected?.batch === b.batch;
                            return (
                              <button
                                key={b.scopeId}
                                type="button"
                                onClick={() =>
                                  selectBatch({
                                    collegeId: college.collegeId,
                                    collegeName: college.collegeName,
                                    courseId: course.courseId,
                                    courseName: course.courseName,
                                    batch: b.batch,
                                  })
                                }
                                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                                  active
                                    ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]'
                                    : 'border-[var(--border)] bg-white text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                Batch {b.batch}
                                <span className="ml-1 text-[var(--muted)]">
                                  ({b.studentCount ?? 0})
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader
            title="Batch insight"
            description={
              selected
                ? `${selected.collegeName} / ${selected.courseName} / Batch ${selected.batch}`
                : 'Select a batch to see academic year, year-semester breakdown, and student counts'
            }
          />
          <CardBody>
            {!selected ? (
              <p className="text-sm text-[var(--muted)]">
                Click a batch on the left to view the full picture from the student database.
              </p>
            ) : insightLoading ? (
              <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
              </div>
            ) : insight ? (
              <div className="space-y-6">
                <div className="flex flex-wrap gap-3">
                  <Badge variant="success">
                    {insight.totalStudents} students
                  </Badge>
                  <Badge variant="default">
                    {insight.calendarSemesters.length} calendar semester rows
                  </Badge>
                </div>

                <div>
                  <p className="mb-2 text-sm font-semibold text-slate-800">
                    Students by status (batch total)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {insight.statusTotals.map((row) => (
                      <Badge key={row.status} variant="default">
                        {row.status}: {row.studentCount}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-semibold text-slate-800">
                    Students by program year, semester & status
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border)] bg-slate-50/80">
                          <th className="px-3 py-2 font-medium text-slate-600">Program year</th>
                          <th className="px-3 py-2 font-medium text-slate-600">Semester</th>
                          <th className="px-3 py-2 font-medium text-slate-600">Total</th>
                          <th className="px-3 py-2 font-medium text-slate-600">By status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {insight.yearSemesterStatusBreakdown.map((row) => (
                          <tr key={`${row.yearOfStudy}-${row.semesterNumber}`}>
                            <td className="px-3 py-2">Year {row.yearOfStudy}</td>
                            <td className="px-3 py-2">Sem {row.semesterNumber}</td>
                            <td className="px-3 py-2 font-medium">{row.totalStudents}</td>
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap gap-1.5">
                                {row.byStatus.map((statusRow) => (
                                  <span
                                    key={statusRow.status}
                                    className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                                  >
                                    {statusRow.status}:{' '}
                                    <strong className="ml-0.5">{statusRow.studentCount}</strong>
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-semibold text-slate-800">
                    Students by program year & semester (summary)
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border)] bg-slate-50/80">
                          <th className="px-3 py-2 font-medium text-slate-600">Program year</th>
                          <th className="px-3 py-2 font-medium text-slate-600">Semester</th>
                          <th className="px-3 py-2 font-medium text-slate-600">Students</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {insight.yearSemesterBreakdown.map((row) => (
                          <tr key={`${row.yearOfStudy}-${row.semesterNumber}`}>
                            <td className="px-3 py-2">Year {row.yearOfStudy}</td>
                            <td className="px-3 py-2">Sem {row.semesterNumber}</td>
                            <td className="px-3 py-2 font-medium">{row.studentCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {insight.calendarSemesters.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-semibold text-slate-800">
                      Academic calendar (SDMS semesters)
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-[var(--border)] bg-slate-50/80">
                            <th className="px-3 py-2 font-medium text-slate-600">Session</th>
                            <th className="px-3 py-2 font-medium text-slate-600">Prog. year</th>
                            <th className="px-3 py-2 font-medium text-slate-600">Sem</th>
                            <th className="px-3 py-2 font-medium text-slate-600">Dates</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {insight.calendarSemesters.map((sem) => (
                            <tr key={sem.id}>
                              <td className="px-3 py-2">{sem.academicYearLabel ?? '—'}</td>
                              <td className="px-3 py-2">Year {sem.yearOfStudy}</td>
                              <td className="px-3 py-2">Sem {sem.semesterNumber}</td>
                              <td className="px-3 py-2 text-slate-600">
                                {sem.startDate ?? '—'} → {sem.endDate ?? '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-sm font-semibold text-slate-800">By branch</p>
                    <ul className="space-y-1 text-sm text-slate-600">
                      {insight.branchBreakdown.map((row) => (
                        <li key={row.branch}>
                          {row.branch}: <strong>{row.studentCount}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-semibold text-slate-800">By section</p>
                    <ul className="space-y-1 text-sm text-slate-600">
                      {insight.sectionBreakdown.map((row) => (
                        <li key={row.section}>
                          {row.section}: <strong>{row.studentCount}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">No insight data available.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
