'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Exam } from '@/types/exam';
import {
  ExamResultsResponse,
  ResultRowInput,
  ResultUploadResponse,
} from '@/types/results';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { LoadingBlock } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';

const TEMPLATE_HEADERS = [
  'Roll Number / PIN',
  'Subject Code',
  'Subject Name',
  'Grade',
  'Grade Points',
  'P/F',
  'Credits',
];

function normalizeHeader(h: unknown) {
  return String(h ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const HEADER_ALIASES: Record<keyof ResultRowInput, string[]> = {
  rollNumber: [
    'rollnumberpin',
    'rollnumber',
    'rollno',
    'roll',
    'pinno',
    'pin',
    'htno',
    'hallticketnumber',
    'regno',
  ],
  subjectCode: ['subjectcode', 'subcode', 'code'],
  subjectName: ['subjectname', 'subname', 'subject', 'papername'],
  grade: ['grade', 'grades'],
  gradePoints: ['gradepoints', 'gradepoint', 'gp'],
  result: ['pf', 'result', 'passfail', 'status'],
  credits: ['credits', 'credit', 'cr'],
};

function mapHeaders(headerRow: unknown[]) {
  const mapping = new Map<number, keyof ResultRowInput>();
  headerRow.forEach((h, idx) => {
    const norm = normalizeHeader(h);
    if (!norm) return;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(norm)) {
        mapping.set(idx, field as keyof ResultRowInput);
        return;
      }
    }
  });
  return mapping;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-subtle)] px-3.5 py-3 shadow-[var(--shadow-sm)]">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-1 text-base font-bold text-slate-900">{value}</p>
    </div>
  );
}

