'use strict';

const { config } = require('../config');
const {
  getFeeManagementConnection,
  isFeeManagementConnected,
} = require('./connection');
const { registerFeeManagementModels } = require('./models');
const {
  computeDueClearance,
  emptyClearance,
  studentKeys,
  toDateOnly,
  idStr,
} = require('./due-clearance');

const EXAM_FEE_HEAD = {
  name: 'Exam Fee',
  code: 'EXM01',
  description: 'Examination processing fee',
};

const LATE_FEE_HEAD = {
  name: 'Late Fee',
  code: 'LTF',
  description: 'Examination late fee',
};

const BANK_CHARGES_HEAD = {
  name: 'Bank Charges',
  code: 'BNKCH',
  description: 'Bank / payment gateway charges',
};

// Exact-name matchers. Anchored so "Library Late Fee" / "Bus Late Fee"
// or "XYZ Bank Charges" never match — only the generic heads do.
const LATE_FEE_NAME_REGEX = /^(exam\s*)?late\s*fee$/i;
const BANK_CHARGES_NAME_REGEX = /^bank\s*charges?$/i;

/**
 * Maps EMS payment method → Fee Management paymentMode enum.
 */
function mapPaymentMode(emsMethod) {
  switch (String(emsMethod || '').toLowerCase()) {
    case 'cash':
      return 'Cash';
    case 'upi':
      return 'UPI';
    case 'debit_card':
    case 'credit_card':
      return 'Card';
    case 'net_banking':
      return 'Net Banking';
    case 'bank_transfer':
      return 'RTF';
    default:
      return 'Cash';
  }
}

/**
 * Financial year label, e.g. "2026-27". Boundary defaults to Apr 1 but
 * honours the portal's receiptSequenceResetMonth/Day settings (1-based month).
 */
function getFinancialYear(date = new Date(), resetMonth = 4, resetDay = 1) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const afterReset =
    month > resetMonth || (month === resetMonth && date.getDate() >= resetDay);
  if (afterReset) {
    return `${year}-${String(year + 1).slice(-2)}`;
  }
  return `${year - 1}-${String(year).slice(-2)}`;
}

class FeeManagementService {
  constructor(sdms) {
    this.sdms = sdms;
  }

  isEnabled() {
    return Boolean(config.feeManagement.mongodbUri) && isFeeManagementConnected();
  }

  getModels() {
    const conn = getFeeManagementConnection();
    if (!conn || conn.readyState !== 1) {
      throw new Error('Fee Management MongoDB is not connected');
    }
    return registerFeeManagementModels(conn);
  }

  /**
   * Find-or-create a FeeHead. Matches by code first, then by exact-name
   * regex. Handles the create race (E11000) by re-reading.
   */
  async ensureHead({ code, nameRegex, spec }) {
    const { FeeHead } = this.getModels();
    let head = await FeeHead.findOne({ code });
    if (head) return head;
    head = await FeeHead.findOne({ name: nameRegex });
    if (head) return head;
    try {
      return await FeeHead.create(spec);
    } catch (err) {
      if (err.code === 11000) {
        head =
          (await FeeHead.findOne({ code })) ||
          (await FeeHead.findOne({ name: nameRegex }));
        if (head) return head;
      }
      throw err;
    }
  }

  async ensureExamFeeHead() {
    const code = config.feeManagement.examFeeHeadCode || EXAM_FEE_HEAD.code;
    return this.ensureHead({
      code,
      nameRegex: new RegExp(
        `^${EXAM_FEE_HEAD.name.replace(/\s+/g, '\\s*')}$`,
        'i',
      ),
      spec: { ...EXAM_FEE_HEAD, code },
    });
  }

  async ensureLateFeeHead() {
    return this.ensureHead({
      code: LATE_FEE_HEAD.code,
      nameRegex: LATE_FEE_NAME_REGEX,
      spec: { ...LATE_FEE_HEAD },
    });
  }

  async ensureBankChargesHead() {
    return this.ensureHead({
      code: BANK_CHARGES_HEAD.code,
      nameRegex: BANK_CHARGES_NAME_REGEX,
      spec: { ...BANK_CHARGES_HEAD },
    });
  }

