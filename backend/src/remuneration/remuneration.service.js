'use strict';

const { AppError } = require('../common/errors');
const {
  BillType,
  BillStatus,
  BILL_TYPE_LABELS,
  DEFAULT_LINE_SUGGESTIONS,
} = require('./schemas/remuneration.enums');
const { amountToWords } = require('./utils/amount-to-words');

class RemunerationService {
  constructor(billRepo, professionalRepo, examRepo, regulationRepo, professionalsService) {
    this.billRepo = billRepo;
    this.professionalRepo = professionalRepo;
    this.examRepo = examRepo;
    this.regulationRepo = regulationRepo;
    this.professionals = professionalsService;
  }

  meta() {
    return {
      billTypes: Object.values(BillType).map((value) => ({
        value,
        label: BILL_TYPE_LABELS[value],
      })),
      statuses: Object.values(BillStatus),
      defaultLineSuggestions: DEFAULT_LINE_SUGGESTIONS,
    };
  }

  normalizeLineItems(items) {
    if (!Array.isArray(items)) return [];
    return items
      .map((item) => {
        const quantity = Number(item.quantity) || 0;
        const unitPrice = Number(item.unitPrice) || 0;
        const amount =
          item.amount !== undefined && item.amount !== null && item.amount !== ''
            ? Number(item.amount)
            : quantity * unitPrice;
        return {
          remunerationFor: String(item.remunerationFor || '').trim(),
          quantity,
          unitPrice,
          amount: Math.round(amount * 100) / 100,
        };
      })
      .filter((item) => item.remunerationFor || item.quantity || item.unitPrice);
  }

  computeTotals(lineItems) {
    const grandTotalQuantity = lineItems.reduce(
      (sum, row) => sum + (Number(row.quantity) || 0),
      0,
    );
    const grandTotalAmount = lineItems.reduce(
      (sum, row) => sum + (Number(row.amount) || 0),
      0,
    );
    return {
      grandTotalQuantity: Math.round(grandTotalQuantity * 100) / 100,
      grandTotalAmount: Math.round(grandTotalAmount * 100) / 100,
      amountInWords: amountToWords(grandTotalAmount),
    };
  }

  normalizeSubjects(subjects) {
    if (!Array.isArray(subjects)) return [];
    return subjects
      .map((s) => ({
        subjectId: s.subjectId != null ? Number(s.subjectId) : null,
        examSubjectId: s.examSubjectId != null ? Number(s.examSubjectId) : null,
        code: s.code ? String(s.code) : null,
        name: String(s.name || '').trim(),
      }))
      .filter((s) => s.name || s.subjectId);
  }