export function ExamResultsPanel({ exam }: { exam: Exam }) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [report, setReport] = useState<ExamResultsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ResultRowInput[]>([]);
  const [parseError, setParseError] = useState('');
  const [posting, setPosting] = useState(false);
  const [postResult, setPostResult] = useState<ResultUploadResponse | null>(
    null,
  );

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setReport(await api.getExamResults(exam.id));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to load results.',
      );
    } finally {
      setLoading(false);
    }
  }, [exam.id]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  async function downloadResults() {
    if (!report || report.totals.rows === 0) return;
    const XLSX = await import('xlsx');
    const rows = report.students.flatMap((s) =>
      s.subjects.map((sub) => ({
        'Roll Number / PIN': s.rollNumber,
        'Student Name': s.studentName ?? '',
        'Subject Code': sub.subjectCode,
        'Subject Name': sub.subjectName,
        Grade: sub.grade,
        'Grade Points': sub.gradePoints ?? '',
        'P/F': sub.passed ? 'P' : 'F',
        Credits: sub.credits,
        Attempt: sub.attemptNumber,
        'Overall Status': s.allPassed ? 'All clear' : 'Has failures',
      })),
    );
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = Object.keys(rows[0]).map((h) => ({ wch: h.length + 10 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Results');
    const safeName = exam.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    XLSX.writeFile(wb, `results-${safeName}.xlsx`);
  }

  async function downloadTemplate() {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([
      TEMPLATE_HEADERS,
      ['22HP1A0501', 'CS101', 'Data Structures', 'A', 8, 'P', 3],
      ['22HP1A0501', 'CS102', 'Digital Logic', 'F', 0, 'F', 3],
    ]);
    ws['!cols'] = TEMPLATE_HEADERS.map((h) => ({ wch: h.length + 8 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Results');
    XLSX.writeFile(wb, `results-template-exam-${exam.id}.xlsx`);
  }

  async function handleFile(file: File) {
    setParseError('');
    setPostResult(null);
    setRows([]);
    setFileName(file.name);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer());
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) throw new Error('The workbook has no sheets');
      const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        blankrows: false,
        defval: '',
      });
      if (grid.length < 2) {
        throw new Error('The sheet needs a header row and at least one data row');
      }
      const mapping = mapHeaders(grid[0]);
      const fields = new Set(mapping.values());
      const missing = ['rollNumber', 'subjectCode', 'grade'].filter(
        (f) => !fields.has(f as keyof ResultRowInput),
      );
      if (missing.length) {
        throw new Error(
          `Could not find column(s): ${missing.join(', ')}. Expected headers like "${TEMPLATE_HEADERS.join('", "')}".`,
        );
      }
      const parsed: ResultRowInput[] = [];
      for (const line of grid.slice(1)) {
        const row: Partial<ResultRowInput> = {};
        mapping.forEach((field, idx) => {
          const value = line[idx];
          if (value !== undefined && value !== null && String(value).trim() !== '') {
            (row as Record<string, unknown>)[field] = String(value).trim();
          }
        });
        // skip fully empty lines
        if (!row.rollNumber && !row.subjectCode && !row.grade) continue;
        parsed.push(row as ResultRowInput);
      }
      if (!parsed.length) throw new Error('No data rows found in the sheet');
      setRows(parsed);
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : 'Failed to parse the file.',
      );
      setFileName('');
    }
  }

  async function handlePost() {
    if (!rows.length) return;
    setPosting(true);
    setPostResult(null);
    setError('');
    try {
      const result = await api.uploadExamResults(exam.id, {
        fileName,
        rows,
      });
      setPostResult(result);
      if (result.success) {
        toast.push(
          `Results posted — ${result.inserted ?? 0} new, ${result.updated ?? 0} corrected.`,
          'success',
        );
        setRows([]);
        setFileName('');
        if (fileInputRef.current) fileInputRef.current.value = '';
        await loadReport();
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to post results.',
      );
    } finally {
      setPosting(false);
    }
  }

  if (exam.status !== 'published') {
    return (
      <Alert tone="info">
        Results can be posted after the examination is published.
      </Alert>
    );
  }

  const previewRows = rows.slice(0, 8);

  return (
    <div className="space-y-5">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {/* ── Upload ── */}
      <div className="rounded-[var(--radius)] border border-[var(--border)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Upload results sheet
            </p>
            <p className="text-xs text-[var(--muted)]">
              Columns: Roll Number / PIN, Subject Code, Subject Name, Grade,
              P/F, Credits. Re-uploading corrects existing marks; supply exams
              add a new attempt automatically.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void downloadTemplate()}
            >
              Download template
            </Button>
            <Button size="sm" onClick={() => fileInputRef.current?.click()}>
              Choose file
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
          </div>
        </div>

        {parseError ? (
          <Alert tone="danger" className="mt-3">
            {parseError}
          </Alert>
        ) : null}

        {rows.length > 0 ? (
          <div className="mt-4 space-y-3">
            <p className="text-xs font-medium text-slate-700">
              {fileName} — {rows.length} row{rows.length === 1 ? '' : 's'}{' '}
              parsed. Preview:
            </p>
            <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)]">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="bg-slate-50 text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Roll / PIN</th>
                    <th className="px-3 py-2 font-semibold">Subject code</th>
                    <th className="px-3 py-2 font-semibold">Subject name</th>
                    <th className="px-3 py-2 font-semibold">Grade</th>
                    <th className="px-3 py-2 font-semibold">Grade points</th>
                    <th className="px-3 py-2 font-semibold">P/F</th>
                    <th className="px-3 py-2 font-semibold">Credits</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r, idx) => (
                    <tr key={idx} className="border-t border-[var(--border)]">
                      <td className="px-3 py-1.5">{r.rollNumber}</td>
                      <td className="px-3 py-1.5">{r.subjectCode}</td>
                      <td className="px-3 py-1.5">{r.subjectName ?? '—'}</td>
                      <td className="px-3 py-1.5">{r.grade}</td>
                      <td className="px-3 py-1.5">{r.gradePoints ?? '—'}</td>
                      <td className="px-3 py-1.5">{r.result ?? 'auto'}</td>
                      <td className="px-3 py-1.5">{r.credits ?? '0'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > previewRows.length ? (
              <p className="text-xs text-[var(--muted)]">
                …and {rows.length - previewRows.length} more rows.
              </p>
            ) : null}
            <Button onClick={() => void handlePost()} loading={posting}>
              Post {rows.length} result{rows.length === 1 ? '' : 's'}
            </Button>
          </div>
        ) : null}

        {postResult && !postResult.success ? (
          <div className="mt-4 space-y-2">
            <Alert tone="danger">
              Nothing was saved — fix these rows in the sheet and upload again
              ({postResult.errors?.length ?? 0} problem
              {(postResult.errors?.length ?? 0) === 1 ? '' : 's'}).
            </Alert>
            <div className="max-h-56 overflow-y-auto rounded-[var(--radius)] border border-[var(--border)]">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[var(--muted)]">
                  <tr>
                    <th className="w-20 px-3 py-2 font-semibold">Sheet row</th>
                    <th className="px-3 py-2 font-semibold">Problem</th>
                  </tr>
                </thead>
                <tbody>
                  {(postResult.errors ?? []).map((e, idx) => (
                    <tr key={idx} className="border-t border-[var(--border)]">
                      <td className="px-3 py-1.5">{e.row}</td>
                      <td className="px-3 py-1.5">{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Posted results ── */}
      {loading ? (
        <LoadingBlock label="Loading posted results…" />
      ) : report && report.totals.rows > 0 ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">
              Posted results
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void downloadResults()}
            >
              Download results (Excel)
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            <Stat label="Students" value={String(report.totals.students)} />
            <Stat label="All clear" value={String(report.totals.allClear)} />
            <Stat
              label="With failures"
              value={String(report.totals.withFailures)}
            />
            <Stat label="Result rows" value={String(report.totals.rows)} />
          </div>

          {report.subjectStats.length > 0 ? (
            <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)]">
              <table className="w-full min-w-[520px] text-left text-xs">
                <thead className="bg-slate-50 text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Subject</th>
                    <th className="px-3 py-2 font-semibold">Appeared</th>
                    <th className="px-3 py-2 font-semibold">Passed</th>
                    <th className="px-3 py-2 font-semibold">Failed</th>
                    <th className="px-3 py-2 font-semibold">Pass %</th>
                  </tr>
                </thead>
                <tbody>
                  {report.subjectStats.map((s) => (
                    <tr
                      key={s.subjectCode}
                      className="border-t border-[var(--border)]"
                    >
                      <td className="px-3 py-1.5">
                        {s.subjectCode} — {s.subjectName}
                      </td>
                      <td className="px-3 py-1.5">{s.appeared}</td>
                      <td className="px-3 py-1.5">{s.passed}</td>
                      <td className="px-3 py-1.5">{s.failed}</td>
                      <td className="px-3 py-1.5">
                        {s.appeared
                          ? `${Math.round((s.passed / s.appeared) * 100)}%`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)]">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="bg-slate-50 text-[var(--muted)]">
                <tr>
                  <th className="px-3 py-2 font-semibold">Roll / PIN</th>
                  <th className="px-3 py-2 font-semibold">Student</th>
                  <th className="px-3 py-2 font-semibold">Subjects</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {report.students.map((s) => (
                  <tr
                    key={s.rollNumber}
                    className="border-t border-[var(--border)] align-top"
                  >
                    <td className="px-3 py-2 font-medium">{s.rollNumber}</td>
                    <td className="px-3 py-2">{s.studentName ?? '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {s.subjects.map((sub) => (
                          <span
                            key={sub.subjectCode}
                            title={`${sub.subjectName} · attempt ${sub.attemptNumber} · ${sub.gradePoints ?? '—'} grade points · ${sub.credits} credits`}
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              sub.passed
                                ? 'bg-[var(--success-soft)] text-[var(--success)]'
                                : 'bg-rose-50 text-rose-700'
                            }`}
                          >
                            {sub.subjectCode}: {sub.grade}
                            {sub.gradePoints != null ? ` (${sub.gradePoints} GP)` : ''}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          s.allPassed
                            ? 'bg-[var(--success-soft)] text-[var(--success)]'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {s.allPassed ? 'All clear' : 'Has failures'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {report.uploads.length > 0 ? (
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-700">
                Upload history
              </p>
              <ul className="space-y-0.5 text-xs text-[var(--muted)]">
                {report.uploads.map((u) => (
                  <li key={u.id}>
                    {new Date(u.createdAt).toLocaleString()} —{' '}
                    {u.fileName ?? 'sheet'} ({u.rowCount} rows,{' '}
                    {u.studentCount} students)
                    {u.uploadedBy ? ` by ${u.uploadedBy}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)]">
          No results posted for this examination yet.
        </p>
      )}
    </div>
  );
}
