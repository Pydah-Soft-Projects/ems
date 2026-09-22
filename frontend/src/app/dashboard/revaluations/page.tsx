'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { Regulation } from '@/types/regulation';
import type { RevaluationMappedSubject, RevaluationNotification, RevaluationStudentDetail, RevaluationScope, RevaluationYearSemester } from '@/types/revaluation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

const today = new Date().toISOString().slice(0, 10);

export default function RevaluationsPage() {
  const [regulations, setRegulations] = useState<Regulation[]>([]);
  const [notifications, setNotifications] = useState<RevaluationNotification[]>([]);
  const [subjects, setSubjects] = useState<RevaluationMappedSubject[]>([]);
  const [regulationId, setRegulationId] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<RevaluationScope[]>([]);
  const [selectedYearSemesters, setSelectedYearSemesters] = useState<RevaluationYearSemester[]>([]);
  const [availableYearSemesters, setAvailableYearSemesters] = useState<RevaluationYearSemester[]>([]);
  const [setupStep, setSetupStep] = useState<1 | 2>(1);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [subjectIds, setSubjectIds] = useState<number[]>([]);
  const [fees, setFees] = useState<string[]>([]);
  const [title, setTitle] = useState('Revaluation Applications Open');
  const [message, setMessage] = useState('Students can apply for revaluation for the selected subjects.');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [studentIdentifier, setStudentIdentifier] = useState('');
  const [applicationNotificationId, setApplicationNotificationId] = useState('');
  const [studentDetail, setStudentDetail] = useState<RevaluationStudentDetail | null>(null);
  const [studentSubjectIds, setStudentSubjectIds] = useState<number[]>([]);
  const [paidApplications, setPaidApplications] = useState<Array<{ id: number; studentName: string; studentRollNumber: string; feeAmount: number | string; selectedSubjectIds: number[]; status: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const selectedRegulation = useMemo(
    () => regulations.find((regulation) => regulation.id === Number(regulationId)),
    [regulations, regulationId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [regulationRows, notificationRows] = await Promise.all([
        api.getRegulations(),
        api.getRevaluationNotifications(),
      ]);
      setRegulations(regulationRows.filter((regulation) => regulation.status === 'active'));
      setNotifications(notificationRows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load revaluation data.');
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function chooseRegulation(value: string) {
    setRegulationId(value);
    setSelectedScopes([]);
    setSelectedYearSemesters([]);
    setAvailableYearSemesters([]);
    setSetupStep(1);
    setSubjectIds([]);
    setFees([]);
    setSubjects([]);
  }

  function openCreate() {
    setEditingId(null);
    setRegulationId('');
    setSelectedScopes([]);
    setSelectedYearSemesters([]);
    setAvailableYearSemesters([]);
    setSubjects([]);
    setSubjectIds([]);
    setFees([]);
    setTitle('Revaluation Applications Open');
    setMessage('Students can apply for revaluation for the selected subjects.');
    setStartDate(today);
    setEndDate(today);
    setStatus('draft');
    setSetupStep(1);
    setError('');
    setEditorOpen(true);
  }

  async function openEdit(notification: RevaluationNotification) {
    setEditingId(notification.id);
    setRegulationId(String(notification.regulationId));
    setSelectedScopes(notification.selectedScopes);
    setSelectedYearSemesters(notification.selectedYearSemesters ?? []);
    setTitle(notification.title);
    setMessage(notification.message);
    setStartDate(notification.startDate);
    setEndDate(notification.endDate);
    setStatus(notification.status);
    setSubjectIds(notification.subjectIds);
    setFees(notification.feesByCount.map(String));
    setSetupStep(1);
    setError('');
    setEditorOpen(true);
    try {
      const mapped = await api.getRevaluationMappedSubjects(notification.regulationId, notification.selectedScopes, notification.selectedYearSemesters ?? []);
      setSubjects(mapped);
      const available = await api.getRevaluationMappedSubjects(notification.regulationId, notification.selectedScopes);
      setAvailableYearSemesters([...new Map(available.map((subject) => [`${subject.yearOfStudy}-${subject.semester}`, { yearOfStudy: subject.yearOfStudy, semester: subject.semester }])).values()]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load notification subjects.');
    }
  }

  async function loadMappedSubjects(scopes: RevaluationScope[], yearSemesters: RevaluationYearSemester[] = selectedYearSemesters) {
    if (!regulationId || !scopes.length) {
      setSubjects([]);
      return;
    }
    try {
      const mapped = await api.getRevaluationMappedSubjects(Number(regulationId), scopes, yearSemesters);
      setSubjects(mapped);
      if (!yearSemesters.length) {
        setAvailableYearSemesters([...new Map(mapped.map((subject) => [`${subject.yearOfStudy}-${subject.semester}`, { yearOfStudy: subject.yearOfStudy, semester: subject.semester }])).values()]);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load mapped subjects.');
    }
  }

  async function toggleScope(scope: RevaluationScope) {
    const exists = selectedScopes.some((item) => item.collegeName === scope.collegeName && item.courseName === scope.courseName && item.batch === scope.batch);
    const nextScopes = exists
      ? selectedScopes.filter((item) => !(item.collegeName === scope.collegeName && item.courseName === scope.courseName && item.batch === scope.batch))
      : [...selectedScopes, scope];
    setSelectedScopes(nextScopes);
    setSelectedYearSemesters([]);
    setAvailableYearSemesters([]);
    setSubjectIds([]);
    setFees([]);
    await loadMappedSubjects(nextScopes, []);
  }

  async function toggleAllScopes() {
    const nextScopes = selectedScopes.length === scopeRows.length
      ? []
      : scopeRows.map((scope) => ({
        collegeName: scope.collegeName,
        courseName: scope.courseName,
        batch: scope.batch,
      }));
    setSelectedScopes(nextScopes);
    setSelectedYearSemesters([]);
    setSubjectIds([]);
    setFees([]);
    await loadMappedSubjects(nextScopes, []);
  }

  async function toggleYearSemester(value: RevaluationYearSemester) {
    const exists = selectedYearSemesters.some((item) => item.yearOfStudy === value.yearOfStudy && item.semester === value.semester);
    const next = exists
      ? selectedYearSemesters.filter((item) => item.yearOfStudy !== value.yearOfStudy || item.semester !== value.semester)
      : [...selectedYearSemesters, value];
    setSelectedYearSemesters(next);
    setSubjectIds([]);
    setFees([]);
    await loadMappedSubjects(selectedScopes, next);
  }

  function toggleSubject(id: number) {
    setSubjectIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  function updateFee(index: number, value: string) {
    setFees((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
  }

  async function saveNotification() {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        regulationId: Number(regulationId), title, message, startDate, endDate,
        selectedScopes, selectedYearSemesters, excludedBatches: [], subjectIds,
        feesByCount: fees.slice(0, subjectIds.length).map(Number), status,
      };
      if (editingId) await api.updateRevaluationNotification(editingId, payload);
      else await api.createRevaluationNotification(payload);
      setSuccess('Revaluation notification saved.');
      setEditorOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save notification.');
    } finally {
      setSaving(false);
    }
  }

  async function findStudent() {
    const notificationId = Number(applicationNotificationId);
    if (!notificationId) return;
    setError('');
    setSuccess('');
    try {
      const detail = await api.getRevaluationStudent(notificationId, studentIdentifier);
      setStudentDetail(detail);
      setStudentSubjectIds([]);
    } catch (err) {
      setStudentDetail(null);
      setError(err instanceof ApiError ? err.message : 'Failed to find student.');
    }
  }

  async function applyStudent() {
    if (!studentDetail || !applicationNotificationId) return;
    setSaving(true);
    setError('');
    try {
      const result = await api.applyRevaluation(Number(applicationNotificationId), {
        studentIdentifier,
        selectedSubjectIds: studentSubjectIds,
      });
      setSuccess(`Revaluation application created. Amount due: Rs. ${Number(result.feeAmount).toFixed(2)}.`);
      const rows = await api.getRevaluationApplications(Number(applicationNotificationId));
      setPaidApplications(rows.filter((row) => row.feeRecord?.status === 'paid').map((row) => ({ id: row.id, studentName: row.studentName, studentRollNumber: row.studentRollNumber, feeAmount: row.feeAmount, selectedSubjectIds: row.selectedSubjectIds, status: row.feeRecord?.status ?? row.status })));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to apply revaluation.');
    } finally {
      setSaving(false);
    }
  }

  async function loadPaidApplications(notificationId: string) {
    if (!notificationId) { setPaidApplications([]); return; }
    try {
      const rows = await api.getRevaluationApplications(Number(notificationId));
      setPaidApplications(rows.filter((row) => row.feeRecord?.status === 'paid').map((row) => ({ id: row.id, studentName: row.studentName, studentRollNumber: row.studentRollNumber, feeAmount: row.feeAmount, selectedSubjectIds: row.selectedSubjectIds, status: row.feeRecord?.status ?? row.status })));
    } catch { setPaidApplications([]); }
  }

  async function publishNotification(notification: RevaluationNotification) {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.updateRevaluationNotification(notification.id, {
        regulationId: notification.regulationId,
        title: notification.title,
        message: notification.message,
        startDate: notification.startDate,
        endDate: notification.endDate,
        selectedScopes: notification.selectedScopes,
        selectedYearSemesters: notification.selectedYearSemesters ?? [],
        excludedBatches: [],
        subjectIds: notification.subjectIds,
        feesByCount: notification.feesByCount,
        status: 'published',
      });
      setSuccess('Revaluation notification published.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to publish notification.');
    } finally {
      setSaving(false);
    }
  }

  const scopeRows = selectedRegulation?.scopes ?? [];
  const yearSemesterRows = availableYearSemesters;

  return (
    <div className="space-y-6">
      <PageHeader title="Revaluations" description="Publish revaluation access by regulation and batch, including students whose examinations were not created in EMS." action={<Button onClick={openCreate} aria-label="Add revaluation notification"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>Add revaluation</Button>} />
      {error ? <div className="rounded-lg bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{error}</div> : null}
      {success ? <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

      {editorOpen ? <div className="space-y-4">
      <Card>
        <CardHeader title={editingId ? 'Edit revaluation notification' : 'Create revaluation notification'} description="Configure eligibility, mapped subjects, and fees." action={<Button variant="secondary" onClick={() => setEditorOpen(false)}>Back to revaluations</Button>} />
        <CardBody className="space-y-5">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
            <button type="button" onClick={() => setSetupStep(1)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${setupStep === 1 ? 'bg-[var(--primary)] text-white' : 'bg-slate-100 text-slate-600'}`}>1. Eligibility</button>
            <span className="text-slate-300">/</span>
            <button type="button" onClick={() => selectedScopes.length && selectedYearSemesters.length ? setSetupStep(2) : undefined} disabled={!selectedScopes.length || !selectedYearSemesters.length} className={`rounded-lg px-4 py-2 text-sm font-semibold ${setupStep === 2 ? 'bg-[var(--primary)] text-white' : 'bg-slate-100 text-slate-600 disabled:opacity-50'}`}>2. Subjects and amounts</button>
          </div>
          {setupStep === 1 ? <>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm font-medium text-slate-700 md:col-span-1">Regulation
              <select value={regulationId} onChange={(event) => void chooseRegulation(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm">
                <option value="">Select regulation</option>
                {regulations.map((regulation) => <option key={regulation.id} value={regulation.id}>{regulation.code} - {regulation.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">Start date<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" /></label>
            <label className="text-sm font-medium text-slate-700">End date<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" /></label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">Notification title<input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" /></label>
            <label className="text-sm font-medium text-slate-700">Status<select value={status} onChange={(event) => setStatus(event.target.value as 'draft' | 'published')} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"><option value="draft">Draft</option><option value="published">Published</option></select></label>
          </div>
          <label className="block text-sm font-medium text-slate-700">Message<textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>

          {selectedRegulation ? <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">Step 1</p><h3 className="text-sm font-semibold text-slate-900">Regulation batches</h3>
            <p className="mt-1 text-xs text-slate-500">Select old or current batches. This does not require an EMS examination.</p>
            <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={scopeRows.length > 0 && selectedScopes.length === scopeRows.length} onChange={() => void toggleAllScopes()} />All batches</label>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {scopeRows.map((scope) => {
                const value = { collegeName: scope.collegeName, courseName: scope.courseName, batch: scope.batch };
                const checked = selectedScopes.some((item) => item.collegeName === value.collegeName && item.courseName === value.courseName && item.batch === value.batch);
                return <label key={`${scope.collegeId}-${scope.courseId}-${scope.batch}`} className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${checked ? 'border-[var(--primary)] bg-[var(--primary-soft)]' : 'border-slate-200'}`}><input type="checkbox" checked={checked} onChange={() => void toggleScope(value)} />{scope.collegeName} / {scope.courseName} / Batch {scope.batch}</label>;
              })}
            </div>
          </div> : null}

          {yearSemesterRows.length ? <div className="border-t border-slate-100 pt-4"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">Step 1 continued</p><h3 className="text-sm font-semibold text-slate-900">Year and semester</h3><p className="mt-1 text-xs text-slate-500">Choose the academic levels available in the selected batch mappings.</p><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{yearSemesterRows.map((item) => <label key={`${item.yearOfStudy}-${item.semester}`} className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${selectedYearSemesters.some((value) => value.yearOfStudy === item.yearOfStudy && value.semester === item.semester) ? 'border-[var(--primary)] bg-[var(--primary-soft)]' : 'border-slate-200'}`}><input type="checkbox" checked={selectedYearSemesters.some((value) => value.yearOfStudy === item.yearOfStudy && value.semester === item.semester)} onChange={() => void toggleYearSemester(item)} />Year {item.yearOfStudy} / Semester {item.semester}</label>)}</div></div> : null}
          <Button onClick={() => setSetupStep(2)} disabled={loading || !regulationId || !selectedScopes.length || !selectedYearSemesters.length}>Continue to subjects</Button>
          </> : <>
            <div><p className="text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">Step 2</p><h3 className="text-sm font-semibold text-slate-900">Subjects and amounts</h3><p className="mt-1 text-xs text-slate-500">Subjects are limited to the selected batch, year, semester, and subject mappings.</p><div className="mt-3 grid gap-2 md:grid-cols-2">{subjects.map((subject) => <label key={`${subject.id}-${subject.yearOfStudy}-${subject.semester}`} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm"><input type="checkbox" checked={subjectIds.includes(subject.id)} onChange={() => toggleSubject(subject.id)} /><span><span className="font-medium">{subject.code} - {subject.name}</span><span className="ml-2 text-xs text-slate-500">Year {subject.yearOfStudy} / Semester {subject.semester}</span></span></label>)}</div>{subjectIds.length ? <div className="mt-4"><h3 className="text-sm font-semibold text-slate-900">Fee by subject count</h3><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{subjectIds.map((_, index) => <label key={index} className="text-sm text-slate-600">{index + 1} subject{index ? 's' : ''}<input type="number" min="0" value={fees[index] ?? ''} onChange={(event) => updateFee(index, event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" /></label>)}</div></div> : null}</div>
            <div className="flex gap-2"><Button variant="secondary" onClick={() => setSetupStep(1)}>Back to eligibility</Button><Button onClick={() => void saveNotification()} loading={saving} disabled={loading || !regulationId || !subjectIds.length}>Save notification</Button></div>
          </>}
        </CardBody>
      </Card>
      </div> : null}

      {!editorOpen ? <Card>
        <CardHeader title="Revaluation notifications" description={`${notifications.length} notification${notifications.length === 1 ? '' : 's'} configured`} />
        <CardBody className="space-y-2">{notifications.length ? notifications.map((notification) => <div key={notification.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3"><div><p className="text-sm font-semibold text-slate-900">{notification.title}</p><p className="text-xs text-slate-500">{notification.regulationCode} · {notification.startDate} to {notification.endDate} · {notification.selectedScopes.length} scope(s)</p></div><div className="flex items-center gap-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold uppercase text-slate-600">{notification.status}</span>{notification.status === 'draft' ? <Button size="sm" variant="success" onClick={() => void publishNotification(notification)} loading={saving}>Publish</Button> : null}<button type="button" onClick={() => void openEdit(notification)} aria-label={`Edit ${notification.title}`} title="Edit notification" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="m4 16.5-.7 3.7 3.7-.7L18.5 8a2.1 2.1 0 0 0-3-3L4 16.5Z" /><path d="m14.5 6.5 3 3" /></svg></button></div></div>) : <p className="text-sm text-slate-500">No revaluation notifications yet.</p>}</CardBody>
      </Card>
      : null}

      {!editorOpen && notifications.some((notification) => notification.status === 'published') ? <Card>
        <CardHeader title="Apply revaluation for a student" description="The student is checked against the notification batches, not against an EMS examination." />
        <CardBody className="space-y-4"><div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]"><select value={applicationNotificationId} onChange={(event) => { setApplicationNotificationId(event.target.value); setStudentDetail(null); void loadPaidApplications(event.target.value); }} className="h-10 rounded-lg border border-slate-200 px-3 text-sm"><option value="">Select published notification</option>{notifications.filter((notification) => notification.status === 'published').map((notification) => <option key={notification.id} value={notification.id}>{notification.title} · {notification.regulationCode}</option>)}</select><input value={studentIdentifier} onChange={(event) => setStudentIdentifier(event.target.value)} placeholder="PIN or admission number" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" /><Button variant="secondary" onClick={() => void findStudent()} disabled={!applicationNotificationId}>Find student</Button></div>{studentDetail ? <><div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">{studentDetail.student.name} · {studentDetail.student.college} · {studentDetail.student.course} · Batch {studentDetail.student.batch}</div><div className="grid gap-2 md:grid-cols-2">{studentDetail.subjects.map((subject) => <label key={subject.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm"><input type="checkbox" checked={studentSubjectIds.includes(subject.id)} onChange={() => setStudentSubjectIds((current) => current.includes(subject.id) ? current.filter((id) => id !== subject.id) : [...current, subject.id])} />{subject.code} - {subject.name}</label>)}</div><p className="text-sm font-semibold text-slate-800">Amount: Rs. {Number(studentDetail.notification.feesByCount[studentSubjectIds.length - 1] ?? 0).toFixed(2)}</p><Button onClick={() => void applyStudent()} loading={saving} disabled={!studentSubjectIds.length}>Create application</Button></> : null}{paidApplications.length ? <div><h3 className="text-sm font-semibold text-slate-900">Paid students</h3><div className="mt-2 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs text-slate-500"><th className="py-2">Student</th><th>Roll number</th><th>Subjects</th><th>Amount</th></tr></thead><tbody>{paidApplications.map((row) => <tr key={row.id} className="border-b border-slate-100"><td className="py-2">{row.studentName}</td><td>{row.studentRollNumber}</td><td>{row.selectedSubjectIds.length}</td><td>Rs. {Number(row.feeAmount).toFixed(2)}</td></tr>)}</tbody></table></div></div> : null}</CardBody>
      </Card> : null}
    </div>
  );
}