  async resolveCollegeCourseCodes(student, exam) {
    const collegeName =
      student?.college?.trim() || exam?.college?.trim() || '';
    const courseName = student?.course?.trim() || exam?.course?.trim() || '';

    let collegeCode = 'GEN';
    let courseCode = 'GEN';

    try {
      const colleges = await this.sdms.listColleges(false);
      const college = colleges.find(
        (c) =>
          c.name?.toLowerCase() === collegeName.toLowerCase() ||
          c.code?.toLowerCase() === collegeName.toLowerCase(),
      );
      if (college?.code) collegeCode = String(college.code).toUpperCase().trim();
      else if (collegeName) {
        collegeCode = collegeName
          .replace(/[^a-zA-Z0-9]/g, '')
          .slice(0, 8)
          .toUpperCase() || 'GEN';
      }

      if (college?.id) {
        const courses = await this.sdms.listCourses(college.id, false);
        const course = courses.find(
          (c) =>
            c.name?.toLowerCase() === courseName.toLowerCase() ||
            c.code?.toLowerCase() === courseName.toLowerCase(),
        );
        if (course?.code) {
          courseCode = String(course.code).toUpperCase().trim();
        } else if (courseName) {
          courseCode =
            courseName
              .replace(/[^a-zA-Z0-9]/g, '')
              .slice(0, 8)
              .toUpperCase() || 'GEN';
        }
      } else if (courseName) {
        courseCode =
          courseName
            .replace(/[^a-zA-Z0-9]/g, '')
            .slice(0, 8)
            .toUpperCase() || 'GEN';
      }
    } catch {
      // Fall back to sanitized names
      if (collegeName) {
        collegeCode =
          collegeName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase() ||
          'GEN';
      }
      if (courseName) {
        courseCode =
          courseName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase() ||
          'GEN';
      }
    }

    return { collegeCode, courseCode, collegeName, courseName };
  }

  async findPaymentConfig(collegeCode, courseCode, collegeName, courseName) {
    const { PaymentConfig } = this.getModels();
    return (
      (await PaymentConfig.findOne({ collegeCode, courseCode })) ||
      (await PaymentConfig.findOne({
        college: collegeName,
        course: courseName,
      })) ||
      (await PaymentConfig.findOne({ collegeCode })) ||
      null
    );
  }

  /**
   * The Fee Management portal keeps the custom receipt sequence flags in the
   * global `settings` collection (enableCustomReceiptSequence,
   * receiptSequencePadding, receiptSequenceSeparator, reset month/day).
   */
  async getReceiptSettings() {
    const { Settings } = this.getModels();
    return Settings.findOne({}).sort({ updatedAt: -1 });
  }

  async generateReceiptNumber(feeHeadId, collegeCode, courseCode, paymentConfig, settings) {
    const { FeeGroup, ReceiptSequence } = this.getModels();
    if (settings === undefined) {
      settings = await this.getReceiptSettings();
    }
    const enableCustom = this.isCustomReceiptEnabled(paymentConfig, settings);
    const padding = Number(
      settings?.receiptSequencePadding ??
        paymentConfig?.padding ??
        paymentConfig?.receiptPadding ??
        6,
    );
    const separator =
      settings?.receiptSequenceSeparator ??
      paymentConfig?.separator ??
      paymentConfig?.receiptSeparator ??
      '-';
    const financialYear = getFinancialYear(
      new Date(),
      Number(settings?.receiptSequenceResetMonth ?? 4),
      Number(settings?.receiptSequenceResetDay ?? 1),
    );

    if (!enableCustom) {
      const timestamp = Date.now().toString().slice(-6);
      const random = Math.floor(100 + Math.random() * 900).toString();
      return `REC${timestamp}${random}`;
    }

    let groupCode = 'GEN';
    if (feeHeadId) {
      const feeGroup = await FeeGroup.findOne({ feeHeads: feeHeadId });
      if (feeGroup?.code) {
        groupCode = String(feeGroup.code).toUpperCase().trim();
      }
    }

    let seq;
    try {
      seq = await ReceiptSequence.findOneAndUpdate(
        { collegeCode, courseCode, groupCode, financialYear },
        { $inc: { nextNumber: 1 } },
        { new: true, upsert: true },
      );
    } catch (err) {
      if (err.code === 11000) {
        seq = await ReceiptSequence.findOneAndUpdate(
          { collegeCode, courseCode, groupCode, financialYear },
          { $inc: { nextNumber: 1 } },
          { new: true },
        );
      } else {
        throw err;
      }
    }

    const paddedNum = String(seq.nextNumber).padStart(padding, '0');
    return `${collegeCode}${separator}${courseCode}${separator}${groupCode}${separator}${paddedNum}`;
  }

