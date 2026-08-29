"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { downloadPaymentReportPdf } from '@/lib/printPaymentReport';
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
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, y, m, d] = match;
    const dt = new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0);
    return dt.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
  return new Date(value).toLocaleDateString(undefined, {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatReportMonth(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})/);
  if (match) {
    const [, y, m] = match;
    const dt = new Date(Number(y), Number(m) - 1, 1, 12, 0, 0);
    return dt.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
    });
  }
  return new Date(`${value}-01T12:00:00`).toLocaleDateString(undefined, {
    timeZone: 'Asia/Kolkata',
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

function formatReportMoney(value: number) {
  return Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function paymentMethodLabel(method: string | null | undefined) {
  const value = String(method || '').trim().toLowerCase();
  if (value === 'upi') return 'UPI';
  if (value === 'self_online') return 'Self online';
  if (value === 'cash') return 'Cash';
  if (value === 'bank_transfer') return 'Bank transfer';
  if (value === 'net_banking') return 'Net banking';
  if (value === 'debit_card') return 'Debit card';
  if (value === 'credit_card') return 'Credit card';
  return value ? String(method) : 'Other';
}

function findEligibleBranch(
  eligibleStudents: (EligibleExamStudent & { examId: number })[],
  examId: number | undefined,
  rollNumber: string | null | undefined,
) {
  if (!examId || !rollNumber) return null;
  const roll = rollNumber.trim().toLowerCase();
  return (
    eligibleStudents.find(
      (student) =>
        student.examId === examId && student.rollNumber.trim().toLowerCase() === roll,
    )?.branch ?? null
  );
}

function resolveReportBranch(options: {
  exam?: Exam | null;
  examId?: number;
  rollNumber?: string | null;
  applicationBranch?: string | null;
  eligibleBranch?: string | null;
}) {
  const fromApplication = options.applicationBranch?.trim();
  if (fromApplication) return fromApplication;
  const fromEligible = options.eligibleBranch?.trim();
  if (fromEligible) return fromEligible;
  const fromExam = options.exam?.branch?.trim();
  if (fromExam) return fromExam;
  return 'Unassigned';
}

function paymentReportBranch(
  payment: Payment,
  eligibleStudents: (EligibleExamStudent & { examId: number })[],
) {
  const examId = payment.feeRecord?.exam?.id ?? payment.feeRecord?.examId;
  return resolveReportBranch({
    exam: payment.feeRecord?.exam,
    examId,
    rollNumber: payment.feeRecord?.studentRollNumber,
    applicationBranch: payment.feeRecord?.application?.studentBranch,
    eligibleBranch: findEligibleBranch(
      eligibleStudents,
      examId,
      payment.feeRecord?.studentRollNumber,
    ),
  });
}

function dueReportBranch(
  record: ExamFeeRecord,
  eligibleStudents: (EligibleExamStudent & { examId: number })[],
) {
  return resolveReportBranch({
    exam: record.exam,
    examId: record.examId,
    rollNumber: record.studentRollNumber,
    applicationBranch: record.application?.studentBranch,
    eligibleBranch: findEligibleBranch(eligibleStudents, record.examId, record.studentRollNumber),
  });
}

function getCollectedAmount(payment: Payment) {
  return Number(getActualAmountValue(payment) || 0) + Number(payment.feeRecord?.lateFee || 0);
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
        const branchValue = paymentReportBranch(p, eligibleStudents);
        if (branchValue.toLowerCase() !== branchFilter.toLowerCase()) return false;
      }
      if (
        paymentMethodFilter !== 'all' &&
        String(p.paymentMethod || '').toLowerCase() !== paymentMethodFilter
      ) return false;
      return true;
    });
  }, [payments, selectedExam, branchFilter, paymentMethodFilter, selectedDate, selectedMonth, tab, eligibleStudents]);

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
        const branchValue = dueReportBranch(record, eligibleStudents);
        if (branchValue.toLowerCase() !== branchFilter.toLowerCase()) return false;
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
        render: (r: ExamFeeRecord) => {
          if (!r.dueDate) return '-';
          const match = String(r.dueDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
          if (match) {
            const [, y, m, d] = match;
            return new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0).toLocaleDateString();
          }
          return new Date(r.dueDate).toLocaleDateString();
        },
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
    const isDue = tab === 'due';
    const reportPeriod =
      tab === 'day'
        ? `Day wise - ${formatReportDate(selectedDate)}`
        : tab === 'month'
          ? `Month wise - ${formatReportMonth(selectedMonth)}`
          : 'Pending dues';
    const documentTitle = isDue ? 'Due Report' : 'Payment Report';
    const generatedAt = `${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`;

    const collegeFromRows = isDue
      ? filteredDueRecords.map((record) => record.exam?.college).filter(Boolean)
      : filteredPayments.map((payment) => payment.feeRecord?.exam?.college).filter(Boolean);
    const collegeName =
      selectedExamObject?.college?.trim() ||
      String(collegeFromRows[0] || '').trim() ||
      exams.find((exam) => exam.college?.trim())?.college?.trim() ||
      'Examination Management System';

    const filters: string[] = [];
    filters.push(selectedExamObject ? `Exam: ${selectedExamObject.name}` : 'Exam: All examinations');
    filters.push(branchFilter ? `Branch: ${branchFilter}` : 'Branch: All branches');
    if (!isDue) {
      filters.push(
        paymentMethodFilter !== 'all'
          ? `Method: ${paymentMethodLabel(paymentMethodFilter)}`
          : 'Method: All payment methods',
      );
    }

    const includeExamColumn = !selectedExam;
    const sortBranchKeys = (a: string, b: string) => {
      if (a === 'Unassigned') return 1;
      if (b === 'Unassigned') return -1;
      return a.localeCompare(b);
    };

    if (isDue) {
      const totalActual = filteredDueRecords.reduce(
        (sum, record) => sum + getFeeRecordDisplayValues(record).actualAmount,
        0,
      );
      const totalLate = filteredDueRecords.reduce(
        (sum, record) => sum + getFeeRecordDisplayValues(record).lateFee,
        0,
      );
      const lateCount = filteredDueRecords.filter(
        (record) => getFeeRecordDisplayValues(record).lateFee > 0,
      ).length;

      const examTotals = new Map<string, { count: number; amount: number; lateFee: number }>();
      for (const record of filteredDueRecords) {
        const examName = record.exam?.name || 'Unspecified examination';
        const current = examTotals.get(examName) || { count: 0, amount: 0, lateFee: 0 };
        const display = getFeeRecordDisplayValues(record);
        current.count += 1;
        current.amount += display.actualAmount + display.lateFee;
        current.lateFee += display.lateFee;
        examTotals.set(examName, current);
      }

      const branchGroups = new Map<string, ExamFeeRecord[]>();
      for (const record of filteredDueRecords) {
        const branch = dueReportBranch(record, eligibleStudents);
        const rows = branchGroups.get(branch) || [];
        rows.push(record);
        branchGroups.set(branch, rows);
      }

      const dueDetailColumns = [
        { key: 'sno', label: 'S.No', width: 32 },
        { key: 'student', label: 'Student', width: includeExamColumn ? 90 : 120 },
        { key: 'roll', label: 'Roll', width: 68 },
        ...(includeExamColumn ? [{ key: 'exam', label: 'Exam', width: 90 }] : []),
        { key: 'amount', label: 'Actual amount', width: 62 },
        { key: 'lateFee', label: 'Late fee', width: 50 },
        { key: 'status', label: 'Status', width: 50 },
        { key: 'dueDate', label: 'Due date', width: 68 },
      ];

      downloadPaymentReportPdf({
        collegeName,
        documentTitle,
        periodLabel: reportPeriod,
        generatedAt,
        filters,
        transactionSummaryTitle: 'Due summary',
        transactionSummary: [
          {
            particular: 'Pending dues',
            count: String(filteredDueRecords.length),
            amount: formatReportMoney(totalActual),
          },
          {
            particular: 'Late fee pending',
            count: String(lateCount),
            amount: formatReportMoney(totalLate),
          },
          {
            particular: 'Total due',
            count: String(filteredDueRecords.length),
            amount: formatReportMoney(totalActual + totalLate),
          },
        ],
        examSummary: selectedExam
          ? null
          : [
              ...[...examTotals.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([exam, totals]) => ({
                  exam,
                  count: String(totals.count),
                  amount: formatReportMoney(totals.amount),
                  lateFee: formatReportMoney(totals.lateFee),
                })),
              {
                exam: 'Total',
                count: String(filteredDueRecords.length),
                amount: formatReportMoney(totalActual + totalLate),
                lateFee: formatReportMoney(totalLate),
              },
            ],
        branchSections: [...branchGroups.entries()]
          .sort(([a], [b]) => sortBranchKeys(a, b))
          .map(([branch, records]) => {
            const sorted = [...records].sort((a, b) =>
              `${a.studentRollNumber} ${a.studentName}`.localeCompare(
                `${b.studentRollNumber} ${b.studentName}`,
              ),
            );
            const branchActual = sorted.reduce(
              (sum, record) => sum + getFeeRecordDisplayValues(record).actualAmount,
              0,
            );
            const branchLate = sorted.reduce(
              (sum, record) => sum + getFeeRecordDisplayValues(record).lateFee,
              0,
            );
            return {
              branch,
              columns: dueDetailColumns,
              rows: sorted.map((record, index) => {
                const display = getFeeRecordDisplayValues(record);
                const dueDate = record.dueDate
                  ? (() => {
                      const match = String(record.dueDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
                      if (match) {
                        const [, year, month, day] = match;
                        return new Date(
                          Number(year),
                          Number(month) - 1,
                          Number(day),
                          12,
                          0,
                          0,
                        ).toLocaleDateString('en-IN');
                      }
                      return new Date(record.dueDate).toLocaleDateString('en-IN');
                    })()
                  : '-';
                return {
                  sno: String(index + 1),
                  student: record.studentName || '-',
                  roll: record.studentRollNumber || '-',
                  exam: record.exam?.name || '-',
                  amount: formatReportMoney(display.actualAmount),
                  lateFee: formatReportMoney(display.lateFee),
                  status: String(record.status),
                  dueDate,
                };
              }),
              footer: `Branch total: ${sorted.length} dues    Rs. ${formatReportMoney(branchActual + branchLate)}`,
            };
          }),
        grandTotal: `Grand total: ${filteredDueRecords.length} dues    Rs. ${formatReportMoney(totalActual + totalLate)}`,
        fileName: `due-report-${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`,
      });
      return;
    }

    const methodTotals = new Map<string, { count: number; amount: number }>();
    let totalCollected = 0;
    let totalLate = 0;
    let lateCount = 0;
    for (const payment of filteredPayments) {
      const method = paymentMethodLabel(payment.paymentMethod);
      const current = methodTotals.get(method) || { count: 0, amount: 0 };
      const collected = getCollectedAmount(payment);
      current.count += 1;
      current.amount += collected;
      methodTotals.set(method, current);
      totalCollected += collected;
      const lateFee = Number(payment.feeRecord?.lateFee || 0);
      totalLate += lateFee;
      if (lateFee > 0) lateCount += 1;
    }

    const examTotals = new Map<string, { count: number; amount: number; lateFee: number }>();
    for (const payment of filteredPayments) {
      const examName = payment.feeRecord?.exam?.name || 'Unspecified examination';
      const current = examTotals.get(examName) || { count: 0, amount: 0, lateFee: 0 };
      current.count += 1;
      current.amount += getCollectedAmount(payment);
      current.lateFee += Number(payment.feeRecord?.lateFee || 0);
      examTotals.set(examName, current);
    }

    const branchGroups = new Map<string, Payment[]>();
    for (const payment of filteredPayments) {
      const branch = paymentReportBranch(payment, eligibleStudents);
      const rows = branchGroups.get(branch) || [];
      rows.push(payment);
      branchGroups.set(branch, rows);
    }

    const paidDetailColumns = [
      { key: 'sno', label: 'S.No', width: 28 },
      { key: 'student', label: 'Student', width: includeExamColumn ? 88 : 118 },
      { key: 'roll', label: 'Roll', width: 68 },
      ...(includeExamColumn ? [{ key: 'exam', label: 'Exam', width: 86 }] : []),
      { key: 'amount', label: 'Amount', width: 58 },
      { key: 'lateFee', label: 'Late fee', width: 48 },
      { key: 'method', label: 'Method', width: 50 },
      { key: 'paidAt', label: 'Paid at', width: 92 },
    ];

    downloadPaymentReportPdf({
      collegeName,
      documentTitle,
      periodLabel: reportPeriod,
      generatedAt,
      filters,
      transactionSummaryTitle: 'Transaction summary',
      transactionSummary: [
        ...[...methodTotals.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([method, totals]) => ({
            particular: method,
            count: String(totals.count),
            amount: formatReportMoney(totals.amount),
          })),
        {
          particular: 'Late fee (included above)',
          count: String(lateCount),
          amount: formatReportMoney(totalLate),
        },
        {
          particular: 'Total collections',
          count: String(filteredPayments.length),
          amount: formatReportMoney(totalCollected),
        },
      ],
      examSummary: selectedExam
        ? null
        : [
            ...[...examTotals.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([exam, totals]) => ({
                exam,
                count: String(totals.count),
                amount: formatReportMoney(totals.amount),
                lateFee: formatReportMoney(totals.lateFee),
              })),
            {
              exam: 'Total',
              count: String(filteredPayments.length),
              amount: formatReportMoney(totalCollected),
              lateFee: formatReportMoney(totalLate),
            },
          ],
      branchSections: [...branchGroups.entries()]
        .sort(([a], [b]) => sortBranchKeys(a, b))
        .map(([branch, records]) => {
          const sorted = [...records].sort((a, b) =>
            `${a.feeRecord?.studentRollNumber || ''} ${a.feeRecord?.studentName || ''}`.localeCompare(
              `${b.feeRecord?.studentRollNumber || ''} ${b.feeRecord?.studentName || ''}`,
            ),
          );
          const branchTotal = sorted.reduce((sum, payment) => sum + getCollectedAmount(payment), 0);
          return {
            branch,
            columns: paidDetailColumns,
            rows: sorted.map((payment, index) => ({
              sno: String(index + 1),
              student: payment.feeRecord?.studentName || '-',
              roll: payment.feeRecord?.studentRollNumber || '-',
              exam: payment.feeRecord?.exam?.name || '-',
              amount: formatReportMoney(getActualAmountValue(payment)),
              lateFee: formatReportMoney(Number(payment.feeRecord?.lateFee || 0)),
              method: paymentMethodLabel(payment.paymentMethod),
              paidAt: paymentTimestamp(payment)
                ? formatPaymentIST(paymentTimestamp(payment) as string)
                : '-',
            })),
            footer: `Branch total: ${sorted.length} payments    Rs. ${formatReportMoney(branchTotal)}`,
          };
        }),
      grandTotal: `Grand total: ${filteredPayments.length} payments    Rs. ${formatReportMoney(totalCollected)}`,
      fileName: `payment-report-${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`,
    });
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
