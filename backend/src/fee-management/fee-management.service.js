'use strict';

const { config } = require('../config');
const {
  getFeeManagementConnection,
  isFeeManagementConnected,
} = require('./connection');
const { registerFeeManagementModels } = require('./models');

const EXAM_FEE_HEAD = {
  name: 'Exam Fee',
  code: 'EXM01',
  description: 'Examination processing fee',
};

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

/** Indian FY: Apr–Mar → e.g. "2025-26" */
function getFinancialYear(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth();
  if (month >= 3) {
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

  async ensureExamFeeHead() {
    const { FeeHead } = this.getModels();
    const code = config.feeManagement.examFeeHeadCode || EXAM_FEE_HEAD.code;
    let head = await FeeHead.findOne({ code });
    if (head) return head;
    head = await FeeHead.findOne({ name: EXAM_FEE_HEAD.name });
    if (head) return head;
    return FeeHead.create({
      name: EXAM_FEE_HEAD.name,
      code,
      description: EXAM_FEE_HEAD.description,
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

  async generateReceiptNumber(feeHeadId, collegeCode, courseCode, paymentConfig) {
    const { FeeGroup, ReceiptSequence } = this.getModels();
    const enableCustom =
      paymentConfig?.enableCustom === true ||
      paymentConfig?.enableCustomReceipt === true;
    const padding = Number(
      paymentConfig?.padding ?? paymentConfig?.receiptPadding ?? 6,
    );
    const separator =
      paymentConfig?.separator ?? paymentConfig?.receiptSeparator ?? '-';
    const financialYear = getFinancialYear();

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

  /**
   * Create a Fee Management Transaction for a successful EMS exam-fee payment.
   * Never cancels or updates existing Fee Mgmt transactions (append-only from EMS).
   */
  async postExamFeeTransaction(payload) {
    if (!this.isEnabled()) {
      return { skipped: true, reason: 'fee_management_not_connected' };
    }

    const { Transaction } = this.getModels();
    const feeHead = await this.ensureExamFeeHead();

    // Idempotent: same EMS payment must not create duplicate Fee Mgmt rows
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
        };
      }
    }
    if (payload.gatewayPaymentId) {
      const byGateway = await Transaction.findOne({
        gatewayPaymentId: payload.gatewayPaymentId,
      });
      if (byGateway) {
        return {
          skipped: false,
          alreadyPosted: true,
          transactionId: String(byGateway._id),
          receiptNumber: byGateway.receiptNumber,
        };
      }
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

    const receiptNumber = await this.generateReceiptNumber(
      feeHead._id,
      codes.collegeCode,
      codes.courseCode,
      paymentConfig,
    );

    const studentId =
      payload.student?.admissionNumber?.trim() ||
      payload.student?.pinNo?.trim() ||
      payload.studentRollNumber;

    const doc = await Transaction.create({
      studentId,
      studentName:
        payload.student?.studentName ||
        payload.studentName ||
        undefined,
      feeHead: feeHead._id,
      amount: Number(payload.amount),
      paymentDate: payload.paymentDate || new Date(),
      transactionType: 'DEBIT',
      paymentMode: mapPaymentMode(payload.paymentMethod),
      bankName: payload.bankName || undefined,
      referenceNo: payload.referenceNo || undefined,
      referenceDate: payload.referenceDate || undefined,
      gatewayPaymentId: payload.gatewayPaymentId || undefined,
      remarks:
        payload.remarks ||
        (payload.exam?.name ? `Exam fee — ${payload.exam.name}` : 'Exam fee'),
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
      receiptNumber,
      collectedBy: payload.collectorUsername || payload.collectedBy || undefined,
      collectedByName: payload.collectedBy || undefined,
      paymentConfigId: paymentConfig?._id,
      status: 'active',
      emsPaymentId: payload.emsPaymentId,
      emsFeeRecordId: payload.emsFeeRecordId,
      source: 'ems',
    });

    return {
      skipped: false,
      alreadyPosted: false,
      transactionId: String(doc._id),
      receiptNumber: doc.receiptNumber,
      feeHeadId: String(feeHead._id),
      feeHeadCode: feeHead.code,
    };
  }
}

module.exports = {
  FeeManagementService,
  mapPaymentMode,
  getFinancialYear,
  EXAM_FEE_HEAD,
};