  /** Common Transaction document fields shared by all EMS-posted lines. */
  buildTransactionDoc(payload, overrides = {}) {
    const studentId =
      payload.student?.admissionNumber?.trim() ||
      payload.student?.pinNo?.trim() ||
      payload.studentRollNumber;

    return {
      studentId,
      studentName:
        payload.student?.studentName || payload.studentName || undefined,
      college:
        payload.student?.college || payload.college || payload.exam?.college || undefined,
      collegeId:
        payload.student?.collegeId ?? payload.collegeId ?? undefined,
      course:
        payload.student?.course || payload.course || payload.exam?.course || undefined,
      courseId:
        payload.student?.courseId ?? payload.courseId ?? undefined,
      branch:
        payload.student?.branch || payload.branch || payload.exam?.branch || undefined,
      branchId:
        payload.student?.branchId ?? payload.branchId ?? undefined,
      pinNo: payload.student?.pinNo || payload.pinNo || undefined,
      admissionNumber:
        payload.student?.admissionNumber || payload.admissionNumber || undefined,
      paymentDate: payload.paymentDate || new Date(),
      transactionType: 'DEBIT',
      paymentMode: mapPaymentMode(payload.paymentMethod),
      bankName: payload.bankName || undefined,
      referenceNo: payload.referenceNo || undefined,
      referenceDate: payload.referenceDate || undefined,
      semester:
        payload.exam?.semester != null
          ? String(payload.exam.semester)
          : payload.student?.currentSemester != null
            ? String(payload.student.currentSemester)
            : undefined,
      studentYear:
        payload.exam?.yearOfStudy != null
          ? String(payload.exam.yearOfStudy)
          : payload.student?.currentYear != null
            ? String(payload.student.currentYear)
            : undefined,
      collectedBy: payload.collectorUsername || payload.collectedBy || undefined,
      collectedByName: payload.collectedBy || undefined,
      gatewayPaymentId: payload.gatewayPaymentId || undefined,
      status: 'active',
      emsPaymentId: payload.emsPaymentId,
      emsFeeRecordId: payload.emsFeeRecordId,
      source: 'ems',
      ...overrides,
    };
  }

  async resolveReceiptContext(payload, feeHeadId) {
    const codes = await this.resolveCollegeCourseCodes(
      payload.student,
      payload.exam,
    );
    const paymentConfig = await this.findPaymentConfig(
      codes.collegeCode,
      codes.courseCode,
      codes.collegeName,
      codes.courseName,
    );
    const settings = await this.getReceiptSettings();
    const receiptNumber = await this.generateReceiptNumber(
      feeHeadId,
      codes.collegeCode,
      codes.courseCode,
      paymentConfig,
      settings,
    );
    return { codes, paymentConfig, settings, receiptNumber };
  }

  isCustomReceiptEnabled(paymentConfig, settings) {
    return (
      settings?.enableCustomReceiptSequence === true ||
      paymentConfig?.enableCustom === true ||
      paymentConfig?.enableCustomReceipt === true
    );
  }

  /**
   * Two heads share a receipt when they resolve to the same fee group —
   * matching the Fee Mgmt sequence generator, which buckets heads without
   * a group under 'GEN'.
   */
  async headsShareFeeGroup(headIdA, headIdB) {
    const { FeeGroup } = this.getModels();
    const [groupA, groupB] = await Promise.all([
      FeeGroup.findOne({ feeHeads: headIdA }),
      FeeGroup.findOne({ feeHeads: headIdB }),
    ]);
    const keyA = groupA ? String(groupA._id) : 'GEN';
    const keyB = groupB ? String(groupB._id) : 'GEN';
    return keyA === keyB;
  }

