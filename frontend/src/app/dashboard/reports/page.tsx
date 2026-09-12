"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { downloadPaymentReportPdf } from '@/lib/printPaymentReport';
import { downloadPaymentReportExcel } from '@/lib/exportPaymentReportExcel';
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

function isSupplyExamType(type?: string | null) {
  const t = String(type || '').toLowerCase();
  return t === 'supply' || t === 'special_supply' || t === 'improvement';
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

  // 1. Branch-specific package fee
  if (exam.packageFees?.length) {
    const scoped = exam.packageFees.find(
      (entry) => String(entry.branch ?? '').trim().toLowerCase() === branchMatch,
    );
    if (scoped?.amount != null && parseNumber(scoped.amount)! > 0) {
      return parseNumber(scoped.amount);
    }
  }

  // 2. Global package fee
  const pkgFee = parseNumber(exam.packageFee);
  if (pkgFee != null && pkgFee > 0) {
    return pkgFee;
  }

  // 3. Per-branch supply fee schedule (index 0 = 1 subject fee)
  if (exam.supplyFeesByBranch?.length) {
    const branchSupply = exam.supplyFeesByBranch.find(
      (entry) => String(entry.branch ?? '').trim().toLowerCase() === branchMatch,
    );
    if (branchSupply?.feesByCount?.length) {
      const firstTier = branchSupply.feesByCount.find((fee) => fee != null && Number(fee) > 0);
      if (firstTier != null && Number(firstTier) > 0) return Number(firstTier);
    }
  }

  // 4. Default supply fee tiers (index 0 = 1 subject fee)
  if (exam.supplyFeeByCount?.length) {
    const firstTier = exam.supplyFeeByCount.find((fee) => fee != null && Number(fee) > 0);
    if (firstTier != null && Number(firstTier) > 0) return Number(firstTier);
  }

  // 5. Exam subject paper fees
  if (exam.examSubjects?.length) {
    const validSubject = exam.examSubjects.find(
      (es) => es.fee != null && Number(es.fee) > 0,
    );
    if (validSubject) return Number(validSubject.fee);
  }

  return pkgFee ?? 0;
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

function getExamBatches(exam?: Exam | null): string[] {
  if (!exam) return [];
  const set = new Set<string>();
  if (exam.batch?.trim()) set.add(exam.batch.trim());
  for (const scope of exam.scopes || []) {
    if (scope.batch?.trim()) set.add(scope.batch.trim());
  }
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}

function findEligibleBatch(
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
    )?.batch ?? null
  );
}

function resolveReportBatch(options: {
  exam?: Exam | null;
  examId?: number;
  rollNumber?: string | null;
  eligibleBatch?: string | null;
}) {
  const fromEligible = options.eligibleBatch?.trim();
  if (fromEligible) return fromEligible;
  const fromExam = options.exam?.batch?.trim();
  if (fromExam) return fromExam;
  return 'Unassigned';
}

function paymentReportBatch(
  payment: Payment,
  eligibleStudents: (EligibleExamStudent & { examId: number })[],
) {
  const examId = payment.feeRecord?.exam?.id ?? payment.feeRecord?.examId;
  return resolveReportBatch({
    exam: payment.feeRecord?.exam,
    examId,
    rollNumber: payment.feeRecord?.studentRollNumber,
    eligibleBatch: findEligibleBatch(
      eligibleStudents,
      examId,
      payment.feeRecord?.studentRollNumber,
    ),
  });
}

function dueReportBatch(
  record: ExamFeeRecord,
  eligibleStudents: (EligibleExamStudent & { examId: number })[],
) {
  return resolveReportBatch({
    exam: record.exam,
    examId: record.examId,
    rollNumber: record.studentRollNumber,
    eligibleBatch: findEligibleBatch(eligibleStudents, record.examId, record.studentRollNumber),
  });
}

function getCollectedAmount(payment: Payment) {
  return Number(getActualAmountValue(payment) || 0) + Number(payment.feeRecord?.lateFee || 0);
}

