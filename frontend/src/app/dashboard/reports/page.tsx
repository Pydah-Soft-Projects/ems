"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import jsPDF from 'jspdf';
import type { ExamFeeRecord, Payment } from '@/types/fee';
import type { EligibleExamStudent, Exam } from '@/types/exam';
import { formatPaymentIST } from '@/lib/formatIST';

function fmtDateISO(d: string | Date) {
  if (typeof d === 'string') {
    const dateOnly = d.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    if (dateOnly) return dateOnly;
  }
  const dt = typeof d === 'string' ? new Date(d) : d;
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function fmtMonthISO(d: string | Date) {
  if (typeof d === 'string') {
    const monthOnly = d.match(/^(\d{4}-\d{2})/)?.[1];
    if (monthOnly) return monthOnly;
  }
  const dt = typeof d === 'string' ? new Date(d) : d;
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

function paymentTimestamp(payment: Payment) {
  return payment.paidAt || payment.feeRecord?.createdAt || null;
}

function isPaidPayment(payment: Payment) {
  const paymentStatus = String(payment.status || '').toLowerCase();
  const feeStatus = String(payment.feeRecord?.status || '').toLowerCase();
  return ['success', 'paid'].includes(paymentStatus) || feeStatus === 'paid';
}

function formatReportDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatReportMonth(value: string) {
  return new Date(`${value}-01T00:00:00`).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
  });
}

function getActualAmountValue(payment: Payment) {
  const baseFee = payment.feeRecord?.baseFee;
  const totalAmount = payment.feeRecord?.totalAmount;
  const lateFee = payment.feeRecord?.lateFee;
  if (baseFee != null) return Number(baseFee);
  if (totalAmount != null && lateFee != null) return Number(totalAmount) - Number(lateFee);
  return totalAmount != null ? Number(totalAmount) : Number(payment.amountPaid || 0);
}

function getActualAmountValueFromRecord(record: {
  baseFee?: number | string;
  totalAmount?: number | string;
  lateFee?: number | string;
}) {
  const baseFee = record.baseFee;
  const totalAmount = record.totalAmount;
  const lateFee = record.lateFee;
  if (baseFee != null) return Number(baseFee);
  if (totalAmount != null && lateFee != null) return Number(totalAmount) - Number(lateFee);
  return totalAmount != null ? Number(totalAmount) : 0;
}

function formatFeeValue(value: number | string | null | undefined) {
  if (value == null || value === '') return '-';
  return String(value);
}

function parseNumber(value: number | string | null | undefined) {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}

function getConfiguredLateFee(exam?: Exam | null) {
  if (!exam?.lateFeeSlabs?.length) return 0;
  const now = new Date();
  const slabs = [...exam.lateFeeSlabs].sort(
    (a, b) => new Date(a.fromDate).getTime() - new Date(b.fromDate).getTime(),
  );
  const active = slabs
    .filter((slab) => new Date(slab.fromDate).getTime() <= now.getTime())
    .filter((slab) => !slab.toDate || new Date(slab.toDate).getTime() >= now.getTime());
  if (active.length) return Number(active[active.length - 1].amount || 0);
  const past = slabs.filter((slab) => new Date(slab.fromDate).getTime() <= now.getTime());
  return past.length ? Number(past[past.length - 1].amount || 0) : 0;
}

function getConfiguredBaseFee(exam?: Exam | null, branch?: string | null) {
  if (!exam) return null;
  const branchMatch = String(branch || exam.branch || '').trim().toLowerCase();
  if (exam.packageFees?.length) {
    const scoped = exam.packageFees.find(
      (entry) => String(entry.branch ?? '').trim().toLowerCase() === branchMatch,
    );
    if (scoped?.amount != null) return parseNumber(scoped.amount) ?? null;
  }
  return parseNumber(exam.packageFee) ?? null;
}

function getConfiguredFeeValues(exam?: Exam | null, branch?: string | null) {
  const baseFee = getConfiguredBaseFee(exam, branch);
  const lateFee = getConfiguredLateFee(exam);
  const totalAmount = baseFee != null ? baseFee + lateFee : null;
  return { baseFee, lateFee, totalAmount };
}