  /**
   * Create Fee Management Transaction(s) for a successful EMS exam-fee payment.
   * The exam fee posts under the Exam Fee head; any late-fee portion posts as
   * a separate Transaction under the Late Fee head.
   *
   * Receipt rule (mirrors Fee Mgmt behaviour):
   * - Custom receipts enabled: the fee groups decide. Same group → shared
   *   receipt (one sequence number); different groups → each line gets its
   *   own receipt from its own group sequence.
   * - Custom receipts disabled: single shared receipt (REC… fallback).
   *
   * Append-only: never cancels or updates existing rows.
   */
  async postExamFeeTransaction(payload) {
    if (!this.isEnabled()) {
      return { skipped: true, reason: 'fee_management_not_connected' };
    }

    const { Transaction } = this.getModels();
    const feeHead = await this.ensureExamFeeHead();

    const total = Number(payload.amount);
    const lateFeeAmount = Math.max(
      0,
      Math.min(Number(payload.lateFeeAmount || 0), total),
    );
    const baseAmount = total - lateFeeAmount;

    // Idempotent: same EMS payment must not create duplicate Fee Mgmt rows.
    // A payment can own two rows (exam_fee + late_fee), so check per line.
    let existingRows = [];
    if (payload.emsPaymentId) {
      existingRows = await Transaction.find({
        emsPaymentId: payload.emsPaymentId,
        source: 'ems',
      });
    }
    let mainTxn =
      existingRows.find(
        (t) => !t.emsLineType || t.emsLineType === 'exam_fee',
      ) || null;
    let lateTxn =
      existingRows.find((t) => t.emsLineType === 'late_fee') || null;

    if (!mainTxn && payload.gatewayPaymentId) {
      mainTxn = await Transaction.findOne({
        gatewayPaymentId: payload.gatewayPaymentId,
      });
    }

    const lateFeeNeeded = lateFeeAmount > 0 && !lateTxn;

    if (mainTxn && !lateFeeNeeded) {
      return {
        skipped: false,
        alreadyPosted: true,
        transactionId: String(mainTxn._id),
        receiptNumber: mainTxn.receiptNumber,
        feeHeadCode: feeHead.code,
      };
    }

    const codes = await this.resolveCollegeCourseCodes(
      payload.student,
      payload.exam,
    );
    const paymentConfig = await this.findPaymentConfig(
      codes.collegeCode,
      codes.courseCode,
      codes.collegeName,
      codes.courseName,
    );
    const settings = await this.getReceiptSettings();

    // Decide receipt sharing before generating anything, so we consume the
    // right number of sequence slots.
    let lateFeeHead = null;
    let shareReceipt = true;
    if (lateFeeNeeded) {
      lateFeeHead = await this.ensureLateFeeHead();
      if (this.isCustomReceiptEnabled(paymentConfig, settings)) {
        shareReceipt = await this.headsShareFeeGroup(
          feeHead._id,
          lateFeeHead._id,
        );
      }
    }

    let receiptNumber = mainTxn?.receiptNumber || null;
    if (!receiptNumber) {
      receiptNumber = await this.generateReceiptNumber(
        feeHead._id,
        codes.collegeCode,
        codes.courseCode,
        paymentConfig,
        settings,
      );
    }

    const alreadyPosted = Boolean(mainTxn);
    if (!mainTxn) {
      mainTxn = await Transaction.create(
        this.buildTransactionDoc(payload, {
          feeHead: feeHead._id,
          amount: baseAmount,
          gatewayPaymentId: payload.gatewayPaymentId || undefined,
          receiptNumber,
          paymentConfigId: paymentConfig?._id,
          remarks:
            payload.remarks ||
            (payload.exam?.name
              ? `Exam fee — ${payload.exam.name}`
              : 'Exam fee'),
          emsLineType: 'exam_fee',
        }),
      );
    }

    let lateFee = null;
    if (lateFeeNeeded) {
      let lateReceiptNumber = receiptNumber;
      if (!shareReceipt) {
        // Different fee group → its own receipt from its own group sequence
        lateReceiptNumber = await this.generateReceiptNumber(
          lateFeeHead._id,
          codes.collegeCode,
          codes.courseCode,
          paymentConfig,
          settings,
        );
      }
      // No gatewayPaymentId here — that field is unique in Fee Mgmt and
      // belongs to the exam-fee row; keep the gateway ref in referenceNo.
      lateTxn = await Transaction.create(
        this.buildTransactionDoc(payload, {
          feeHead: lateFeeHead._id,
          amount: lateFeeAmount,
          receiptNumber: lateReceiptNumber,
          paymentConfigId: paymentConfig?._id,
          referenceNo:
            payload.gatewayPaymentId || payload.referenceNo || undefined,
          remarks: payload.exam?.name
            ? `Exam late fee — ${payload.exam.name}`
            : 'Exam late fee',
          emsLineType: 'late_fee',
        }),
      );
      lateFee = {
        transactionId: String(lateTxn._id),
        feeHeadCode: lateFeeHead.code,
        amount: lateFeeAmount,
        receiptNumber: lateReceiptNumber,
        sharedReceipt: shareReceipt,
      };
    } else if (lateTxn) {
      lateFee = {
        transactionId: String(lateTxn._id),
        amount: Number(lateTxn.amount),
        receiptNumber: lateTxn.receiptNumber,
        alreadyPosted: true,
      };
    }

    return {
      skipped: false,
      alreadyPosted,
      transactionId: String(mainTxn._id),
      receiptNumber: mainTxn.receiptNumber,
      feeHeadId: String(feeHead._id),
      feeHeadCode: feeHead.code,
      baseAmount,
      lateFee,
    };
  }

