import { Repository } from 'typeorm';
import { AppError } from '../common/errors';
import { Exam, ExamSubject, LateFeeSlab } from './schemas/exam.schema';
import { ExamFeeRecord, Payment } from './schemas/fee.schema';
import {
  ExamStatus,
  ExamType,
  FeeStatus,
  PaymentMode,
  PaymentStatus,
} from './schemas/exam.enums';
import {
  CreateExamDto,
  UpdateExamDto,
  RejectExamDto,
  PublishExamDto,
  StudentRefDto,
  OnlinePaymentDto,
  OfflinePaymentDto,
} from './dto/exam.dto';
import { SubjectsService } from '../subjects/subjects.service';
import { RegulationsService } from '../regulations/regulations.service';

export class ExamService {
  constructor(
    private readonly examRepo: Repository<Exam>,
    private readonly examSubjectRepo: Repository<ExamSubject>,
    private readonly feeRecordRepo: Repository<ExamFeeRecord>,
    private readonly paymentRepo: Repository<Payment>,
    private readonly subjectsService: SubjectsService,
    private readonly regulationsService: RegulationsService,
  ) {}

  private async validateExamSubjects(
    regulationId: number,
    course: string,
    branch: string,
    batch: string,
    semester: number,
    subjectFees: { subjectId: number; fee: number }[],
  ) {
    const mapped = await this.subjectsService.getMappedSubjectsForExam({
      regulationId,
      course,
      branch,
      batch,
      semester,
    });
    const mappedIds = new Set(mapped.map((s) => s.id));
    for (const sf of subjectFees) {
      if (!mappedIds.has(sf.subjectId)) {
        throw AppError.badRequest(
          `Subject ${sf.subjectId} is not mapped for this academic scope`,
        );
      }
    }
  }

  private validateDates(dto: {
    applicationEndDate?: string;
    examinationStartDate?: string;
    examinationEndDate?: string;
  }) {
    if (
      dto.applicationEndDate &&
      dto.examinationStartDate &&
      dto.applicationEndDate >= dto.examinationStartDate
    ) {
      throw AppError.badRequest(
        'Application end date must be earlier than examination start date',
      );
    }
    if (
      dto.examinationStartDate &&
      dto.examinationEndDate &&
      dto.examinationStartDate > dto.examinationEndDate
    ) {
      throw AppError.badRequest(
        'Examination start date cannot be after end date',
      );
    }
  }

  async create(dto: CreateExamDto): Promise<Exam> {
    await this.regulationsService.findOne(dto.regulationId);
    await this.validateExamSubjects(
      dto.regulationId,
      dto.course,
      dto.branch,
      dto.batch,
      dto.semester,
      dto.subjects,
    );
    this.validateDates(dto);

    const exam = this.examRepo.create({
      name: dto.name,
      type: dto.type ?? ExamType.REGULAR,
      regulationId: dto.regulationId,
      course: dto.course,
      branch: dto.branch,
      batch: dto.batch,
      semester: dto.semester,
      packageFee: dto.packageFee,
      examinationStartDate: dto.examinationStartDate,
      examinationEndDate: dto.examinationEndDate,
      applicationStartDate: dto.applicationStartDate,
      applicationEndDate: dto.applicationEndDate,
      lateFeeStartDate: dto.lateFeeStartDate,
      instructions: dto.instructions,
      status: dto.submitForApproval
        ? ExamStatus.PENDING_APPROVAL
        : ExamStatus.DRAFT,
      examSubjects: dto.subjects.map((s) =>
        this.examSubjectRepo.create({
          subjectId: s.subjectId,
          fee: s.fee,
        }),
      ),
      lateFeeSlabs: (dto.lateFeeSlabs ?? []).map((slab) =>
        Object.assign(new LateFeeSlab(), slab),
      ),
    });
    return this.examRepo.save(exam);
  }