function getFeeRecordDisplayValues(record: ExamFeeRecord, fallbackExam: Exam | null = null) {
  const exam = record.exam ?? fallbackExam ?? null;
  const branch = record.exam?.branch ?? fallbackExam?.branch ?? null;
  const configured = getConfiguredFeeValues(exam, branch);
  const baseFee = parseNumber(record.baseFee) ?? configured.baseFee ?? 0;
  const lateFee = parseNumber(record.lateFee) ?? configured.lateFee ?? 0;
  const totalAmount = parseNumber(record.totalAmount) ?? (baseFee + lateFee);
  const actualAmount = baseFee != null ? baseFee : totalAmount - lateFee;
  return {
    baseFee,
    lateFee,
    totalAmount,
    actualAmount,
  };
}

export default function ReportsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [dueRecords, setDueRecords] = useState<ExamFeeRecord[]>([]);
  const [eligibleStudents, setEligibleStudents] = useState<(EligibleExamStudent & { examId: number })[]>([]);
  const [dueLoading, setDueLoading] = useState(false);
  const [dueBackgroundLoading, setDueBackgroundLoading] = useState(false);
  const [dueFilterLoading, setDueFilterLoading] = useState(false);
  const [eligibleLoading, setEligibleLoading] = useState(false);
  const [duePage, setDuePage] = useState(1);
  const [duePageSize, setDuePageSize] = useState(50);
  const [tab, setTab] = useState<'day' | 'month' | 'due'>('day');
  const [selectedDate, setSelectedDate] = useState(() => fmtDateISO(new Date()));
  const [selectedMonth, setSelectedMonth] = useState(() => fmtMonthISO(new Date()));
  const DUE_PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExam, setSelectedExam] = useState<number | null>(null);
  const [branchFilter, setBranchFilter] = useState<string>('');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<'all' | 'cash' | 'upi'>('all');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    api
      .getPayments()
      .then((rows) => {
        if (!mounted) return;
        // only paid payments or fee records marked as paid
        const paid = (rows || []).filter(isPaidPayment);
        setPayments(paid);
        const latestPaidAt = paid
          .filter((payment) => paymentTimestamp(payment))
          .sort((a, b) => new Date(String(paymentTimestamp(b))).getTime() - new Date(String(paymentTimestamp(a))).getTime())[0];
        if (latestPaidAt) {
          setSelectedDate(fmtDateISO(String(paymentTimestamp(latestPaidAt))));
          setSelectedMonth(fmtMonthISO(String(paymentTimestamp(latestPaidAt))));
        }
      })
      .catch(() => {
        setPayments([]);
      })
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    setDueLoading(true);

    const fetchPage = async (page: number) => {
      return api.getFeeRecords({ status: 'pending', page, limit: 50, examId: selectedExam ?? undefined });
    };

    const loadDueRecords = async () => {
      try {
        const firstPage = await fetchPage(1);
        if (!mounted) return;
        setDueRecords(firstPage || []);

        if ((firstPage?.length ?? 0) < 50) {
          return;
        }

        setDueBackgroundLoading(true);
        let nextPage = 2;
        while (mounted) {
          const nextPageRows = await fetchPage(nextPage);
          if (!mounted) return;
          if (!nextPageRows?.length) break;
          setDueRecords((prev) => {
            const existingIds = new Set(prev.map((record) => record.id));
            return [...prev, ...nextPageRows.filter((record) => !existingIds.has(record.id))];
          });
          if (nextPageRows.length < 50) break;
          nextPage += 1;
        }
      } catch {
        if (mounted) setDueRecords([]);
      } finally {
        if (mounted) {
          setDueLoading(false);
          setDueBackgroundLoading(false);
        }
      }
    };

    void loadDueRecords();
    return () => {
      mounted = false;
    };
  }, [selectedExam]);

  useEffect(() => {
    setDuePage(1);
    if (tab === 'due') {
      setDueFilterLoading(true);
      const timer = window.setTimeout(() => setDueFilterLoading(false), 150);
      return () => window.clearTimeout(timer);
    }
    setDueFilterLoading(false);
    return undefined;
  }, [selectedExam, branchFilter, tab]);

  useEffect(() => {
    setDuePage(1);
  }, [duePageSize]);

  useEffect(() => {
    let mounted = true;
    const loadEligibleStudents = async () => {
      if (!exams.length) {
        setEligibleStudents([]);
        return;
      }
      setEligibleLoading(true);
      try {
        if (selectedExam) {
          const res = await api.getExamEligibleStudents(selectedExam);
          if (!mounted) return;
          setEligibleStudents(
            (res.students || []).map((student) => ({
              ...student,
              examId: selectedExam,
            })),
          );
          return;
        }

        const allStudents = await Promise.all(
          exams.map(async (exam) => {
            const res = await api.getExamEligibleStudents(exam.id);
            return (res.students || []).map((student) => ({
              ...student,
              examId: exam.id,
            }));
          }),
        );
        if (!mounted) return;
        setEligibleStudents(allStudents.flat());
      } catch {
        if (mounted) setEligibleStudents([]);
      } finally {
        if (mounted) setEligibleLoading(false);
      }
    };

    void loadEligibleStudents();
    return () => {
      mounted = false;
    };
  }, [selectedExam, exams]);

  useEffect(() => {
    let mounted = true;
    api
      .getExams()
      .then((rows) => {
        if (!mounted) return;
        setExams(rows || []);
      })
      .catch(() => {})
      .finally(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const selectedExamObject = useMemo(
    () => exams.find((ex) => ex.id === selectedExam) ?? null,
    [exams, selectedExam],
  );

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      const paidAt = paymentTimestamp(p);
      if (tab !== 'due' && !paidAt) return false;
      if (tab === 'day' && fmtDateISO(paidAt as string) !== selectedDate) return false;
      if (tab === 'month' && fmtMonthISO(paidAt as string) !== selectedMonth) return false;
      const examId = p.feeRecord?.exam?.id ?? p.feeRecord?.examId;
      if (selectedExam && examId !== selectedExam) return false;
      if (branchFilter) {
        const branchValue = p.feeRecord?.exam?.branch;
        if (String(branchValue || '').toLowerCase() !== branchFilter.toLowerCase()) return false;
      }
      if (
        paymentMethodFilter !== 'all' &&
        String(p.paymentMethod || '').toLowerCase() !== paymentMethodFilter
      ) return false;
      return true;
    });
  }, [payments, selectedExam, branchFilter, paymentMethodFilter, selectedDate, selectedMonth, tab]);

  const filteredDueRecords = useMemo(() => {
    const paidRolls = new Set(
      payments
        .filter(isPaidPayment)
        .map((payment) => payment.feeRecord?.studentRollNumber?.trim().toLowerCase())
        .filter((roll): roll is string => Boolean(roll)),
    );
    const unpaidRecords = dueRecords.filter((record) => {
      if (paidRolls.has(record.studentRollNumber.trim().toLowerCase())) return false;
      if (selectedExam && record.examId !== selectedExam) return false;
      if (branchFilter) {
        const branchValue = record.exam?.branch;
        if (String(branchValue || '').toLowerCase() !== branchFilter.toLowerCase()) return false;
      }
      return true;
    });

    const unpaidRolls = new Set(unpaidRecords.map((record) => record.studentRollNumber.toLowerCase()));
    const eligibleUnpaid = eligibleStudents.filter((student) => {
      const roll = student.rollNumber.trim().toLowerCase();
      if (unpaidRolls.has(roll) || paidRolls.has(roll)) return false;
      if (selectedExam && student.examId !== selectedExam) return false;
      if (branchFilter) {
        const branchValue = String(student.branch || '').toLowerCase();
        if (branchValue !== branchFilter.toLowerCase()) return false;
      }
      return true;
    });

    const eligibleUnpaidRecords = eligibleUnpaid.map((student, index) => {
      const exam = exams.find((ex) => ex.id === student.examId);
      const configured = getConfiguredFeeValues(exam, student.branch);
      return {
        id: Number(`99${student.examId}${index}`),
        examId: student.examId,
        studentRollNumber: student.rollNumber,
        studentName: student.name,
        selectedSubjectIds: [],
        feeBreakdown: [],
        baseFee: configured.baseFee ?? 0,
        lateFee: configured.lateFee ?? 0,
        totalAmount: configured.totalAmount ?? 0,
        status: 'pending' as const,
        dueDate: null,
        createdAt: '',
        exam: exam ?? undefined,
      } as ExamFeeRecord;
    });

    return [...unpaidRecords, ...eligibleUnpaidRecords];
  }, [dueRecords, branchFilter, eligibleStudents, exams, payments, selectedExam]);

  const paymentColumns = useMemo(
    () => [
      {
        key: 'paidAt',
        header: tab === 'day' ? 'Paid Date' : 'Paid Month',
        render: (r: Payment) => {
          const paidAt = paymentTimestamp(r);
          return paidAt
            ? tab === 'day'
              ? formatPaymentIST(paidAt)
              : fmtMonthISO(paidAt)
            : '-';
        },
      },
      { key: 'student', header: 'Student', render: (r: Payment) => r.feeRecord?.studentName || '-' },
      { key: 'roll', header: 'Roll', render: (r: Payment) => r.feeRecord?.studentRollNumber || '-' },
      {
        key: 'amount',
        header: 'Actual amount',
        render: (r: Payment) => formatFeeValue(getActualAmountValue(r)),
      },
      { key: 'lateFee', header: 'Late fee', render: (r: Payment) => formatFeeValue(r.feeRecord?.lateFee ?? '-') },
      { key: 'method', header: 'Method', render: (r: Payment) => String(r.paymentMethod) },
      { key: 'txn', header: 'Transaction', render: (r: Payment) => r.transactionReference || '-' },
      { key: 'receipt', header: 'Receipt', render: (r: Payment) => r.receiptNumber || '-' },
    ],
    [tab],
  );

  const dueColumns = useMemo(
    () => [
      {
        key: 'dueAt',
        header: 'Due Date',
        render: (r: ExamFeeRecord) =>
          r.dueDate ? new Date(r.dueDate).toLocaleDateString() : '-',
      },
      { key: 'exam', header: 'Exam', render: (r: ExamFeeRecord) => r.exam?.name || '-' },
      { key: 'student', header: 'Student', render: (r: ExamFeeRecord) => r.studentName || '-' },
      { key: 'roll', header: 'Roll', render: (r: ExamFeeRecord) => r.studentRollNumber || '-' },
      {
        key: 'applied',
        header: 'Fee applied',
        render: (r: ExamFeeRecord) => {
          const exam = r.exam ?? exams.find((ex) => ex.id === r.examId) ?? null;
          return formatFeeValue(getFeeRecordDisplayValues(r, exam).totalAmount);
        },
      },
      {
        key: 'amount',
        header: 'Actual amount',
        render: (r: ExamFeeRecord) => {
          const exam = r.exam ?? exams.find((ex) => ex.id === r.examId) ?? null;
          return formatFeeValue(getFeeRecordDisplayValues(r, exam).actualAmount);
        },
      },
      {
        key: 'lateFee',
        header: 'Late fee',
        render: (r: ExamFeeRecord) => {
          const exam = r.exam ?? exams.find((ex) => ex.id === r.examId) ?? null;
          return formatFeeValue(getFeeRecordDisplayValues(r, exam).lateFee);
        },
      },
      { key: 'status', header: 'Status', render: (r: ExamFeeRecord) => String(r.status) },
    ],
    [],
  );

  const branchOptions = useMemo(() => {
    const set = new Set<string>();
    const sources = selectedExamObject ? [selectedExamObject] : exams;
    for (const exam of sources) {
      if (exam.branch) set.add(exam.branch);
      for (const scope of exam.scopes || []) {
        if (scope.branch) set.add(scope.branch);
      }
    }
    return Array.from(set).sort();
  }, [exams, selectedExamObject]);

  const totalDueCount = filteredDueRecords.length;
  const pageCount = Math.max(1, Math.ceil(totalDueCount / duePageSize));
  const displayedDueRecords = useMemo(() => {
    const start = (duePage - 1) * duePageSize;
    return filteredDueRecords.slice(start, start + duePageSize);
  }, [filteredDueRecords, duePage, duePageSize]);

  useEffect(() => {
    if (duePage > pageCount) {
      setDuePage(pageCount);
    }
  }, [duePage, pageCount]);

  const isDueInitialLoading = dueLoading || dueFilterLoading || eligibleLoading;

  const displayedPayments = filteredPayments;

  function handleDownloadPdf() {
    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const xStart = margin;
    const xEnd = pageWidth - margin;
    const reportPeriod = tab === 'day'
      ? `Day wise - ${formatReportDate(selectedDate)}`
      : tab === 'month'
      ? `Month wise - ${formatReportMonth(selectedMonth)}`
      : 'Pending dues';
    const title = tab === 'due' ? 'Due Report' : `Payment Report - ${reportPeriod}`;
    const lineHeight = 18;

    const filters: string[] = [];
    if (selectedExamObject) {
      filters.push(`Exam: ${selectedExamObject.name}`);
    }
    if (branchFilter) {
      filters.push(`Branch: ${branchFilter}`);
    }
    if (paymentMethodFilter !== 'all') {
      filters.push(`Method: ${paymentMethodFilter.toUpperCase()}`);
    }
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(title, pageWidth / 2, 50, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    filters.forEach((line, index) => {
      doc.text(line, xStart, 76 + index * lineHeight);
    });

    let y = 76 + filters.length * lineHeight + 14;
    y += 4;

    const dueRows: Array<Record<string, string>> = filteredDueRecords.map((r) => ({
      student: r.studentName ?? '-',
      roll: r.studentRollNumber ?? '-',
      exam: r.exam?.name ?? '-',
      applied: formatFeeValue(getFeeRecordDisplayValues(r).totalAmount),
      amount: formatFeeValue(getFeeRecordDisplayValues(r).actualAmount),
      lateFee: formatFeeValue(getFeeRecordDisplayValues(r).lateFee),
      status: String(r.status),
      dueDate: r.dueDate ? new Date(r.dueDate).toLocaleDateString() : '-',
    }));

    const paidRows: Array<Record<string, string>> = filteredPayments.map((p) => ({
      student: p.feeRecord?.studentName ?? '-',
      roll: p.feeRecord?.studentRollNumber ?? '-',
      amount: formatFeeValue(getActualAmountValue(p)),
      lateFee: formatFeeValue(p.feeRecord?.lateFee ?? '-'),
      method: String(p.paymentMethod),
      paidAt: paymentTimestamp(p) ? formatPaymentIST(paymentTimestamp(p) as string) : '-',
    }));

    const dueColumns = [
      { key: 'student', label: 'Student', width: 88 },
      { key: 'roll', label: 'Roll', width: 52 },
      { key: 'exam', label: 'Exam', width: 82 },
      { key: 'applied', label: 'Fee applied', width: 58 },
      { key: 'amount', label: 'Actual amount', width: 62 },
      { key: 'lateFee', label: 'Late Fee', width: 52 },
      { key: 'status', label: 'Status', width: 52 },
      { key: 'dueDate', label: 'Due Date', width: 64 },
    ];

    const paidColumns = [
      { key: 'student', label: 'Student', width: 140 },
      { key: 'roll', label: 'Roll', width: 65 },
      { key: 'amount', label: 'Amount', width: 65 },
      { key: 'lateFee', label: 'Late Fee', width: 65 },
      { key: 'method', label: 'Method', width: 75 },
      { key: 'paidAt', label: 'Paid At', width: 110 },
    ];

    const baseColumns = tab === 'due' ? dueColumns : paidColumns;
    const widthScale = (xEnd - xStart) / baseColumns.reduce(
      (total, column) => total + column.width,
      0,
    );
    const selectedColumns = baseColumns.map((column) => ({
      ...column,
      width: column.width * widthScale,
    }));
    const selectedRows = tab === 'due' ? dueRows : paidRows;

    const renderTableHeader = () => {
      let x = xStart;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      const wrappedHeaders = selectedColumns.map((column) =>
        doc.splitTextToSize(column.label, column.width - 4),
      );
      const headerLineCount = Math.max(...wrappedHeaders.map((lines) => lines.length));
      const headerTop = y - 10;
      const headerHeight = headerLineCount * lineHeight + 10;
      selectedColumns.forEach((column) => {
        const columnIndex = selectedColumns.indexOf(column);
        wrappedHeaders[columnIndex].forEach((line: string, lineIndex: number) => {
          doc.text(
            line,
            x + column.width / 2,
            headerTop + 10 + lineIndex * lineHeight,
            { align: 'center' },
          );
        });
        doc.rect(x, headerTop, column.width, headerHeight);
        x += column.width;
      });
      y = headerTop + headerHeight + 10;
      doc.setFont('helvetica', 'normal');
    };

    const addPageWithHeader = () => {
      doc.addPage();
      y = margin;
      renderTableHeader();
    };

    renderTableHeader();

    for (const row of selectedRows) {
      const cells = selectedColumns.map((column) => String(row[column.key] ?? ''));
      const wrappedCells = cells.map((value, index) =>
        doc.splitTextToSize(value, selectedColumns[index].width - 4),
      );
      const maxLines = Math.max(...wrappedCells.map((lines) => lines.length));
      const rowHeight = maxLines * lineHeight + 8;
      let rowTop = y - 10;
      let rowBottom = rowTop + rowHeight;

      if (rowBottom > pageHeight - margin) {
        addPageWithHeader();
        rowTop = y - 10;
        rowBottom = rowTop + rowHeight;
      }

      let x = xStart;
      doc.setFontSize(8);
      for (let lineIndex = 0; lineIndex < maxLines; lineIndex += 1) {
        for (let columnIndex = 0; columnIndex < selectedColumns.length; columnIndex += 1) {
          const value = wrappedCells[columnIndex][lineIndex] ?? '';
          doc.text(value, x + selectedColumns[columnIndex].width / 2, y, {
            align: 'center',
          });
          x += selectedColumns[columnIndex].width;
        }
        y += lineHeight;
        x = xStart;
      }

      doc.setDrawColor(60);
      let xBorder = xStart;
      selectedColumns.forEach((column) => {
        doc.rect(xBorder, rowTop, column.width, rowBottom - rowTop);
        xBorder += column.width;
      });
      y += 8;
    }

    doc.save(`payment-report-${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`);
  }

  const columns = [
    { key: 'student', header: 'Student', render: (r: Payment) => r.feeRecord?.studentName || '-' },
    { key: 'roll', header: 'Roll', render: (r: Payment) => r.feeRecord?.studentRollNumber || '-' },
    { key: 'amount', header: 'Amount', render: (r: Payment) => String(r.feeRecord?.totalAmount ?? r.amountPaid ?? '-') },
    { key: 'lateFee', header: 'Late fee', render: (r: Payment) => String(r.feeRecord?.lateFee ?? '-') },
    { key: 'method', header: 'Method', render: (r: Payment) => String(r.paymentMethod) },
    { key: 'txn', header: 'Transaction', render: (r: Payment) => r.transactionReference || '-' },
    { key: 'receipt', header: 'Receipt', render: (r: Payment) => r.receiptNumber || '-' },
    {
      key: 'paidAt',
      header: 'Paid At',
      render: (r: Payment) => {
        const paidAt = paymentTimestamp(r);
        return paidAt ? formatPaymentIST(paidAt) : '-';
      },
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={tab === 'day'
          ? `Payment Reports - Day wise - ${formatReportDate(selectedDate)}`
          : tab === 'month'
          ? `Payment Reports - Month wise - ${formatReportMonth(selectedMonth)}`
          : 'Payment Reports - Pending dues'}
        description="Students who paid fees, view day-wise or month-wise and download Report."
        action={<div />}
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <select
            className="rounded border px-3 py-2 text-sm"
            value={selectedExam ?? ''}
            onChange={(e) => setSelectedExam(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Select exam</option>
            {exams.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.name} — {ex.course} / {ex.branch}
              </option>
            ))}
          </select>

          <select
            className="rounded border px-3 py-2 text-sm"
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
          >
            <option value="">All branches</option>
            {branchOptions.map((branch) => (
              <option key={branch} value={branch}>
                {branch}
              </option>
            ))}
          </select>

          {tab !== 'due' ? (
            <select
              className="rounded border px-3 py-2 text-sm"
              value={paymentMethodFilter}
              onChange={(e) => setPaymentMethodFilter(e.target.value as 'all' | 'cash' | 'upi')}
            >
              <option value="all">All payment methods</option>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
            </select>
          ) : null}

          {tab === 'day' ? (
            <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
              Date
              <input
                type="date"
                className="rounded border px-3 py-2 text-sm text-[var(--foreground)]"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </label>
          ) : null}

          {tab === 'month' ? (
            <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
              Month
              <input
                type="month"
                className="rounded border px-3 py-2 text-sm text-[var(--foreground)]"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              />
            </label>
          ) : null}

        </div>

        <div className="flex items-center gap-2">
          <Tabs
            items={[
              { id: 'day', label: 'Day wise' },
              { id: 'month', label: 'Month wise' },
              { id: 'due', label: 'Due' },
            ]}
            activeId={tab}
            onChange={(id) => setTab(id as any)}
          />
          <Button variant="secondary" onClick={handleDownloadPdf}>
            Download PDF
          </Button>
        </div>
      </div>

      <div>
        <div className="mb-6">
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-sm font-semibold">
              {tab === 'due'
                ? 'Pending due students'
                : tab === 'day'
                ? 'Day-wise payments'
                : 'Month-wise payments'}{' '}
              — {tab === 'due' ? displayedDueRecords.length : displayedPayments.length}{' '}
              {tab === 'due' ? 'dues' : 'payments'}
            </h3>
            <div className="text-sm text-[var(--muted)]">
              Total amount: {tab === 'due'
                ? filteredDueRecords.reduce((s, r) => s + getActualAmountValueFromRecord(r), 0)
                : displayedPayments.reduce((s, p) => s + Number(getActualAmountValue(p) || 0), 0)}
            </div>
          </div>
          {tab === 'due' ? (
            <DataTable<ExamFeeRecord>
              columns={dueColumns}
              rows={displayedDueRecords}
              rowKey={(r) => String(r.id)}
              loading={dueLoading || dueFilterLoading || eligibleLoading}
              monochrome
            />
          ) : (
            <DataTable<Payment>
              columns={paymentColumns}
              rows={displayedPayments}
              rowKey={(r) => String(r.id)}
              loading={loading}
              monochrome
              footer={
                <tr className="font-semibold">
                  <td colSpan={3} className="px-4 py-3 text-right">
                    Total fee collected
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    ₹{displayedPayments.reduce(
                      (total, payment) => total + Number(getActualAmountValue(payment) || 0),
                      0,
                    )}
                  </td>
                  <td colSpan={paymentColumns.length - 4} className="px-4 py-3" />
                </tr>
              }
            />
          )}

          {tab === 'due' && dueBackgroundLoading ? (
            <div className="mt-3 text-sm text-[var(--muted)]">
              Loading more due records in the background...
            </div>
          ) : null}

          {tab === 'due' && !isDueInitialLoading && !dueBackgroundLoading && totalDueCount > 0 ? (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-[var(--muted)]">
                Showing {Math.min((duePage - 1) * duePageSize + 1, totalDueCount)} -{' '}
                {Math.min(duePage * duePageSize, totalDueCount)} of {totalDueCount} dues
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label className="text-sm text-[var(--muted)]">
                  Page size:{' '}
                  <select
                    className="ml-2 rounded border px-2 py-1 text-sm"
                    value={duePageSize}
                    onChange={(e) => setDuePageSize(Number(e.target.value))}
                  >
                    {DUE_PAGE_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    disabled={duePage <= 1 || dueLoading || dueFilterLoading}
                    onClick={() => setDuePage((prev) => Math.max(prev - 1, 1))}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-[var(--muted)]">
                    Page {duePage} of {pageCount}
                  </span>
                  <Button
                    variant="secondary"
                    disabled={duePage >= pageCount || dueLoading || dueFilterLoading}
                    onClick={() => setDuePage((prev) => Math.min(prev + 1, pageCount))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

      </div>

    </div>
  );
}