  /**
   * Create a Fee Management Transaction for the UPI convenience / bank
   * charges companion payment, under the Bank Charges (BNKCH) head.
   */
  async postBankChargesTransaction(payload) {
    if (!this.isEnabled()) {
      return { skipped: true, reason: 'fee_management_not_connected' };
    }

    const { Transaction } = this.getModels();

    if (payload.emsPaymentId) {
      const existing = await Transaction.findOne({
        emsPaymentId: payload.emsPaymentId,
        source: 'ems',
      });
      if (existing) {
        return {
          skipped: false,
          alreadyPosted: true,
          transactionId: String(existing._id),
          receiptNumber: existing.receiptNumber,
          feeHeadCode: BANK_CHARGES_HEAD.code,
        };
      }
    }

    const feeHead = await this.ensureBankChargesHead();
    const { paymentConfig, receiptNumber } = await this.resolveReceiptContext(
      payload,
      feeHead._id,
    );

    // gatewayPaymentId stays on the exam-fee row (unique field in Fee Mgmt);
    // the companion keeps the gateway ref in referenceNo instead.
    const doc = await Transaction.create(
      this.buildTransactionDoc(payload, {
        feeHead: feeHead._id,
        amount: Number(payload.amount),
        receiptNumber,
        paymentConfigId: paymentConfig?._id,
        referenceNo:
          payload.gatewayPaymentId || payload.referenceNo || undefined,
        remarks:
          payload.remarks ||
          (payload.exam?.name
            ? `Bank charges — ${payload.exam.name}`
            : 'Bank charges (online payment)'),
        emsLineType: 'bank_charges',
      }),
    );

    return {
      skipped: false,
      alreadyPosted: false,
      transactionId: String(doc._id),
      receiptNumber: doc.receiptNumber,
      feeHeadId: String(feeHead._id),
      feeHeadCode: feeHead.code,
    };
  }

