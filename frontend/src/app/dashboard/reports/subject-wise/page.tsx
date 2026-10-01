'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import jsPDF from 'jspdf';
import type { Exam, ExamSubject } from '@/types/exam';
import type { ExamFeeRecord, Payment } from '@/types/fee';

function dateOnly(value?: string | null) {
  return value ? value.slice(0, 10) : '';
}

function isPaid(payment: Payment) {
  const paymentStatus = String(payment.status || '').toLowerCase().trim();
  // Cancelled, voided, failed, expired, or refunded payments must NEVER be shown as paid in reports
  if (['cancelled', 'voided', 'failed', 'expired', 'refunded'].includes(paymentStatus)) {
    return false;
  }
  const feeStatus = String(payment.feeRecord?.status || '').toLowerCase().trim();
  if (['cancelled', 'voided', 'failed'].includes(feeStatus)) {
    return false;
  }
  return ['success', 'paid'].includes(paymentStatus) || (!paymentStatus && feeStatus === 'paid');
}

function branchMatches(subject: ExamSubject, branch: string) {
  return !subject.branch || subject.branch.toLowerCase() === branch.toLowerCase();
}

export default function SubjectWiseReportsPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [selectedExam, setSelectedExam] = useState<number | null>(null);
  const [branch, setBranch] = useState('');
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [examDate, setExamDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [paymentsLoading, setPaymentsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    Promise.all([api.getExams(), api.getPayments(undefined, undefined, 'active')])
      .then(([examRows, paymentRows]) => {
        if (!mounted) return;
        setExams(examRows || []);
        setPayments((paymentRows || []).filter(isPaid));
      })
      .catch(() => {
        if (!mounted) return;
        setExams([]);
        setPayments([]);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
        setPaymentsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const exam = useMemo(
    () => exams.find((item) => item.id === selectedExam) ?? null,
    [exams, selectedExam],
  );

  const branches = useMemo(() => {
    if (!exam) return [];
    const values = new Set<string>();
    if (exam.branch) values.add(exam.branch);
    for (const scope of exam.scopes || []) {
      if (scope.branch) values.add(scope.branch);
    }
    for (const paper of exam.examSubjects || []) {
      if (paper.branch) values.add(paper.branch);
    }
    return [...values].sort();
  }, [exam]);

  const subjects = useMemo(() => {
    if (!exam) return [];
    const unique = new Map<number, ExamSubject>();
    for (const paper of exam.examSubjects || []) {
      if ((!branch || branchMatches(paper, branch)) && paper.subject?.id != null) {
        unique.set(paper.subjectId, paper);
      }
    }
    return [...unique.values()].sort((a, b) =>
      `${a.subject?.code || ''} ${a.subject?.name || ''}`.localeCompare(
        `${b.subject?.code || ''} ${b.subject?.name || ''}`,
      ),
    );
  }, [exam, branch]);

  const selectedSubject = useMemo(
    () => subjects.find((paper) => paper.subjectId === subjectId) ?? null,
    [subjects, subjectId],
  );

  const availableDates = useMemo(() => {
    const dates = new Set(subjects.map((paper) => dateOnly(paper.examDate)).filter(Boolean));
    return [...dates].sort();
  }, [subjects]);

  const reportRows = useMemo(() => {
    if (!selectedExam) return [];
    const rows = new Map<string, {
      id: string;
      subject: string;
      subjectName: string;
      pin: string;
      branch: string;
    }>();
    const reportSubjects = subjects.filter((paper) =>
      (!subjectId || paper.subjectId === subjectId) &&
      (!examDate || dateOnly(paper.examDate) === examDate),
    );
    for (const payment of payments) {
      const record = payment.feeRecord;
      const paymentExamId = record?.exam?.id ?? record?.examId;
      const paymentBranch = record?.exam?.branch;
      const selectedSubjects = record?.selectedSubjectIds || [];
      if (paymentExamId !== selectedExam ||
        (branch && String(paymentBranch || '').toLowerCase() !== branch.toLowerCase()) ||
        !record?.studentRollNumber) continue;
      for (const paper of reportSubjects) {
        if (!selectedSubjects.map(Number).includes(Number(paper.subjectId))) continue;
        const pin = record.studentRollNumber.trim();
        const id = `${paper.subjectId}-${pin.toLowerCase()}`;
        rows.set(id, {
          id,
          subject: paper.subject?.code || String(paper.subjectId),
          subjectName: paper.subject?.name || 'Subject',
          pin,
          branch: record.exam?.branch || branch || '-',
        });
      }
    }
    return [...rows.values()].sort((a, b) =>
      `${a.subject} ${a.pin}`.localeCompare(`${b.subject} ${b.pin}`),
    );
  }, [payments, selectedExam, branch, subjectId, examDate, subjects, exam]);

  function handleExamChange(value: string) {
    setSelectedExam(value ? Number(value) : null);
    setBranch('');
    setSubjectId(null);
    setExamDate('');
  }

  function handleBranchChange(value: string) {
    setBranch(value);
    setSubjectId(null);
    setExamDate('');
  }

  function handleSubjectChange(value: string) {
    const nextSubjectId = value ? Number(value) : null;
    setSubjectId(nextSubjectId);
  }

  function handleDownloadPdf() {
    if (!selectedExam) return;
    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 28;
    const tableWidth = pageWidth - margin * 2;
    const columns = [
      { label: 'PIN number', width: 92 },
      { label: 'Subject code', width: 96 },
      { label: 'Subject name', width: 232 },
      { label: 'Branch', width: tableWidth - 420 },
    ];
    const filterText = `Branch: ${branch || 'All branches'}  |  Date: ${examDate || 'All dates'}  |  ${subjectId ? `Subject: ${selectedSubject?.subject?.code || ''}` : 'All subjects'}`;

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.text(`${exam?.name || 'Subject-wise'} - Paid Students`, pageWidth / 2, 31, { align: 'center' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Subject-wise fee collection report', pageWidth / 2, 47, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.text(filterText, margin, 91);

    const drawHeader = () => {
      const headerTop = 108;
      const headerHeight = 26;
      let x = margin;
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.7);
      columns.forEach((column) => {
        doc.rect(x, headerTop, column.width, headerHeight, 'S');
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text(column.label, x + column.width / 2, headerTop + 16, { align: 'center' });
        x += column.width;
      });
      return headerTop + headerHeight;
    };

    let y = drawHeader();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    reportRows.forEach((row) => {
      const values = [row.pin, row.subject, row.subjectName, row.branch];
      const wrapped = values.map((value, index) => doc.splitTextToSize(value, columns[index].width - 10));
      const rowHeight = Math.max(24, Math.max(...wrapped.map((lines) => lines.length)) * 11 + 9);
      if (y + rowHeight > pageHeight - margin) {
        doc.addPage();
        y = 28;
        y = drawHeader();
      }
      let x = margin;
      columns.forEach((column, index) => {
        doc.setDrawColor(0, 0, 0);
        doc.rect(x, y, column.width, rowHeight, 'S');
        doc.setTextColor(0, 0, 0);
        doc.text(wrapped[index], x + 5, y + 15);
        x += column.width;
      });
      y += rowHeight;
    });
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.text(`Total paid entries: ${reportRows.length}`, margin, pageHeight - 18);
    doc.save(`subject-wise-report-${examDate}.pdf`);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Subject-wise Reports"
        description="View PIN numbers of students who paid for a selected timetable subject."
        action={<div />}
      />

      <div className="grid gap-3 rounded border border-[var(--border)] bg-white p-4 md:grid-cols-4">
        <label className="text-sm font-medium">
          Exam
          <select
            className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal"
            value={selectedExam ?? ''}
            onChange={(event) => handleExamChange(event.target.value)}
            disabled={loading}
          >
            <option value="">Select exam</option>
            {exams.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium">
          Branch
          <select
            className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal"
            value={branch}
            onChange={(event) => handleBranchChange(event.target.value)}
            disabled={!selectedExam}
          >
            <option value="">Select branch</option>
            {branches.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>

        <label className="text-sm font-medium">
          Subject
          <select
            className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal"
            value={subjectId ?? ''}
            onChange={(event) => handleSubjectChange(event.target.value)}
            disabled={!selectedExam}
          >
            <option value="">All subjects</option>
            {subjects.map((paper) => (
              <option key={paper.subjectId} value={paper.subjectId}>
                {paper.subject?.code || paper.subjectId} - {paper.subject?.name || 'Subject'}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium">
          Exam date
          <select
            className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal"
            value={examDate}
            onChange={(event) => setExamDate(event.target.value)}
            disabled={!selectedExam}
          >
            <option value="">Select date</option>
            {availableDates.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </div>

      <div className="rounded border border-[var(--border)] bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Paid student PIN numbers</h2>
            <p className="text-xs text-[var(--muted)]">
              {selectedSubject?.subject?.code
                ? `${selectedSubject.subject.code} - ${selectedSubject.subject.name || 'Subject'}`
                : 'All subjects'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{reportRows.length} paid</span>
            <button
              type="button"
              className="rounded border px-3 py-1.5 text-xs font-semibold"
              onClick={handleDownloadPdf}
              disabled={!selectedExam || paymentsLoading}
            >
              Download PDF
            </button>
          </div>
        </div>
        {!selectedExam ? (
          <EmptyState
            title="Set filters to show the data"
            description="Select an exam. Branch, subject, and exam date are optional filters."
          />
        ) : (
          <DataTable
            columns={[
              { key: 'pin', header: 'PIN number', render: (row: typeof reportRows[number]) => row.pin },
              { key: 'subject', header: 'Subject code', render: (row: typeof reportRows[number]) => row.subject },
              { key: 'subjectName', header: 'Subject name', render: (row: typeof reportRows[number]) => row.subjectName },
              { key: 'branch', header: 'Branch', render: (row: typeof reportRows[number]) => row.branch },
            ]}
            rows={reportRows}
            rowKey={(row) => String(row.id)}
            loading={paymentsLoading}
          />
        )}
      </div>
    </div>
  );
}