function getFeeRecordDisplayValues(record: ExamFeeRecord, fallbackExam: Exam | null = null) {
  const exam = record.exam ?? fallbackExam ?? null;
  const branch = record.exam?.branch ?? fallbackExam?.branch ?? null;
  const configured = getConfiguredFeeValues(exam, branch);

  const rawBase = parseNumber(record.baseFee);
  const rawTotal = parseNumber(record.totalAmount);
  const rawLate = parseNumber(record.lateFee);

  const lateFee = rawLate ?? configured.lateFee ?? 0;
  const baseFee = (rawBase != null && rawBase > 0) ? rawBase : (configured.baseFee ?? 0);
  const totalAmount = (rawTotal != null && rawTotal > 0) ? rawTotal : (baseFee + lateFee);
  const actualAmount = baseFee;

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
  const [batchFilter, setBatchFilter] = useState<string>('');
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
    if (tab !== 'due') return;
    setDueLoading(true);

    const fetchPage = async (page: number) => {
      return api.getFeeRecords({ status: 'pending', page, limit: 500, examId: selectedExam ?? undefined });
    };

    const loadDueRecords = async () => {
      try {
        const firstPage = await fetchPage(1);
        if (!mounted) return;
        setDueRecords(firstPage || []);

        if ((firstPage?.length ?? 0) < 500) {
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
          if (nextPageRows.length < 500) break;
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
  }, [selectedExam, tab]);

  useEffect(() => {
    setDuePage(1);
    if (tab === 'due') {
      setDueFilterLoading(true);
      const timer = window.setTimeout(() => setDueFilterLoading(false), 150);
      return () => window.clearTimeout(timer);
    }
    setDueFilterLoading(false);
    return undefined;
  }, [selectedExam, branchFilter, batchFilter, tab]);

  useEffect(() => {
    setDuePage(1);
  }, [duePageSize]);

  useEffect(() => {
    let mounted = true;
    if (tab !== 'due') return;
    const loadEligibleStudents = async () => {
      if (!exams.length) {
        setEligibleStudents([]);
        return;
      }
      const regularExams = exams.filter((ex) => !isSupplyExamType(ex.type));
      if (!regularExams.length) {
        setEligibleStudents([]);
        return;
      }
      setEligibleLoading(true);
      try {
        if (selectedExam) {
          const selectedExamObj = exams.find((e) => e.id === selectedExam);
          if (isSupplyExamType(selectedExamObj?.type)) {
            setEligibleStudents([]);
            setEligibleLoading(false);
            return;
          }
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
          regularExams.map(async (exam) => {
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
  }, [selectedExam, exams, tab]);

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
      if (batchFilter) {
        const batchValue = paymentReportBatch(p, eligibleStudents);
        if (batchValue.toLowerCase() !== batchFilter.toLowerCase()) return false;
      }
      if (
        paymentMethodFilter !== 'all' &&
        String(p.paymentMethod || '').toLowerCase() !== paymentMethodFilter
      ) return false;
      return true;
    });
  }, [payments, selectedExam, branchFilter, batchFilter, paymentMethodFilter, selectedDate, selectedMonth, tab, eligibleStudents]);

  const filteredDueRecords = useMemo(() => {
    const paidRolls = new Set(
      payments
        .filter(isPaidPayment)
        .map((payment) => payment.feeRecord?.studentRollNumber?.trim().toLowerCase())
        .filter((roll): roll is string => Boolean(roll)),
    );
    const unpaidRecords = dueRecords.filter((record) => {
      const exam = record.exam ?? exams.find((ex) => ex.id === record.examId) ?? null;
      if (isSupplyExamType(exam?.type || record.examType)) return false;
      if (paidRolls.has(record.studentRollNumber.trim().toLowerCase())) return false;
      if (selectedExam && record.examId !== selectedExam) return false;
      if (branchFilter) {
        const branchValue = dueReportBranch(record, eligibleStudents);
        if (branchValue.toLowerCase() !== branchFilter.toLowerCase()) return false;
      }
      if (batchFilter) {
        const batchValue = dueReportBatch(record, eligibleStudents);
        if (batchValue.toLowerCase() !== batchFilter.toLowerCase()) return false;
      }
      return true;
    });

    const unpaidRolls = new Set(unpaidRecords.map((record) => record.studentRollNumber.toLowerCase()));
    const eligibleUnpaid = eligibleStudents.filter((student) => {
      const exam = exams.find((ex) => ex.id === student.examId);
      if (isSupplyExamType(exam?.type)) return false;
      const roll = student.rollNumber.trim().toLowerCase();
      if (unpaidRolls.has(roll) || paidRolls.has(roll)) return false;
      if (selectedExam && student.examId !== selectedExam) return false;
      if (branchFilter) {
        const branchValue = String(student.branch || '').toLowerCase();
        if (branchValue !== branchFilter.toLowerCase()) return false;
      }
      if (batchFilter) {
        const exam = exams.find((ex) => ex.id === student.examId);
        const batchValue = String(student.batch || exam?.batch || '').toLowerCase();
        if (batchValue !== batchFilter.toLowerCase()) return false;
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
  }, [dueRecords, branchFilter, batchFilter, eligibleStudents, exams, payments, selectedExam]);

  const dueSectionsByBatch = useMemo(() => {
    const batchMap = new Map<
      string,
      Map<
        number,
        {
          examId: number;
          exam: Exam | null;
          records: ExamFeeRecord[];
          totalActual: number;
          totalLate: number;
          totalAmount: number;
        }
      >
    >();

    for (const record of filteredDueRecords) {
      const batch = dueReportBatch(record, eligibleStudents);
      const examId = record.examId;
      const exam = record.exam ?? exams.find((e) => e.id === examId) ?? null;
      const display = getFeeRecordDisplayValues(record, exam);

      let examMap = batchMap.get(batch);
      if (!examMap) {
        examMap = new Map();
        batchMap.set(batch, examMap);
      }

      let section = examMap.get(examId);
      if (!section) {
        section = {
          examId,
          exam,
          records: [],
          totalActual: 0,
          totalLate: 0,
          totalAmount: 0,
        };
        examMap.set(examId, section);
      }

      section.records.push(record);
      section.totalActual += display.actualAmount;
      section.totalLate += display.lateFee;
      section.totalAmount += display.totalAmount;
    }

    const sortBatchKeys = (a: string, b: string) => {
      if (a === 'Unassigned') return 1;
      if (b === 'Unassigned') return -1;
      return b.localeCompare(a);
    };

    return Array.from(batchMap.entries())
      .sort(([a], [b]) => sortBatchKeys(a, b))
      .map(([batch, examMap]) => {
        const examSections = Array.from(examMap.values()).sort((a, b) => {
          const nameA = a.exam?.name || `Exam ${a.examId}`;
          const nameB = b.exam?.name || `Exam ${b.examId}`;
          return nameA.localeCompare(nameB);
        });

        let totalUnpaidStudents = 0;
        let totalActual = 0;
        let totalLate = 0;
        let totalAmount = 0;

        for (const sec of examSections) {
          totalUnpaidStudents += sec.records.length;
          totalActual += sec.totalActual;
          totalLate += sec.totalLate;
          totalAmount += sec.totalAmount;
        }

        return {
          batch,
          examSections,
          totalUnpaidStudents,
          totalActual,
          totalLate,
          totalAmount,
        };
      });
  }, [filteredDueRecords, eligibleStudents, exams]);

  const dueOverallSummary = useMemo(() => {
    let totalUnpaidStudents = 0;
    let totalActualFee = 0;
    let totalLateFee = 0;
    let totalPayable = 0;
    const uniqueExams = new Set<number>();

    for (const batchGroup of dueSectionsByBatch) {
      totalUnpaidStudents += batchGroup.totalUnpaidStudents;
      totalActualFee += batchGroup.totalActual;
      totalLateFee += batchGroup.totalLate;
      totalPayable += batchGroup.totalAmount;
      for (const section of batchGroup.examSections) {
        uniqueExams.add(section.examId);
      }
    }

    return {
      totalUnpaidStudents,
      totalActualFee,
      totalLateFee,
      totalPayable,
      examCount: uniqueExams.size,
    };
  }, [dueSectionsByBatch]);

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
      { key: 'batch', header: 'Batch', render: (r: Payment) => paymentReportBatch(r, eligibleStudents) },
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
    [tab, eligibleStudents],
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
      { key: 'batch', header: 'Batch', render: (r: ExamFeeRecord) => dueReportBatch(r, eligibleStudents) },
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
    [eligibleStudents, exams],
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

  const batchOptions = useMemo(() => {
    const set = new Set<string>();
    const sources = selectedExamObject ? [selectedExamObject] : exams;
    for (const exam of sources) {
      for (const batch of getExamBatches(exam)) {
        set.add(batch);
      }
    }
    for (const student of eligibleStudents) {
      if (selectedExam && student.examId !== selectedExam) continue;
      if (student.batch?.trim()) {
        set.add(student.batch.trim());
      }
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [exams, selectedExam, selectedExamObject, eligibleStudents]);

  useEffect(() => {
    if (batchFilter && !batchOptions.includes(batchFilter)) {
      setBatchFilter('');
    }
  }, [batchOptions, batchFilter]);

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

  const isDueInitialLoading = dueLoading && dueRecords.length === 0;

  const displayedPayments = filteredPayments;

  function handleExport(format: 'pdf' | 'excel') {
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
    filters.push(batchFilter ? `Batch: ${batchFilter}` : 'Batch: All batches');
    if (!isDue) {
      filters.push(
        paymentMethodFilter !== 'all'
          ? `Method: ${paymentMethodLabel(paymentMethodFilter)}`
          : 'Method: All payment methods',
      );
    }

    const includeExamColumn = !selectedExam;
    const sortBatchKeys = (a: string, b: string) => {
      if (a === 'Unassigned') return 1;
      if (b === 'Unassigned') return -1;
      return b.localeCompare(a);
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

      const examTotals = new Map<
        string,
        { count: number; amount: number; lateFee: number; batchCounts: Map<string, number> }
      >();
      for (const record of filteredDueRecords) {
        const examName = record.exam?.name || 'Unspecified examination';
        const batch = dueReportBatch(record, eligibleStudents);
        const current = examTotals.get(examName) || {
          count: 0,
          amount: 0,
          lateFee: 0,
          batchCounts: new Map<string, number>(),
        };
        const display = getFeeRecordDisplayValues(record);
        current.count += 1;
        current.amount += display.actualAmount + display.lateFee;
        current.lateFee += display.lateFee;
        current.batchCounts.set(batch, (current.batchCounts.get(batch) || 0) + 1);
        examTotals.set(examName, current);
      }

      const batchGroups = new Map<string, ExamFeeRecord[]>();
      for (const record of filteredDueRecords) {
        const batch = dueReportBatch(record, eligibleStudents);
        const rows = batchGroups.get(batch) || [];
        rows.push(record);
        batchGroups.set(batch, rows);
      }

      const dueDetailColumns = [
        { key: 'sno', label: 'S.No', width: 28 },
        { key: 'student', label: 'Student', width: includeExamColumn ? 80 : 105 },
        { key: 'roll', label: 'Roll', width: 62 },
        { key: 'branch', label: 'Branch', width: 55 },
        ...(includeExamColumn ? [{ key: 'exam', label: 'Exam', width: 80 }] : []),
        { key: 'amount', label: 'Actual amount', width: 58 },
        { key: 'lateFee', label: 'Late fee', width: 48 },
        { key: 'status', label: 'Status', width: 46 },
        { key: 'dueDate', label: 'Due date', width: 62 },
      ];

      const dueReportPayload = {
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
        examSummary: [
          ...[...examTotals.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([exam, totals]) => {
              const batchBreakdown = [...totals.batchCounts.keys()]
                .filter(Boolean)
                .sort((a, b) => (a === 'Unassigned' ? 1 : b === 'Unassigned' ? -1 : b.localeCompare(a)))
                .join(', ');
              return {
                exam,
                batchBreakdown: batchBreakdown || '-',
                count: String(totals.count),
                amount: formatReportMoney(totals.amount),
                lateFee: formatReportMoney(totals.lateFee),
              };
            }),
          {
            exam: 'Total',
            batchBreakdown: '',
            count: String(filteredDueRecords.length),
            amount: formatReportMoney(totalActual + totalLate),
            lateFee: formatReportMoney(totalLate),
          },
        ],
        detailedSectionTitle: 'Detailed statement - batch wise',
        sections: [...batchGroups.entries()]
          .sort(([a], [b]) => sortBatchKeys(a, b))
          .flatMap(([batch, records]) => {
            const examMap = new Map<string, ExamFeeRecord[]>();
            for (const r of records) {
              const examName = r.exam?.name || 'Unspecified examination';
              const exRows = examMap.get(examName) || [];
              exRows.push(r);
              examMap.set(examName, exRows);
            }

            return Array.from(examMap.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([examName, examRecords]) => {
                const sorted = [...examRecords].sort((a, b) =>
                  `${a.studentRollNumber} ${a.studentName}`.localeCompare(
                    `${b.studentRollNumber} ${b.studentName}`,
                  ),
                );
                const batchActual = sorted.reduce(
                  (sum, record) => sum + getFeeRecordDisplayValues(record).actualAmount,
                  0,
                );
                const batchLate = sorted.reduce(
                  (sum, record) => sum + getFeeRecordDisplayValues(record).lateFee,
                  0,
                );
                const batchTotal = batchActual + batchLate;
                return {
                  sectionTitle: `Batch: ${batch}  |  Exam: ${examName}`,
                  examName,
                  batch,
                  columns: dueDetailColumns,
                  rows: sorted.map((record, index) => {
                    const display = getFeeRecordDisplayValues(record);
                    const branch = dueReportBranch(record, eligibleStudents);
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
                      branch,
                      exam: record.exam?.name || '-',
                      amount: formatReportMoney(display.actualAmount),
                      lateFee: formatReportMoney(display.lateFee),
                      status: String(record.status),
                      dueDate,
                    };
                  }),
                  footer: `Subtotal (${batch} - ${examName}): ${sorted.length} dues    Rs. ${formatReportMoney(batchTotal)}`,
                  footerData: {
                    countLabel: `${sorted.length} unpaid students`,
                    totalActual: batchActual,
                    totalLate: batchLate,
                    totalAmount: batchTotal,
                  },
                };
              });
          }),
        grandTotal: `Grand total: ${filteredDueRecords.length} dues    Rs. ${formatReportMoney(totalActual + totalLate)}`,
        fileName: `due-report-${new Date().toISOString().replace(/[:.]/g, '-')}.${format === 'excel' ? 'xlsx' : 'pdf'}`,
      };

      if (format === 'excel') {
        downloadPaymentReportExcel(dueReportPayload);
      } else {
        downloadPaymentReportPdf(dueReportPayload);
      }
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

    const examTotals = new Map<
      string,
      { count: number; amount: number; lateFee: number; batchCounts: Map<string, number> }
    >();
    for (const payment of filteredPayments) {
      const examName = payment.feeRecord?.exam?.name || 'Unspecified examination';
      const batch = paymentReportBatch(payment, eligibleStudents);
      const current = examTotals.get(examName) || {
        count: 0,
        amount: 0,
        lateFee: 0,
        batchCounts: new Map<string, number>(),
      };
      current.count += 1;
      current.amount += getCollectedAmount(payment);
      current.lateFee += Number(payment.feeRecord?.lateFee || 0);
      current.batchCounts.set(batch, (current.batchCounts.get(batch) || 0) + 1);
      examTotals.set(examName, current);
    }

    const batchGroups = new Map<string, Payment[]>();
    for (const payment of filteredPayments) {
      const batch = paymentReportBatch(payment, eligibleStudents);
      const rows = batchGroups.get(batch) || [];
      rows.push(payment);
      batchGroups.set(batch, rows);
    }

    const paidDetailColumns = [
      { key: 'sno', label: 'S.No', width: 26 },
      { key: 'student', label: 'Student', width: includeExamColumn ? 78 : 102 },
      { key: 'roll', label: 'Roll', width: 62 },
      { key: 'branch', label: 'Branch', width: 52 },
      ...(includeExamColumn ? [{ key: 'exam', label: 'Exam', width: 78 }] : []),
      { key: 'amount', label: 'Amount', width: 52 },
      { key: 'lateFee', label: 'Late fee', width: 44 },
      { key: 'method', label: 'Method', width: 46 },
      { key: 'paidAt', label: 'Paid at', width: 85 },
    ];

    const paymentReportPayload = {
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
      examSummary: [
        ...[...examTotals.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([exam, totals]) => {
            const batchBreakdown = [...totals.batchCounts.keys()]
              .filter(Boolean)
              .sort((a, b) => (a === 'Unassigned' ? 1 : b === 'Unassigned' ? -1 : b.localeCompare(a)))
              .join(', ');
            return {
              exam,
              batchBreakdown: batchBreakdown || '-',
              count: String(totals.count),
              amount: formatReportMoney(totals.amount),
              lateFee: formatReportMoney(totals.lateFee),
            };
          }),
        {
          exam: 'Total',
          batchBreakdown: '',
          count: String(filteredPayments.length),
          amount: formatReportMoney(totalCollected),
          lateFee: formatReportMoney(totalLate),
        },
      ],
      detailedSectionTitle: 'Detailed statement - batch wise',
      sections: [...batchGroups.entries()]
        .sort(([a], [b]) => sortBatchKeys(a, b))
        .flatMap(([batch, records]) => {
          const examMap = new Map<string, Payment[]>();
          for (const p of records) {
            const examName = p.feeRecord?.exam?.name || 'Unspecified examination';
            const exRows = examMap.get(examName) || [];
            exRows.push(p);
            examMap.set(examName, exRows);
          }

          return Array.from(examMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([examName, examPayments]) => {
              const sorted = [...examPayments].sort((a, b) =>
                `${a.feeRecord?.studentRollNumber || ''} ${a.feeRecord?.studentName || ''}`.localeCompare(
                  `${b.feeRecord?.studentRollNumber || ''} ${b.feeRecord?.studentName || ''}`,
                ),
              );
              const batchTotal = sorted.reduce((sum, payment) => sum + getCollectedAmount(payment), 0);
              const batchLate = sorted.reduce((sum, payment) => sum + Number(payment.feeRecord?.lateFee || 0), 0);
              const batchActual = sorted.reduce((sum, payment) => sum + getActualAmountValue(payment), 0);
              return {
                sectionTitle: `Batch: ${batch}  |  Exam: ${examName}`,
                examName,
                batch,
                columns: paidDetailColumns,
                rows: sorted.map((payment, index) => {
                  const branch = paymentReportBranch(payment, eligibleStudents);
                  return {
                    sno: String(index + 1),
                    student: payment.feeRecord?.studentName || '-',
                    roll: payment.feeRecord?.studentRollNumber || '-',
                    branch,
                    exam: payment.feeRecord?.exam?.name || '-',
                    amount: formatReportMoney(getActualAmountValue(payment)),
                    lateFee: formatReportMoney(Number(payment.feeRecord?.lateFee || 0)),
                    method: paymentMethodLabel(payment.paymentMethod),
                    paidAt: paymentTimestamp(payment)
                      ? formatPaymentIST(paymentTimestamp(payment) as string)
                      : '-',
                  };
                }),
                footer: `Subtotal (${batch} - ${examName}): ${sorted.length} payments    Rs. ${formatReportMoney(batchTotal)}`,
                footerData: {
                  countLabel: `${sorted.length} payments`,
                  totalActual: batchActual,
                  totalLate: batchLate,
                  totalAmount: batchTotal,
                },
              };
            });
        }),
      grandTotal: `Grand total: ${filteredPayments.length} payments    Rs. ${formatReportMoney(totalCollected)}`,
      fileName: `payment-report-${new Date().toISOString().replace(/[:.]/g, '-')}.${format === 'excel' ? 'xlsx' : 'pdf'}`,
    };

    if (format === 'excel') {
      downloadPaymentReportExcel(paymentReportPayload);
    } else {
      downloadPaymentReportPdf(paymentReportPayload);
    }
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

      <div className="flex w-full items-center justify-between gap-3 overflow-x-auto pb-1 pt-0.5">
        <div className="flex shrink-0 items-center gap-2.5">
          <select
            className="h-10 max-w-[260px] truncate rounded border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] outline-none shrink-0"
            value={selectedExam ?? ''}
            onChange={(e) => setSelectedExam(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Select exam</option>
            {exams.map((ex) => {
              const batches = getExamBatches(ex);
              const batchText = batches.length ? ` · Batch: ${batches.join(', ')}` : '';
              return (
                <option key={ex.id} value={ex.id}>
                  {ex.name} — {ex.course} / {ex.branch}{batchText}
                </option>
              );
            })}
          </select>

          <select
            className="h-10 rounded border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] outline-none shrink-0"
            value={batchFilter}
            onChange={(e) => setBatchFilter(e.target.value)}
          >
            <option value="">All batches</option>
            {batchOptions.map((batch) => (
              <option key={batch} value={batch}>
                {batch}
              </option>
            ))}
          </select>

          <select
            className="h-10 rounded border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] outline-none shrink-0"
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
              className="h-10 rounded border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] outline-none shrink-0"
              value={paymentMethodFilter}
              onChange={(e) => setPaymentMethodFilter(e.target.value as 'all' | 'cash' | 'upi')}
            >
              <option value="all">All payment methods</option>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
            </select>
          ) : null}

          {tab === 'day' ? (
            <label className="flex h-10 shrink-0 items-center gap-2 text-sm text-[var(--muted)] whitespace-nowrap">
              <span>Date</span>
              <input
                type="date"
                className="h-10 rounded border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] outline-none shrink-0"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </label>
          ) : null}

          {tab === 'month' ? (
            <label className="flex h-10 shrink-0 items-center gap-2 text-sm text-[var(--muted)] whitespace-nowrap">
              <span>Month</span>
              <input
                type="month"
                className="h-10 rounded border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] outline-none shrink-0"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              />
            </label>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Tabs
            items={[
              { id: 'day', label: 'Day wise' },
              { id: 'month', label: 'Month wise' },
              { id: 'due', label: 'Due' },
            ]}
            activeId={tab}
            onChange={(id) => setTab(id as any)}
          />
          <Button variant="secondary" onClick={() => handleExport('excel')} className="shrink-0">
            Export Excel
          </Button>
          <Button variant="secondary" onClick={() => handleExport('pdf')} className="shrink-0">
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
              Total amount: ₹{formatReportMoney(tab === 'due'
                ? filteredDueRecords.reduce((s, r) => s + getActualAmountValueFromRecord(r), 0)
                : displayedPayments.reduce((s, p) => s + Number(getActualAmountValue(p) || 0), 0))}
            </div>
          </div>
          {tab === 'due' ? (
            <div className="space-y-6">
              {/* Overall Due Summary Header */}
              <div className="grid gap-4 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-slate-500">Examinations</p>
                  <p className="mt-1 text-2xl font-extrabold text-slate-900">{dueOverallSummary.examCount}</p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm">
                  <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-amber-700">Unpaid Students</p>
                  <p className="mt-1 text-2xl font-extrabold text-amber-900">{dueOverallSummary.totalUnpaidStudents}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-slate-500">Total Actual Fee</p>
                  <p className="mt-1 text-2xl font-extrabold text-slate-800">₹{formatReportMoney(dueOverallSummary.totalActualFee)}</p>
                </div>
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 shadow-sm">
                  <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-indigo-700">Total Amount to Pay</p>
                  <p className="mt-1 text-2xl font-extrabold text-indigo-950">₹{formatReportMoney(dueOverallSummary.totalPayable)}</p>
                </div>
              </div>

              {(eligibleLoading || dueBackgroundLoading) && dueSectionsByBatch.length > 0 ? (
                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50/80 border border-amber-200/60 px-3.5 py-2 rounded-lg">
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                  Checking additional student eligibility in the background…
                </div>
              ) : null}

              {isDueInitialLoading ? (
                <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-500 shadow-sm">
                  Loading pending due reports by batch…
                </div>
              ) : dueSectionsByBatch.length === 0 ? (
                <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-slate-200 bg-white px-6 text-center text-sm text-slate-500 shadow-sm">
                  No pending dues found for the selected examination, batch, or branch filters.
                </div>
              ) : (
                dueSectionsByBatch.map((batchGroup) => (
                  <div key={batchGroup.batch} className="space-y-4 rounded-2xl border border-slate-300 bg-slate-50/60 p-5 shadow-sm">
                    {/* Batch Group Header Bar */}
                    <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="inline-block h-3.5 w-3.5 rounded-full bg-indigo-600" />
                        <h3 className="text-lg font-extrabold text-slate-900">
                          Batch: {batchGroup.batch}
                        </h3>
                        <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-800">
                          {batchGroup.examSections.length} {batchGroup.examSections.length === 1 ? 'Exam' : 'Exams'}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-semibold text-amber-800">
                          {batchGroup.totalUnpaidStudents} Unpaid Students
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700">
                          Actual: ₹{formatReportMoney(batchGroup.totalActual)}
                        </span>
                        {batchGroup.totalLate > 0 ? (
                          <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 font-semibold text-orange-800">
                            Late Fee: ₹{formatReportMoney(batchGroup.totalLate)}
                          </span>
                        ) : null}
                        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 font-bold text-indigo-950">
                          Batch Total: ₹{formatReportMoney(batchGroup.totalAmount)}
                        </span>
                      </div>
                    </div>

                    {/* Separate Exam Tables for each Exam in this Batch */}
                    <div className="space-y-4 pt-1">
                      {batchGroup.examSections.map((section) => {
                        const examName = section.exam?.name || `Examination #${section.examId}`;
                        const examTypeTag = section.exam?.type ? `(${section.exam.type.toUpperCase()})` : '';
                        const details = [section.exam?.course, section.exam?.branch]
                          .filter(Boolean)
                          .join(' • ');

                        return (
                          <div key={section.examId} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                            {/* Exam Section Header Bar */}
                            <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-100/70 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                                  <h4 className="text-sm font-bold text-slate-900">{examName} {examTypeTag}</h4>
                                </div>
                                {details ? (
                                  <p className="mt-0.5 text-xs text-slate-500">{details}</p>
                                ) : null}
                              </div>

                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 font-semibold text-amber-800">
                                  {section.records.length} Unpaid Students
                                </span>
                                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 font-semibold text-slate-700">
                                  Actual: ₹{formatReportMoney(section.totalActual)}
                                </span>
                                {section.totalLate > 0 ? (
                                  <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 font-semibold text-orange-800">
                                    Late Fee: ₹{formatReportMoney(section.totalLate)}
                                  </span>
                                ) : null}
                                <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 font-bold text-indigo-950">
                                  Subtotal: ₹{formatReportMoney(section.totalAmount)}
                                </span>
                              </div>
                            </div>

                            {/* Table for this Exam */}
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-sm">
                                <thead>
                                  <tr className="border-b border-slate-200 bg-slate-50 text-[0.6875rem] uppercase tracking-wide text-slate-500">
                                    <th className="px-5 py-3 font-semibold">#</th>
                                    <th className="px-5 py-3 font-semibold">Student Name</th>
                                    <th className="px-5 py-3 font-semibold">Roll Number (PIN)</th>
                                    <th className="px-5 py-3 font-semibold">Branch</th>
                                    <th className="px-5 py-3 font-semibold">Actual Fee</th>
                                    <th className="px-5 py-3 font-semibold">Late Fee</th>
                                    <th className="px-5 py-3 font-semibold">Total Amount to Pay</th>
                                    <th className="px-5 py-3 font-semibold">Status</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {section.records.map((record, index) => {
                                    const display = getFeeRecordDisplayValues(record, section.exam);
                                    const branch = dueReportBranch(record, eligibleStudents);

                                    return (
                                      <tr key={record.id || index} className="hover:bg-slate-50/50 transition">
                                        <td className="px-5 py-3 text-xs font-mono text-slate-400">{index + 1}</td>
                                        <td className="px-5 py-3 font-semibold text-slate-900">{record.studentName || '-'}</td>
                                        <td className="px-5 py-3 font-mono text-xs font-semibold text-slate-700">{record.studentRollNumber || '-'}</td>
                                        <td className="px-5 py-3 text-xs text-slate-600">{branch}</td>
                                        <td className="px-5 py-3 text-xs font-medium text-slate-800">₹{formatReportMoney(display.actualAmount)}</td>
                                        <td className="px-5 py-3 text-xs font-medium text-amber-700">
                                          {display.lateFee > 0 ? `₹${formatReportMoney(display.lateFee)}` : '-'}
                                        </td>
                                        <td className="px-5 py-3 font-bold text-slate-900">₹{formatReportMoney(display.totalAmount)}</td>
                                        <td className="px-5 py-3">
                                          <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-[0.6875rem] font-semibold text-amber-800">
                                            Unpaid
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                                <tfoot>
                                  <tr className="border-t border-slate-200 bg-slate-50 text-xs font-bold text-slate-800">
                                    <td colSpan={4} className="px-5 py-3 text-right">
                                      Subtotal for {examName}:
                                    </td>
                                    <td className="px-5 py-3 text-slate-900">₹{formatReportMoney(section.totalActual)}</td>
                                    <td className="px-5 py-3 text-amber-800">₹{formatReportMoney(section.totalLate)}</td>
                                    <td className="px-5 py-3 text-indigo-950 text-sm font-extrabold">₹{formatReportMoney(section.totalAmount)}</td>
                                    <td className="px-5 py-3 text-slate-500 font-normal">{section.records.length} unpaid students</td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <DataTable<Payment>
              columns={paymentColumns}
              rows={displayedPayments}
              rowKey={(r) => String(r.id)}
              loading={loading}
              monochrome
              footer={
                <tr className="font-semibold">
                  <td colSpan={4} className="px-4 py-3 text-right">
                    Total fee collected
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    ₹{formatReportMoney(displayedPayments.reduce(
                      (total, payment) => total + Number(getActualAmountValue(payment) || 0),
                      0,
                    ))}
                  </td>
                  <td colSpan={paymentColumns.length - 5} className="px-4 py-3" />
                </tr>
              }
            />
          )}
        </div>
      </div>

    </div>
  );
}
