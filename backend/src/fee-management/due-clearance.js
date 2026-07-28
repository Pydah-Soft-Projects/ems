'use strict';

/**
 * Student overdue-due calculation against Fee Management Mongo.
 * See docs/modules/19-exam-due-clearance.md
 */

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function toDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function addDays(dateOnly, days) {
  const d = new Date(`${dateOnly}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

function studentKeys(student) {
  const keys = [];
  const seen = new Set();
  for (const raw of [
    student?.admissionNumber,
    student?.pinNo,
    student?.studentRollNumber,
    student?.rollNumber,
  ]) {
    const v = String(raw ?? '').trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    keys.push(v);
  }
  return keys;
}

function idStr(value) {
  if (value == null) return '';
  if (typeof value === 'object' && value._id) return String(value._id);
  return String(value);
}

function yearNum(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function groupKey(feeHeadId, academicYear, studentYear, semester) {
  return [
    idStr(feeHeadId),
    String(academicYear ?? ''),
    String(studentYear ?? ''),
    String(semester ?? ''),
  ].join('|');
}

function netTransactionAmount(txn) {
  const amount = Math.abs(Number(txn.amount) || 0);
  const type = String(txn.transactionType || 'DEBIT').toUpperCase();
  const mode = String(txn.paymentMode || '').toLowerCase();

  // Refunds / credits increase outstanding due.
  if (type === 'CREDIT' || mode === 'refund' || mode === 'credit') {
    return -amount;
  }
  // Everything else (DEBIT, Waiver, Adjustment, Cash, …) reduces due.
  return amount;
}

function extractStructureTerms(structure, feeHeadId) {
  if (!structure) return [];
  const headId = idStr(feeHeadId);
  const heads =
    structure.feeHeads ||
    structure.heads ||
    structure.feeHeadDetails ||
    structure.items ||
    [];

  let matched = null;
  if (Array.isArray(heads) && heads.length) {
    matched =
      heads.find((h) => {
        const hid = idStr(h.feeHead || h.feeHeadId || h.headId || h._id);
        return hid && hid === headId;
      }) || null;
  }

  const source = matched || structure;
  const terms =
    source.terms ||
    source.termSplits ||
    source.installments ||
    structure.terms ||
    [];

  if (!Array.isArray(terms)) return [];
  return terms
    .map((t, idx) => ({
      termNumber: Number(t.termNumber ?? t.term ?? idx + 1) || idx + 1,
      amount: t.amount != null ? Number(t.amount) : null,
      percent: t.percent ?? t.percentage ?? null,
      dueDate: toDateOnly(t.dueDate || t.due_date || t.fixedDueDate),
      offsetDays:
        t.offsetDays != null
          ? Number(t.offsetDays)
          : t.dueDays != null
            ? Number(t.dueDays)
            : t.dueOffsetDays != null
              ? Number(t.dueOffsetDays)
              : null,
      lateFeeAmount:
        t.lateFeeAmount != null
          ? Number(t.lateFeeAmount)
          : t.lateFee != null
            ? Number(t.lateFee)
            : null,
    }))
    .sort((a, b) => a.termNumber - b.termNumber);
}

function formatInr(amount) {
  const n = roundMoney(amount);
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `₹${n}`;
  }
}

/**
 * Pure calculator used by FeeManagementService.getStudentDueClearance.
 */
function computeDueClearance({
  studentFees,
  transactions,
  overallConcessions,
  applicationConcessions,
  feeHeadsById,
  structuresById,
  asOfDate,
  semesterStartByYearSem,
}) {
  const asOf = toDateOnly(asOfDate) || new Date().toISOString().slice(0, 10);
  const notes = [];

  const activeFees = (studentFees || []).filter(
    (f) => f.isActive !== false && Number(f.amount) > 0,
  );

  // Group demands
  const groups = new Map();
  for (const fee of activeFees) {
    const key = groupKey(
      fee.feeHead,
      fee.academicYear,
      fee.studentYear,
      fee.semester,
    );
    let g = groups.get(key);
    if (!g) {
      g = {
        feeHeadId: idStr(fee.feeHead),
        academicYear: fee.academicYear,
        studentYear: yearNum(fee.studentYear),
        semester: yearNum(fee.semester),
        structureId: fee.structureId ? idStr(fee.structureId) : null,
        demands: [],
      };
      groups.set(key, g);
    }
    if (!g.structureId && fee.structureId) {
      g.structureId = idStr(fee.structureId);
    }
    g.demands.push(fee);
  }

  const byHeadMap = new Map();
  const byTermMap = new Map();
  let totalDue = 0;

  for (const g of groups.values()) {
    const demands = g.demands
      .slice()
      .sort(
        (a, b) =>
          (Number(a.termNumber) || 1) - (Number(b.termNumber) || 1) ||
          String(a._id).localeCompare(String(b._id)),
      );

    const terms = demands.map((d) => ({
      termNumber: Number(d.termNumber) || 1,
      demand: roundMoney(d.amount),
      declaration: 0,
      paid: 0,
      application: 0,
      balance: 0,
      dueDate: null,
      overdue: false,
      studentFeeId: idStr(d._id),
    }));

    const totalDemand = roundMoney(terms.reduce((s, t) => s + t.demand, 0));

    // --- Declaration concession (OverallConcessionRequest): split across terms
    let declarationTotal = 0;
    for (const req of overallConcessions || []) {
      for (const entry of req.concessions || []) {
        const entryHead = idStr(entry.feeHeadId);
        const entryYear = yearNum(entry.studentYear);
        const entrySem = yearNum(entry.semester);
        if (entryHead !== g.feeHeadId) continue;
        if (entryYear != null && g.studentYear != null && entryYear !== g.studentYear) {
          continue;
        }
        if (
          entrySem != null &&
          g.semester != null &&
          entrySem !== g.semester
        ) {
          continue;
        }
        declarationTotal += Number(entry.amount) || 0;
      }
    }
    declarationTotal = roundMoney(declarationTotal);

    if (declarationTotal > 0 && totalDemand > 0) {
      let allocated = 0;
      for (let i = 0; i < terms.length; i++) {
        const share =
          i === terms.length - 1
            ? roundMoney(declarationTotal - allocated)
            : roundMoney((declarationTotal * terms[i].demand) / totalDemand);
        terms[i].declaration = Math.min(terms[i].demand, Math.max(0, share));
        allocated = roundMoney(allocated + terms[i].declaration);
      }
    }

    // Remaining after declaration
    for (const t of terms) {
      t.balance = roundMoney(Math.max(0, t.demand - t.declaration));
    }

    // --- Payments: waterfall earliest term first
    let netPaid = 0;
    for (const txn of transactions || []) {
      if (String(txn.status || 'active').toLowerCase() === 'cancelled') continue;
      if (idStr(txn.feeHead) !== g.feeHeadId) continue;
      const ty = yearNum(txn.studentYear);
      const ts = yearNum(txn.semester);
      if (ty != null && g.studentYear != null && ty !== g.studentYear) continue;
      if (ts != null && g.semester != null && ts !== g.semester) continue;
      // If txn has no year/sem, still count it for this head (legacy rows).
      netPaid = roundMoney(netPaid + netTransactionAmount(txn));
    }
    netPaid = Math.max(0, netPaid);

    let payLeft = netPaid;
    for (const t of terms) {
      const apply = Math.min(t.balance, payLeft);
      t.paid = apply;
      t.balance = roundMoney(t.balance - apply);
      payLeft = roundMoney(payLeft - apply);
    }

    // --- Application concession (ConcessionRequest): waterfall unpaid terms
    let appTotal = 0;
    for (const req of applicationConcessions || []) {
      if (idStr(req.feeHead) !== g.feeHeadId) continue;
      const ry = yearNum(req.studentYear);
      const rs = yearNum(req.semester);
      if (ry != null && g.studentYear != null && ry !== g.studentYear) continue;
      if (rs != null && g.semester != null && rs !== g.semester) continue;
      appTotal += Number(req.amount) || 0;
    }
    appTotal = roundMoney(appTotal);

    let appLeft = appTotal;
    for (const t of terms) {
      const apply = Math.min(t.balance, appLeft);
      t.application = apply;
      t.balance = roundMoney(t.balance - apply);
      appLeft = roundMoney(appLeft - apply);
    }

    // --- Due dates from FeeStructure (+ optional semester start)
    const structure = g.structureId ? structuresById.get(g.structureId) : null;
    const structureTerms = extractStructureTerms(structure, g.feeHeadId);
    const semKey = `${g.studentYear}|${g.semester}`;
    const semesterStart = semesterStartByYearSem?.get(semKey) || null;

    if (structure && totalDemand > 0) {
      const expected = roundMoney(
        structureTerms.reduce((s, t) => s + (Number(t.amount) || 0), 0),
      );
      // Prefer explicit head amount on structure when terms have no amounts.
      const headAmount =
        structure.amount != null
          ? Number(structure.amount)
          : structure.totalAmount != null
            ? Number(structure.totalAmount)
            : null;
      const compareTo = expected > 0 ? expected : headAmount;
      if (compareTo != null && Math.abs(compareTo - totalDemand) > 0.05) {
        notes.push(
          `Structure ${g.structureId} expected ${compareTo} vs StudentFee ${totalDemand} for head ${g.feeHeadId}`,
        );
      }
    }

    for (const t of terms) {
      const st = structureTerms.find((x) => x.termNumber === t.termNumber);
      if (st?.dueDate) {
        t.dueDate = st.dueDate;
      } else if (st?.offsetDays != null && semesterStart) {
        t.dueDate = addDays(semesterStart, st.offsetDays);
      } else if (semesterStart && t.termNumber === 1) {
        t.dueDate = semesterStart;
      } else {
        // Active demand with no configured date → treat as already due.
        t.dueDate = asOf;
      }
      t.overdue = t.balance > 0 && t.dueDate <= asOf;
    }

    const headMeta = feeHeadsById.get(g.feeHeadId) || {};
    const overdueDue = roundMoney(
      terms.filter((t) => t.overdue).reduce((s, t) => s + t.balance, 0),
    );
    totalDue = roundMoney(totalDue + overdueDue);

    if (!byHeadMap.has(g.feeHeadId)) {
      byHeadMap.set(g.feeHeadId, {
        feeHeadId: g.feeHeadId,
        feeHeadCode: headMeta.code || null,
        feeHeadName: headMeta.name || 'Fee',
        due: 0,
        terms: [],
      });
    }
    const headRow = byHeadMap.get(g.feeHeadId);
    headRow.due = roundMoney(headRow.due + overdueDue);

    for (const t of terms) {
      headRow.terms.push({
        termNumber: t.termNumber,
        academicYear: g.academicYear,
        studentYear: g.studentYear,
        semester: g.semester,
        demand: t.demand,
        declarationConcession: t.declaration,
        paid: t.paid,
        applicationConcession: t.application,
        balance: t.balance,
        due: t.overdue ? t.balance : 0,
        dueDate: t.dueDate,
        overdue: t.overdue,
      });

      if (t.overdue && t.balance > 0) {
        const prev = byTermMap.get(t.termNumber) || 0;
        byTermMap.set(t.termNumber, roundMoney(prev + t.balance));
      }
    }
  }

  const byHead = Array.from(byHeadMap.values()).sort((a, b) =>
    String(a.feeHeadName).localeCompare(String(b.feeHeadName)),
  );
  const byTerm = Array.from(byTermMap.entries())
    .map(([termNumber, due]) => ({ termNumber: Number(termNumber), due }))
    .sort((a, b) => a.termNumber - b.termNumber);

  const blocked = totalDue > 0;
  const message = blocked
    ? `You have outstanding fee dues of ${formatInr(totalDue)}. Clear all overdue dues before applying for the examination.`
    : 'No overdue fee dues.';

  return {
    blocked,
    canApply: !blocked,
    asOfDate: asOf,
    totalDue,
    currency: 'INR',
    byHead,
    byTerm,
    message,
    verification: {
      matched: notes.length === 0,
      notes,
    },
    skipped: false,
  };
}

function emptyClearance(overrides = {}) {
  return {
    blocked: false,
    canApply: true,
    asOfDate: new Date().toISOString().slice(0, 10),
    totalDue: 0,
    currency: 'INR',
    byHead: [],
    byTerm: [],
    message: 'No overdue fee dues.',
    verification: { matched: true, notes: [] },
    skipped: false,
    ...overrides,
  };
}

module.exports = {
  computeDueClearance,
  emptyClearance,
  studentKeys,
  toDateOnly,
  roundMoney,
  formatInr,
  extractStructureTerms,
  groupKey,
  idStr,
};
