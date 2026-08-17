'use strict';

/**
 * Student overdue-due calculation against Fee Management Mongo.
 * See docs/modules/19-exam-due-clearance.md
 *
 * Term model:
 * - StudentFee may store one full demand with isTermsDivided=true and no termNumber.
 * - Actual Term 1..N amounts / due dates come from linked FeeStructure.terms.
 * - When StudentFee already has per-term rows (termNumber set), those rows are used.
 */

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function toDateOnly(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const s = value.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);
    }
    return null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(value);
  }
  return null;
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

  if (type === 'CREDIT' || mode === 'refund' || mode === 'credit') {
    return -amount;
  }
  return amount;
}

function normalizeStructureTerms(terms) {
  if (!Array.isArray(terms)) return [];
  return terms
    .map((t, idx) => ({
      termNumber: Number(t.termNumber ?? t.term ?? idx + 1) || idx + 1,
      amount: t.amount != null ? Number(t.amount) : null,
      percent:
        t.percent != null
          ? Number(t.percent)
          : t.percentage != null
            ? Number(t.percentage)
            : null,
      dueDateMode: String(t.dueDateMode || t.due_date_mode || '').toLowerCase() || null,
      dueDate: toDateOnly(
        t.fixedDueDate || t.dueDate || t.due_date || t.fixed_due_date,
      ),
      fixedDueDate: toDateOnly(t.fixedDueDate || t.fixed_due_date),
      referenceSemester: yearNum(t.referenceSemester ?? t.reference_semester),
      offsetDays:
        t.dueOffsetDays != null
          ? Number(t.dueOffsetDays)
          : t.offsetDays != null
            ? Number(t.offsetDays)
            : t.dueDays != null
              ? Number(t.dueDays)
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

/**
 * FeeStructure in Fee Mgmt is usually one document per fee head
 * (top-level feeHead + terms). Older/nested shapes are also supported.
 */
function extractStructureTerms(structure, feeHeadId) {
  if (!structure) return [];
  const headId = idStr(feeHeadId);

  // Per-head structure document
  if (Array.isArray(structure.terms) && structure.terms.length) {
    if (!structure.feeHead || idStr(structure.feeHead) === headId) {
      return normalizeStructureTerms(structure.terms);
    }
  }

  const heads =
    structure.feeHeads ||
    structure.heads ||
    structure.feeHeadDetails ||
    structure.items ||
    [];

  if (Array.isArray(heads) && heads.length) {
    const matched =
      heads.find((h) => {
        const hid = idStr(h.feeHead || h.feeHeadId || h.headId || h._id);
        return hid && hid === headId;
      }) || null;
    if (matched) {
      return normalizeStructureTerms(
        matched.terms || matched.termSplits || matched.installments || [],
      );
    }
  }

  return normalizeStructureTerms(
    structure.termSplits || structure.installments || [],
  );
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
 * Build working term rows for a demand group.
 * Prefer explicit StudentFee.termNumber rows; otherwise expand from FeeStructure.
 */
function buildTermsForGroup(g, structure, structureTerms, notes) {
  const demands = g.demands
    .slice()
    .sort(
      (a, b) =>
        (Number(a.termNumber) || 0) - (Number(b.termNumber) || 0) ||
        String(a._id).localeCompare(String(b._id)),
    );

  const totalDemand = roundMoney(
    demands.reduce((s, d) => s + (Number(d.amount) || 0), 0),
  );

  const explicitTermRows = demands.filter(
    (d) => d.termNumber != null && d.termNumber !== '',
  );
  const hasMultipleExplicitTerms = explicitTermRows.length > 1;
  const hasSingleExplicitTerm =
    explicitTermRows.length === 1 && demands.length === 1;

  const dividedFlag =
    demands.some((d) => d.isTermsDivided === true) ||
    structure?.isTermsDivided === true;

  // Case A: StudentFee already stores per-term rows
  if (hasMultipleExplicitTerms || (hasSingleExplicitTerm && !dividedFlag)) {
    return {
      terms: demands.map((d) => ({
        termNumber: Number(d.termNumber) || 1,
        demand: roundMoney(d.amount),
        declaration: 0,
        paid: 0,
        application: 0,
        balance: 0,
        dueDate: null,
        overdue: false,
        studentFeeId: idStr(d._id),
        source: 'student_fee_row',
      })),
      totalDemand,
      expandedFromStructure: false,
    };
  }

  // Case B: one (or lumped) StudentFee + structure terms → expand
  if (dividedFlag && structureTerms.length > 0 && totalDemand > 0) {
    const structureSum = roundMoney(
      structureTerms.reduce((s, t) => s + (Number(t.amount) || 0), 0),
    );
    const useStructureAmounts =
      structureSum > 0 && Math.abs(structureSum - totalDemand) <= 0.05;
    const hasPercents = structureTerms.some(
      (t) => t.percent != null && Number(t.percent) > 0,
    );

    if (structureSum > 0 && !useStructureAmounts) {
      notes.push(
        `Structure ${g.structureId} term sum ${structureSum} vs StudentFee ${totalDemand} for head ${g.feeHeadId}; scaling to StudentFee total`,
      );
    }

    let allocated = 0;
    const terms = structureTerms.map((st, idx) => {
      let demand = 0;
      if (useStructureAmounts && st.amount != null) {
        demand = roundMoney(st.amount);
      } else if (hasPercents && st.percent != null) {
        demand = roundMoney((totalDemand * Number(st.percent)) / 100);
      } else if (structureSum > 0 && st.amount != null) {
        demand = roundMoney((totalDemand * Number(st.amount)) / structureSum);
      } else {
        demand = roundMoney(totalDemand / structureTerms.length);
      }

      if (idx === structureTerms.length - 1) {
        demand = roundMoney(totalDemand - allocated);
      } else {
        allocated = roundMoney(allocated + demand);
      }

      return {
        termNumber: st.termNumber,
        demand: Math.max(0, demand),
        declaration: 0,
        paid: 0,
        application: 0,
        balance: 0,
        dueDate: null,
        overdue: false,
        studentFeeId: idStr(demands[0]?._id),
        source: 'fee_structure_expand',
        structureTerm: st,
      };
    });

    return { terms, totalDemand, expandedFromStructure: true };
  }

  // Case C: single undivided demand
  return {
    terms: [
      {
        termNumber: Number(demands[0]?.termNumber) || 1,
        demand: totalDemand,
        declaration: 0,
        paid: 0,
        application: 0,
        balance: 0,
        dueDate: null,
        overdue: false,
        studentFeeId: idStr(demands[0]?._id),
        source: 'student_fee_single',
      },
    ],
    totalDemand,
    expandedFromStructure: false,
  };
}

function resolveTermDueDate(term, structureTerm, g, semesterStartByYearSem, asOf) {
  const st = structureTerm || term.structureTerm || null;

  if (st?.dueDateMode === 'fixed' || st?.fixedDueDate || st?.dueDate) {
    const fixed = st.fixedDueDate || st.dueDate;
    if (fixed) return fixed;
  }

  if (st) {
    const refSem =
      st.referenceSemester != null
        ? st.referenceSemester
        : g.semester != null
          ? g.semester
          : 1;
    const semKey = `${g.studentYear}|${refSem}`;
    const semesterStart = semesterStartByYearSem?.get(semKey) || null;
    if (st.offsetDays != null && semesterStart) {
      return addDays(semesterStart, st.offsetDays);
    }
    if (semesterStart && (st.dueDateMode === 'offset' || st.offsetDays == null)) {
      // offset mode with 0 days, or missing offset → semester start
      return addDays(semesterStart, st.offsetDays || 0);
    }
  }

  // Fallbacks when no structure term config
  const semKey = `${g.studentYear}|${g.semester ?? 1}`;
  const semesterStart = semesterStartByYearSem?.get(semKey) || null;
  if (semesterStart && term.termNumber === 1) return semesterStart;

  // Active demand with no configured date → already due
  return asOf;
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
    const structure = g.structureId ? structuresById.get(g.structureId) : null;
    const structureTerms = extractStructureTerms(structure, g.feeHeadId);

    const built = buildTermsForGroup(g, structure, structureTerms, notes);
    const terms = built.terms;
    const totalDemand = built.totalDemand;

    // --- Declaration concession: split across all terms by share
    let declarationTotal = 0;
    for (const req of overallConcessions || []) {
      for (const entry of req.concessions || []) {
        const entryHead = idStr(entry.feeHeadId);
        const entryYear = yearNum(entry.studentYear);
        const entrySem = yearNum(entry.semester);
        if (entryHead !== g.feeHeadId) continue;
        if (
          entryYear != null &&
          g.studentYear != null &&
          entryYear !== g.studentYear
        ) {
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

    for (const t of terms) {
      t.balance = roundMoney(Math.max(0, t.demand - t.declaration));
    }

    // --- Payments waterfall
    let netPaid = 0;
    for (const txn of transactions || []) {
      if (String(txn.status || 'active').toLowerCase() === 'cancelled') continue;
      if (idStr(txn.feeHead) !== g.feeHeadId) continue;
      const ty = yearNum(txn.studentYear);
      const ts = yearNum(txn.semester);
      if (ty != null && g.studentYear != null && ty !== g.studentYear) continue;
      if (ts != null && g.semester != null && ts !== g.semester) continue;
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

    // --- Application concession waterfall
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

    // --- Due dates
    if (structure && totalDemand > 0 && structureTerms.length) {
      const expected = roundMoney(
        structureTerms.reduce((s, t) => s + (Number(t.amount) || 0), 0),
      );
      const headAmount =
        structure.amount != null ? Number(structure.amount) : null;
      const compareTo = expected > 0 ? expected : headAmount;
      if (
        compareTo != null &&
        Math.abs(compareTo - totalDemand) > 0.05 &&
        !built.expandedFromStructure
      ) {
        notes.push(
          `Structure ${g.structureId} expected ${compareTo} vs StudentFee ${totalDemand} for head ${g.feeHeadId}`,
        );
      }
    }

    for (const t of terms) {
      const st =
        t.structureTerm ||
        structureTerms.find((x) => x.termNumber === t.termNumber) ||
        null;
      t.dueDate = resolveTermDueDate(
        t,
        st,
        g,
        semesterStartByYearSem,
        asOf,
      );
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
        source: t.source,
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
  buildTermsForGroup,
  resolveTermDueDate,
  groupKey,
  idStr,
};