  /**
   * Overdue fee due clearance for exam apply / hall ticket gates.
   * Uses StudentFee demands + APPROVED concessions + active Transactions.
   */
  async getStudentDueClearance(student, options = {}) {
    const asOfDate =
      toDateOnly(options.asOfDate) || new Date().toISOString().slice(0, 10);

    if (!this.isEnabled()) {
      return emptyClearance({
        asOfDate,
        skipped: true,
        reason: 'fee_management_not_connected',
        message: 'Fee Management is not connected; due check skipped.',
      });
    }

    const keys = studentKeys(student);
    if (keys.length === 0) {
      return emptyClearance({
        asOfDate,
        skipped: true,
        reason: 'student_identity_missing',
        message: 'Student has no admission number / PIN for due check.',
      });
    }

    const escapeRe = (k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const identityClause = (field) => ({
      $or: keys.flatMap((k) => [
        { [field]: k },
        { [field]: new RegExp(`^${escapeRe(k)}$`, 'i') },
      ]),
    });

    const {
      StudentFee,
      Transaction,
      OverallConcessionRequest,
      ConcessionRequest,
      FeeHead,
      FeeStructure,
    } = this.getModels();

    const [studentFees, transactions, overallConcessions, applicationConcessions] =
      await Promise.all([
        StudentFee.find({
          ...identityClause('studentId'),
          isActive: { $ne: false },
        }).lean(),
        Transaction.find({
          ...identityClause('studentId'),
          status: { $ne: 'cancelled' },
        }).lean(),
        OverallConcessionRequest.find({
          status: 'APPROVED',
          $or: [
            ...identityClause('admissionNumber').$or,
            ...identityClause('pinNo').$or,
          ],
        }).lean(),
        ConcessionRequest.find({
          status: 'APPROVED',
          $or: [
            ...identityClause('studentId').$or,
            ...identityClause('studentPin').$or,
          ],
        }).lean(),
      ]);

    const headIds = new Set();
    const structureIds = new Set();
    for (const fee of studentFees) {
      if (fee.feeHead) headIds.add(idStr(fee.feeHead));
      if (fee.structureId) structureIds.add(idStr(fee.structureId));
    }
    for (const txn of transactions) {
      if (txn.feeHead) headIds.add(idStr(txn.feeHead));
    }
    for (const req of applicationConcessions) {
      if (req.feeHead) headIds.add(idStr(req.feeHead));
    }
    for (const req of overallConcessions) {
      for (const entry of req.concessions || []) {
        if (entry.feeHeadId) headIds.add(idStr(entry.feeHeadId));
      }
    }

    const [heads, structures] = await Promise.all([
      headIds.size
        ? FeeHead.find({ _id: { $in: Array.from(headIds) } }).lean()
        : [],
      structureIds.size
        ? FeeStructure.find({ _id: { $in: Array.from(structureIds) } }).lean()
        : [],
    ]);

    const feeHeadsById = new Map(heads.map((h) => [idStr(h._id), h]));
    const structuresById = new Map(
      structures.map((s) => [idStr(s._id), s]),
    );

    const semesterStartByYearSem = await this.resolveSemesterStarts(
      student,
      studentFees,
      structures,
    );

    return computeDueClearance({
      studentFees,
      transactions,
      overallConcessions,
      applicationConcessions,
      feeHeadsById,
      structuresById,
      asOfDate,
      semesterStartByYearSem,
    });
  }

  /**
   * Best-effort SDMS semester start dates for offset-based due dates.
   * Keyed as `${studentYear}|${semester}` (includes FeeStructure referenceSemester).
   */
  async resolveSemesterStarts(student, studentFees, structures = []) {
    const map = new Map();
    if (!this.sdms?.listSemesters) return map;

    const pairs = new Set();
    for (const fee of studentFees || []) {
      const y = fee.studentYear != null ? Number(fee.studentYear) : null;
      const s = fee.semester != null ? Number(fee.semester) : null;
      if (y != null && s != null) pairs.add(`${y}|${s}`);
      // Year-level demands (semester null) still need term reference semesters.
      if (y != null && s == null) {
        pairs.add(`${y}|1`);
        pairs.add(`${y}|2`);
      }
    }
    for (const st of structures || []) {
      const y =
        st.studentYear != null
          ? Number(st.studentYear)
          : null;
      const terms = Array.isArray(st.terms) ? st.terms : [];
      for (const t of terms) {
        const ref =
          t.referenceSemester != null
            ? Number(t.referenceSemester)
            : st.semester != null
              ? Number(st.semester)
              : null;
        if (y != null && ref != null) pairs.add(`${y}|${ref}`);
      }
    }
    if (pairs.size === 0) return map;

    try {
      const rows = await this.sdms.listSemesters({
        batch: student?.batch || undefined,
      });
      for (const row of rows || []) {
        const y = Number(row.yearOfStudy);
        const s = Number(row.semesterNumber ?? row.semester);
        if (!Number.isFinite(y) || !Number.isFinite(s)) continue;
        const key = `${y}|${s}`;
        if (!pairs.has(key)) continue;
        const start = toDateOnly(row.startDate);
        if (start) map.set(key, start);
      }
    } catch {
      // Calendar lookup is optional; due dates fall back to as-of.
    }
    return map;
  }

  /**
   * Batch due clearance for eligible-student lists / publish summaries.
   */
  async getStudentsDueClearanceMap(students, options = {}) {
    const result = new Map();
    if (!Array.isArray(students) || students.length === 0) return result;

    // Sequential is safer for Mongo load; lists are typically hundreds, not thousands.
    for (const student of students) {
      const key =
        String(student.id ?? student.rollNumber ?? student.admissionNumber ?? '')
          .trim()
          .toLowerCase() || String(result.size);
      try {
        result.set(key, await this.getStudentDueClearance(student, options));
      } catch {
        result.set(
          key,
          emptyClearance({
            skipped: true,
            reason: 'due_check_failed',
            message: 'Due check failed; treating as clear.',
          }),
        );
      }
    }
    return result;
  }
}

module.exports = {
  FeeManagementService,
  mapPaymentMode,
  getFinancialYear,
  EXAM_FEE_HEAD,
  LATE_FEE_HEAD,
  BANK_CHARGES_HEAD,
};