  findAll(status?: ExamStatus): Promise<Exam[]> {
    const where = status ? { status } : {};
    return this.examRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async findOne(id: number): Promise<Exam> {
    const exam = await this.examRepo.findOne({ where: { id } });
    if (!exam) throw AppError.notFound('Examination not found');
    return exam;
  }

  async update(id: number, dto: UpdateExamDto): Promise<Exam> {
    const exam = await this.findOne(id);
    if (
      exam.status !== ExamStatus.DRAFT &&
      exam.status !== ExamStatus.REJECTED
    ) {
      throw AppError.badRequest(
        'Only draft or rejected examinations can be updated',
      );
    }

    if (dto.subjects) {
      await this.validateExamSubjects(
        dto.regulationId ?? exam.regulationId,
        dto.course ?? exam.course,
        dto.branch ?? exam.branch,
        dto.batch ?? exam.batch,
        dto.semester ?? exam.semester,
        dto.subjects,
      );
      await this.examSubjectRepo.delete({ examId: id });
      exam.examSubjects = dto.subjects.map((s) =>
        this.examSubjectRepo.create({
          examId: id,
          subjectId: s.subjectId,
          fee: s.fee,
        }),
      );
    }

    if (dto.lateFeeSlabs) {
      exam.lateFeeSlabs = dto.lateFeeSlabs.map((slab) =>
        Object.assign(new LateFeeSlab(), { ...slab, examId: id }),
      );
    }

    this.validateDates({
      applicationEndDate: dto.applicationEndDate ?? exam.applicationEndDate,
      examinationStartDate:
        dto.examinationStartDate ?? exam.examinationStartDate,
      examinationEndDate: dto.examinationEndDate ?? exam.examinationEndDate,
    });

    Object.assign(exam, {
      name: dto.name ?? exam.name,
      type: dto.type ?? exam.type,
      regulationId: dto.regulationId ?? exam.regulationId,
      course: dto.course ?? exam.course,
      branch: dto.branch ?? exam.branch,
      batch: dto.batch ?? exam.batch,
      semester: dto.semester ?? exam.semester,
      packageFee: dto.packageFee ?? exam.packageFee,
      examinationStartDate:
        dto.examinationStartDate ?? exam.examinationStartDate,
      examinationEndDate: dto.examinationEndDate ?? exam.examinationEndDate,
      applicationStartDate:
        dto.applicationStartDate ?? exam.applicationStartDate,
      applicationEndDate: dto.applicationEndDate ?? exam.applicationEndDate,
      lateFeeStartDate: dto.lateFeeStartDate ?? exam.lateFeeStartDate,
      instructions: dto.instructions ?? exam.instructions,
      rejectionRemarks: null,
      status:
        dto.submitForApproval === true
          ? ExamStatus.PENDING_APPROVAL
          : exam.status === ExamStatus.REJECTED
            ? ExamStatus.DRAFT
            : exam.status,
    });

    return this.examRepo.save(exam);
  }

  async submitForApproval(id: number): Promise<Exam> {
    const exam = await this.findOne(id);
    if (exam.status !== ExamStatus.DRAFT && exam.status !== ExamStatus.REJECTED) {
      throw AppError.badRequest('Examination cannot be submitted');
    }
    if (!exam.examSubjects?.length) {
      throw AppError.badRequest('At least one subject is required');
    }
    exam.status = ExamStatus.PENDING_APPROVAL;
    exam.rejectionRemarks = null;
    return this.examRepo.save(exam);
  }

  async approve(id: number, approverName: string): Promise<Exam> {
    const exam = await this.findOne(id);
    if (exam.status !== ExamStatus.PENDING_APPROVAL) {
      throw AppError.badRequest('Examination is not pending approval');
    }
    exam.status = ExamStatus.APPROVED;
    exam.approvedBy = approverName;
    exam.approvedAt = new Date();
    exam.rejectionRemarks = null;
    return this.examRepo.save(exam);
  }

  async reject(id: number, dto: RejectExamDto): Promise<Exam> {
    const exam = await this.findOne(id);
    if (exam.status !== ExamStatus.PENDING_APPROVAL) {
      throw AppError.badRequest('Examination is not pending approval');
    }
    exam.status = ExamStatus.REJECTED;
    exam.rejectionRemarks = dto.remarks;
    return this.examRepo.save(exam);
  }

  async publish(id: number, dto: PublishExamDto): Promise<Exam> {
    const exam = await this.findOne(id);
    if (exam.status !== ExamStatus.APPROVED) {
      throw AppError.badRequest('Only approved examinations can be published');
    }
    exam.status = ExamStatus.PUBLISHED;
    exam.publishedAt = new Date();
    await this.examRepo.save(exam);

    if (dto.students?.length) {
      await this.generateFees(id, dto.students);
    }
    return this.findOne(id);
  }

  calculateFee(
    exam: Exam,
    selectedSubjectIds: number[],
  ): {
    breakdown: { subjectId: number; subjectCode: string; fee: number }[];
    baseFee: number;
  } {
    const allExamSubjectIds = exam.examSubjects.map((es) => es.subjectId);
    for (const sid of selectedSubjectIds) {
      if (!allExamSubjectIds.includes(sid)) {
        throw AppError.badRequest(`Subject ${sid} is not part of this exam`);
      }
    }

    const breakdown = exam.examSubjects
      .filter((es) => selectedSubjectIds.includes(es.subjectId))
      .map((es) => ({
        subjectId: es.subjectId,
        subjectCode: es.subject?.code ?? String(es.subjectId),
        fee: Number(es.fee),
      }));

    const subjectWiseTotal = breakdown.reduce((sum, b) => sum + b.fee, 0);
    const allSelected =
      selectedSubjectIds.length === allExamSubjectIds.length &&
      allExamSubjectIds.every((sid) => selectedSubjectIds.includes(sid));

    let baseFee = subjectWiseTotal;
    if (allSelected && exam.packageFee != null) {
      baseFee = Math.min(subjectWiseTotal, Number(exam.packageFee));
    }

    return { breakdown, baseFee };
  }

  async generateFees(
    examId: number,
    students: StudentRefDto[],
  ): Promise<ExamFeeRecord[]> {
    const exam = await this.findOne(examId);
    if (exam.status !== ExamStatus.PUBLISHED) {
      throw AppError.badRequest(
        'Fee records can only be generated for published examinations',
      );
    }

    const records: ExamFeeRecord[] = [];
    for (const student of students) {
      const existing = await this.feeRecordRepo.findOne({
        where: { examId, studentRollNumber: student.rollNumber },
      });
      if (existing) {
        throw AppError.badRequest(
          `Fee record already exists for student ${student.rollNumber}`,
        );
      }

      const selectedSubjectIds =
        student.selectedSubjectIds ??
        exam.examSubjects.map((es) => es.subjectId);

      const { breakdown, baseFee } = this.calculateFee(exam, selectedSubjectIds);

      const record = this.feeRecordRepo.create({
        examId,
        studentRollNumber: student.rollNumber,
        studentName: student.name,
        selectedSubjectIds,
        feeBreakdown: breakdown,
        baseFee,
        lateFee: 0,
        totalAmount: baseFee,
        status: FeeStatus.PENDING,
        dueDate: exam.applicationEndDate,
      });
      records.push(await this.feeRecordRepo.save(record));
    }
    return records;
  }

  listFeeRecords(examId?: number, rollNumber?: string): Promise<ExamFeeRecord[]> {
    const where: Record<string, unknown> = {};
    if (examId) where.examId = examId;
    if (rollNumber) where.studentRollNumber = rollNumber;
    return this.feeRecordRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async getFeeRecord(id: number): Promise<ExamFeeRecord> {
    const record = await this.feeRecordRepo.findOne({ where: { id } });
    if (!record) throw AppError.notFound('Fee record not found');
    return record;
  }

  private generateReceiptNumber(): string {
    return `RCP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }

  async payOnline(
    feeRecordId: number,
    dto: OnlinePaymentDto,
  ): Promise<{ payment: Payment; feeRecord: ExamFeeRecord }> {
    const feeRecord = await this.getFeeRecord(feeRecordId);
    if (feeRecord.status === FeeStatus.PAID) {
      throw AppError.badRequest('Fee already paid');
    }

    const payment = this.paymentRepo.create({
      feeRecordId,
      amountPaid: feeRecord.totalAmount,
      paymentMode: PaymentMode.ONLINE,
      paymentMethod: dto.paymentMethod,
      status: PaymentStatus.SUCCESS,
      receiptNumber: this.generateReceiptNumber(),
      transactionReference:
        dto.transactionReference ?? `GW-${Date.now()}`,
      gatewayResponse: JSON.stringify({ simulated: true, status: 'success' }),
    });
    await this.paymentRepo.save(payment);

    feeRecord.status = FeeStatus.PAID;
    await this.feeRecordRepo.save(feeRecord);

    return { payment, feeRecord };
  }

  async payOffline(dto: OfflinePaymentDto): Promise<{
    payment: Payment;
    feeRecord: ExamFeeRecord;
  }> {
    const feeRecord = await this.feeRecordRepo.findOne({
      where: {
        examId: dto.examId,
        studentRollNumber: dto.studentRollNumber,
      },
    });
    if (!feeRecord) {
      throw AppError.notFound('Pending fee record not found for student');
    }
    if (feeRecord.status === FeeStatus.PAID) {
      throw AppError.badRequest('Fee already paid');
    }

    const payment = this.paymentRepo.create({
      feeRecordId: feeRecord.id,
      amountPaid: feeRecord.totalAmount,
      paymentMode: PaymentMode.OFFLINE,
      paymentMethod: dto.paymentMethod,
      status: PaymentStatus.SUCCESS,
      receiptNumber: this.generateReceiptNumber(),
      transactionReference: dto.transactionNumber,
      collectedBy: dto.collectedBy,
      gatewayResponse: JSON.stringify({
        bankName: dto.bankName,
        offline: true,
      }),
    });
    await this.paymentRepo.save(payment);

    feeRecord.status = FeeStatus.PAID;
    await this.feeRecordRepo.save(feeRecord);

    return { payment, feeRecord };
  }

  listPayments(feeRecordId?: number): Promise<Payment[]> {
    const where = feeRecordId ? { feeRecordId } : {};
    return this.paymentRepo.find({ where, order: { paidAt: 'DESC' } });
  }
}