  async nextBillNumber() {
    const year = new Date().getFullYear();
    const prefix = `RB-${year}-`;
    const latest = await this.billRepo
      .createQueryBuilder('b')
      .where('b.billNumber LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('b.id', 'DESC')
      .getOne();
    let seq = 1;
    if (latest?.billNumber) {
      const part = latest.billNumber.split('-').pop();
      const n = parseInt(part, 10);
      if (!Number.isNaN(n)) seq = n + 1;
    }
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  resolveActor(actor) {
    if (!actor) {
      return { by: 'System', byUsername: null };
    }
    const by =
      String(actor.fullName || actor.username || actor.name || '').trim() ||
      'Staff';
    const byUsername = actor.username ? String(actor.username).trim() : null;
    return { by, byUsername };
  }

  appendHistory(existingHistory, entry) {
    const history = Array.isArray(existingHistory) ? [...existingHistory] : [];
    history.push({
      ...entry,
      at: entry.at || new Date().toISOString(),
    });
    return history;
  }

  historyEntry({ action, status, fromStatus = null, actor, note = null }) {
    const { by, byUsername } = this.resolveActor(actor);
    return {
      action,
      status,
      fromStatus,
      by,
      byUsername,
      at: new Date().toISOString(),
      note,
    };
  }

  assertEditable(bill) {
    if (bill.status === BillStatus.PAID) {
      throw AppError.badRequest(
        'Paid bills are locked — editing and deleting are not allowed',
      );
    }
  }

  async resolveExamContext(dto) {
    const ctx = {
      examId: dto.examId ?? null,
      regulationId: dto.regulationId ?? null,
      regulationCode: dto.regulationCode?.trim() || null,
      academicYear: dto.academicYear?.trim() || null,
      course: dto.course?.trim() || null,
      branch: dto.branch?.trim() || null,
      batch: dto.batch?.trim() || null,
      yearOfStudy: dto.yearOfStudy != null ? Number(dto.yearOfStudy) : null,
      semester: dto.semester != null ? Number(dto.semester) : null,
      examName: dto.examName?.trim() || null,
    };

    if (!dto.examId) return ctx;

    const exam = await this.examRepo.findOne({
      where: { id: Number(dto.examId) },
      relations: ['regulation', 'examSubjects', 'examSubjects.subject', 'scopes'],
    });
    if (!exam) throw AppError.notFound('Exam not found');

    ctx.examId = exam.id;
    ctx.examName = ctx.examName || exam.name;
    ctx.regulationId = ctx.regulationId || exam.regulationId;
    ctx.regulationCode =
      ctx.regulationCode || exam.regulation?.code || null;
    ctx.course = ctx.course || exam.course;
    ctx.batch = ctx.batch || exam.batch;
    ctx.yearOfStudy =
      ctx.yearOfStudy != null ? ctx.yearOfStudy : exam.yearOfStudy;
    ctx.semester = ctx.semester != null ? ctx.semester : exam.semester;
    if (!ctx.branch && exam.scopes?.length === 1) {
      ctx.branch = exam.scopes[0].branch;
    } else if (!ctx.branch) {
      ctx.branch = exam.branch || null;
    }

    if (!ctx.regulationCode && ctx.regulationId) {
      const reg = await this.regulationRepo.findOne({
        where: { id: ctx.regulationId },
      });
      ctx.regulationCode = reg?.code || null;
    }

    return { ctx, exam };
  }

  async buildPayload(dto, { existing } = {}) {
    const billType = dto.billType || existing?.billType || BillType.QP_SETTING;
    if (!Object.values(BillType).includes(billType)) {
      throw AppError.badRequest('Invalid bill type');
    }

    const status = dto.status || existing?.status || BillStatus.DRAFT;
    if (!Object.values(BillStatus).includes(status)) {
      throw AppError.badRequest('Invalid bill status');
    }

    const professionalName = String(
      dto.professionalName || existing?.professionalName || '',
    ).trim();
    if (!professionalName) {
      throw AppError.badRequest('Professional name is required');
    }

    const { ctx } = await this.resolveExamContext({
      ...existing,
      ...dto,
    });

    const lineItems = this.normalizeLineItems(
      dto.lineItems !== undefined ? dto.lineItems : existing?.lineItems,
    );
    if (!lineItems.length) {
      throw AppError.badRequest('At least one remuneration line item is required');
    }
    const totals = this.computeTotals(lineItems);
    const subjects = this.normalizeSubjects(
      dto.subjects !== undefined ? dto.subjects : existing?.subjects,
    );

    let professionalId =
      dto.professionalId !== undefined
        ? dto.professionalId
        : existing?.professionalId ?? null;

    const saveToDirectory = dto.saveToDirectory !== false;
    if (saveToDirectory) {
      const saved = await this.professionals.upsertFromBillSnapshot({
        professionalName,
        designation: dto.designation ?? existing?.designation,
        organization: dto.organization ?? existing?.organization,
        contactNumber: dto.contactNumber ?? existing?.contactNumber,
        email: dto.email ?? existing?.email,
        bankName: dto.bankName ?? existing?.bankName,
        accountHolderName: dto.accountHolderName ?? existing?.accountHolderName,
        accountNumber: dto.accountNumber ?? existing?.accountNumber,
        ifscCode: dto.ifscCode ?? existing?.ifscCode,
        bankAddress: dto.bankAddress ?? existing?.bankAddress,
      });
      if (saved) professionalId = saved.id;
    }

    return {
      billType,
      status,
      professionalId,
      professionalName,
      designation: (dto.designation ?? existing?.designation)?.trim?.()
        ? String(dto.designation ?? existing?.designation).trim()
        : dto.designation ?? existing?.designation ?? null,
      organization:
        dto.organization !== undefined
          ? dto.organization?.trim() || null
          : existing?.organization ?? null,
      contactNumber:
        dto.contactNumber !== undefined
          ? dto.contactNumber?.trim() || null
          : existing?.contactNumber ?? null,
      email:
        dto.email !== undefined
          ? dto.email?.trim() || null
          : existing?.email ?? null,
      bankName:
        dto.bankName !== undefined
          ? dto.bankName?.trim() || null
          : existing?.bankName ?? null,
      accountHolderName:
        dto.accountHolderName !== undefined
          ? dto.accountHolderName?.trim() || null
          : existing?.accountHolderName ?? null,
      accountNumber:
        dto.accountNumber !== undefined
          ? dto.accountNumber?.trim() || null
          : existing?.accountNumber ?? null,
      ifscCode:
        dto.ifscCode !== undefined
          ? dto.ifscCode?.trim()?.toUpperCase() || null
          : existing?.ifscCode ?? null,
      bankAddress:
        dto.bankAddress !== undefined
          ? dto.bankAddress?.trim() || null
          : existing?.bankAddress ?? null,
      ...ctx,
      subjects,
      durationFrom:
        dto.durationFrom !== undefined
          ? dto.durationFrom || null
          : existing?.durationFrom ?? null,
      durationTo:
        dto.durationTo !== undefined
          ? dto.durationTo || null
          : existing?.durationTo ?? null,
      numberOfDays:
        dto.numberOfDays !== undefined
          ? dto.numberOfDays != null
            ? Number(dto.numberOfDays)
            : null
          : existing?.numberOfDays ?? null,
      lineItems,
      ...totals,
      billDate:
        dto.billDate !== undefined
          ? dto.billDate || null
          : existing?.billDate ?? new Date().toISOString().slice(0, 10),
      officeNotes:
        dto.officeNotes !== undefined
          ? dto.officeNotes?.trim() || null
          : existing?.officeNotes ?? null,
    };
  }

  async create(dto, actor) {
    const payload = await this.buildPayload(dto);
    const billNumber = await this.nextBillNumber();
    const statusHistory = this.appendHistory(
      [],
      this.historyEntry({
        action: 'created',
        status: payload.status,
        actor,
        note: 'Bill created',
      }),
    );
    const row = this.billRepo.create({
      ...payload,
      billNumber,
      statusHistory,
    });
    return this.billRepo.save(row);
  }

  async findAll(filters = {}) {
    const qb = this.billRepo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.professional', 'professional')
      .leftJoinAndSelect('b.exam', 'exam')
      .orderBy('b.id', 'DESC');

    if (filters.examId) {
      qb.andWhere('b.examId = :examId', { examId: Number(filters.examId) });
    }
    if (filters.billType) {
      qb.andWhere('b.billType = :billType', { billType: filters.billType });
    }
    if (filters.status) {
      qb.andWhere('b.status = :status', { status: filters.status });
    }
    if (filters.search) {
      const q = `%${String(filters.search).trim()}%`;
      qb.andWhere(
        '(b.professionalName LIKE :q OR b.billNumber LIKE :q OR b.examName LIKE :q OR b.branch LIKE :q)',
        { q },
      );
    }
    return qb.getMany();
  }

  async findOne(id) {
    const row = await this.billRepo.findOne({
      where: { id },
      relations: ['professional', 'exam'],
    });
    if (!row) throw AppError.notFound('Remuneration bill not found');
    return row;
  }

  async update(id, dto, actor) {
    const existing = await this.findOne(id);
    this.assertEditable(existing);

    const previousStatus = existing.status;
    const payload = await this.buildPayload(dto, { existing });
    // Status changes go through updateStatus so timeline stays accurate
    payload.status = previousStatus;

    Object.assign(existing, payload);
    existing.statusHistory = this.appendHistory(
      existing.statusHistory,
      this.historyEntry({
        action: 'updated',
        status: existing.status,
        actor,
        note: 'Bill details updated',
      }),
    );
    return this.billRepo.save(existing);
  }

  async updateStatus(id, status, actor) {
    if (!Object.values(BillStatus).includes(status)) {
      throw AppError.badRequest('Invalid bill status');
    }
    const row = await this.findOne(id);
    if (row.status === status) {
      return row;
    }
    if (row.status === BillStatus.PAID) {
      throw AppError.badRequest('Paid bills cannot change status');
    }

    const fromStatus = row.status;
    row.status = status;
    row.statusHistory = this.appendHistory(
      row.statusHistory,
      this.historyEntry({
        action: 'status_changed',
        status,
        fromStatus,
        actor,
        note: `Status changed from ${fromStatus} to ${status}`,
      }),
    );
    return this.billRepo.save(row);
  }

  async remove(id) {
    const row = await this.findOne(id);
    this.assertEditable(row);
    await this.billRepo.remove(row);
  }

  /**
   * Subjects available for a bill, filtered by the selected exam + optional branch.
   * Uses exam_subjects (papers on that exam), not the full catalog.
   */
  async subjectsForExam(examId, branch) {
    const exam = await this.examRepo.findOne({
      where: { id: Number(examId) },
      relations: ['examSubjects', 'examSubjects.subject', 'scopes'],
    });
    if (!exam) throw AppError.notFound('Exam not found');

    const branchFilter = branch?.trim() || null;
    const rows = (exam.examSubjects || [])
      .filter((es) => {
        if (!branchFilter) return true;
        // Common papers (null branch) apply to all; otherwise match branch
        if (!es.branch) return true;
        return es.branch.toLowerCase() === branchFilter.toLowerCase();
      })
      .map((es) => ({
        examSubjectId: es.id,
        subjectId: es.subjectId,
        code: es.subject?.code || null,
        name: es.subject?.name || `Subject #${es.subjectId}`,
        branch: es.branch || null,
        section: es.section || null,
        type: es.subject?.type || null,
        examDate: es.examDate || null,
      }));

    // De-dupe by subjectId+branch+section
    const seen = new Set();
    return rows.filter((r) => {
      const key = `${r.subjectId}|${r.branch || ''}|${r.section || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /** Branches available on an exam (from scopes). */
  async branchesForExam(examId) {
    const exam = await this.examRepo.findOne({
      where: { id: Number(examId) },
      relations: ['scopes'],
    });
    if (!exam) throw AppError.notFound('Exam not found');
    const names = [];
    const seen = new Set();
    for (const scope of exam.scopes || []) {
      const b = scope.branch?.trim();
      if (!b) continue;
      const key = b.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push({
        branch: b,
        branchId: scope.branchId ?? null,
        course: scope.course,
        batch: scope.batch,
        yearOfStudy: scope.yearOfStudy,
        semester: scope.semester,
      });
    }
    if (!names.length && exam.branch) {
      names.push({
        branch: exam.branch,
        branchId: null,
        course: exam.course,
        batch: exam.batch,
        yearOfStudy: exam.yearOfStudy,
        semester: exam.semester,
      });
    }
    return names;
  }

  /**
   * Seed sample professionals + bills against published (or any) exams
   * so the UI can be demonstrated end-to-end.
   */
  async simulateForPresentExams(actor) {
    const exams = await this.examRepo.find({
      where: { status: 'published' },
      relations: ['regulation', 'examSubjects', 'examSubjects.subject', 'scopes'],
      order: { id: 'DESC' },
      take: 5,
    });

    let targetExams = exams;
    if (!targetExams.length) {
      targetExams = await this.examRepo.find({
        relations: ['regulation', 'examSubjects', 'examSubjects.subject', 'scopes'],
        order: { id: 'DESC' },
        take: 3,
      });
    }
    if (!targetExams.length) {
      throw AppError.badRequest(
        'No exams found. Create and publish an exam first, then simulate.',
      );
    }

    const samplePros = [
      {
        name: 'Dr. DARAPU UMA',
        designation: 'ASSOCIATE PROFESSOR',
        organization: 'PRAGATI ENGINEERING COLLEGE (A)',
        contactNumber: '9876543210',
        email: 'darapu.uma@example.com',
        bankName: 'STATE BANK OF INDIA',
        accountHolderName: 'DARAPU UMA',
        accountNumber: '12345678901',
        ifscCode: 'SBIN0001234',
        bankAddress: 'SBI Main Branch, Kakinada',
      },
      {
        name: 'Mr. V. Satyanarayana',
        designation: 'Asst Professor',
        organization: 'KITS, Divili (Autonomous)',
        contactNumber: '9123456780',
        email: 'v.satyanarayana@example.com',
        bankName: 'Canara Bank',
        accountHolderName: 'V. Satyanarayana',
        accountNumber: '998877665544',
        ifscCode: 'CNRB0000456',
        bankAddress: 'Divili - Canara Bank',
      },
      {
        name: 'Dr. K. Ramesh',
        designation: 'Professor',
        organization: 'Aditya Engineering College (A)',
        contactNumber: '9000011122',
        email: 'k.ramesh@example.com',
        bankName: 'Union Bank of India',
        accountHolderName: 'K. RAMESH',
        accountNumber: '556677889900',
        ifscCode: 'UBIN0532101',
        bankAddress: 'Surampalem Branch',
      },
    ];

    const professionals = [];
    for (const p of samplePros) {
      professionals.push(await this.professionals.upsertFromBillSnapshot(p));
    }

    const createdBills = [];
    const exam = targetExams[0];
    const branch =
      exam.scopes?.[0]?.branch || exam.branch || 'Computer Science and Engineering';
    const subjectRows = (exam.examSubjects || [])
      .filter((es) => !es.branch || es.branch.toLowerCase() === branch.toLowerCase())
      .slice(0, 2)
      .map((es) => ({
        subjectId: es.subjectId,
        examSubjectId: es.id,
        code: es.subject?.code || null,
        name: es.subject?.name || `Subject #${es.subjectId}`,
      }));

    const academicYear = (() => {
      const y = new Date().getFullYear();
      const short = String(y).slice(-2);
      const next = String(y + 1).slice(-2);
      return `AY ${short} to ${next}`;
    })();

    const systemActor = actor || {
      fullName: 'System',
      username: 'system',
    };

    const qpPro = professionals[0];
    let qpBill = await this.create(
      {
        billType: BillType.QP_SETTING,
        status: BillStatus.DRAFT,
        examId: exam.id,
        professionalId: qpPro.id,
        professionalName: qpPro.name,
        designation: qpPro.designation,
        organization: qpPro.organization,
        contactNumber: qpPro.contactNumber,
        email: qpPro.email,
        bankName: qpPro.bankName,
        accountHolderName: qpPro.accountHolderName,
        accountNumber: qpPro.accountNumber,
        ifscCode: qpPro.ifscCode,
        bankAddress: qpPro.bankAddress,
        branch,
        academicYear,
        subjects: subjectRows.length
          ? subjectRows
          : [{ name: 'Probability and Statistics', code: null, subjectId: null }],
        lineItems: [
          {
            remunerationFor: 'Setting of Question Paper',
            quantity: 1,
            unitPrice: 1000,
          },
          {
            remunerationFor: 'Scheme of Valuation',
            quantity: 1,
            unitPrice: 500,
          },
        ],
        billDate: new Date().toISOString().slice(0, 10),
        saveToDirectory: false,
      },
      systemActor,
    );
    qpBill = await this.updateStatus(
      qpBill.id,
      BillStatus.SUBMITTED,
      { fullName: 'Exam Cell', username: 'exam_cell' },
    );
    createdBills.push(qpBill);

    const labPro = professionals[1];
    createdBills.push(
      await this.create(
        {
          billType: BillType.LAB_PROJECT,
          status: BillStatus.DRAFT,
          examId: exam.id,
          professionalId: labPro.id,
          professionalName: labPro.name,
          designation: labPro.designation,
          organization: labPro.organization,
          contactNumber: labPro.contactNumber,
          email: labPro.email,
          bankName: labPro.bankName,
          accountHolderName: labPro.accountHolderName,
          accountNumber: labPro.accountNumber,
          ifscCode: labPro.ifscCode,
          bankAddress: labPro.bankAddress,
          branch,
          academicYear,
          subjects: subjectRows.slice(0, 1).length
            ? subjectRows.slice(0, 1)
            : [
                {
                  name: 'Fluid mechanics & Hydraulic machines',
                  code: null,
                  subjectId: null,
                },
              ],
          durationFrom:
            exam.examinationStartDate || new Date().toISOString().slice(0, 10),
          durationTo:
            exam.examinationEndDate || new Date().toISOString().slice(0, 10),
          numberOfDays: 1,
          lineItems: [
            {
              remunerationFor: 'Laboratory Exams/Observer',
              quantity: 14,
              unitPrice: 20,
            },
            { remunerationFor: 'TA', quantity: 2, unitPrice: 50 },
            { remunerationFor: 'DA', quantity: 1, unitPrice: 200 },
          ],
          billDate: new Date().toISOString().slice(0, 10),
          saveToDirectory: false,
        },
        systemActor,
      ),
    );

    if (professionals[2] && targetExams[0]) {
      let evalBill = await this.create(
        {
          billType: BillType.EVALUATION,
          status: BillStatus.DRAFT,
          examId: exam.id,
          professionalId: professionals[2].id,
          professionalName: professionals[2].name,
          designation: professionals[2].designation,
          organization: professionals[2].organization,
          contactNumber: professionals[2].contactNumber,
          email: professionals[2].email,
          bankName: professionals[2].bankName,
          accountHolderName: professionals[2].accountHolderName,
          accountNumber: professionals[2].accountNumber,
          ifscCode: professionals[2].ifscCode,
          bankAddress: professionals[2].bankAddress,
          branch,
          academicYear,
          subjects: subjectRows,
          lineItems: [
            {
              remunerationFor: 'Script Valuation',
              quantity: 120,
              unitPrice: 15,
            },
          ],
          billDate: new Date().toISOString().slice(0, 10),
          saveToDirectory: false,
        },
        systemActor,
      );
      evalBill = await this.updateStatus(evalBill.id, BillStatus.SUBMITTED, {
        fullName: 'Exam Cell',
        username: 'exam_cell',
      });
      evalBill = await this.updateStatus(evalBill.id, BillStatus.PASSED, {
        fullName: 'Addl. Controller of Examinations',
        username: 'ace_ug',
      });
      createdBills.push(evalBill);
    }

    return {
      exam: {
        id: exam.id,
        name: exam.name,
        status: exam.status,
        course: exam.course,
        branch,
        yearOfStudy: exam.yearOfStudy,
        semester: exam.semester,
      },
      professionals,
      bills: createdBills,
    };
  }
}

module.exports = { RemunerationService };
