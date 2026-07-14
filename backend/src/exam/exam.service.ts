import { Repository } from 'typeorm';
import { createHmac, timingSafeEqual } from 'crypto';
import { AppError } from '../common/errors';
import { config } from '../config';
import { Exam, ExamSubject, LateFeeSlab, ExamScope } from './schemas/exam.schema';
import { ExamFeeRecord, ExamApplication, Payment } from './schemas/fee.schema';
import {
  ExamStatus,
  ExamType,
  FeeStatus,
  PaymentMethod,
  PaymentMode,
  PaymentStatus,
  UPI_CONVENIENCE_FEE_RATE,
} from './schemas/exam.enums';
import {
  CreateExamDto,
  UpdateExamDto,
  RejectExamDto,
  PublishExamDto,
  StudentRefDto,
  OnlinePaymentDto,
  OfflinePaymentDto,
  ExamScopeInputDto,
  CreateExamApplicationDto,
} from './dto/exam.dto';
import { SubjectsService } from '../subjects/subjects.service';
import { RegulationsService } from '../regulations/regulations.service';
import { SdmsService } from '../sdms/sdms.service';
import type { SettingsService } from '../settings/settings.service';
import Razorpay from 'razorpay';

type GatewayPayload = {
  provider: 'razorpay';
  orderId?: string;
  paymentId?: string;
  signature?: string;
  event?: string;
  method?: string;
  simulated?: boolean;
  lineType?: 'exam_fee' | 'convenience_fee';
  companionPaymentId?: number;
  convenienceFeeRate?: number;
  baseFeeAmount?: number;
  convenienceFeeAmount?: number;
};

export class ExamService {
  constructor(
    private readonly examRepo: Repository<Exam>,
    private readonly examSubjectRepo: Repository<ExamSubject>,
    private readonly feeRecordRepo: Repository<ExamFeeRecord>,
    private readonly paymentRepo: Repository<Payment>,
    private readonly examScopeRepo: Repository<ExamScope>,
    private readonly applicationRepo: Repository<ExamApplication>,
    private readonly subjectsService: SubjectsService,
    private readonly regulationsService: RegulationsService,
    private readonly sdms: SdmsService,
    private readonly settings: SettingsService,
  ) {}

  private parseGateway(raw: string | null | undefined): GatewayPayload | null {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as GatewayPayload;
    } catch {
      return null;
    }
  }

  private async getRazorpayClient() {
    const cfg = await this.settings.getRazorpayConfig();
    return {
      cfg,
      client: new Razorpay({
        key_id: cfg.keyId,
        key_secret: cfg.keySecret,
      }),
    };
  }

  private safeEqualHex(a: string, b: string) {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  }

  private roundMoney(amount: number) {
    return Math.round(Number(amount) * 100) / 100;
  }

  /** UPI online: base fee + 2.2% convenience (102.2% total). Other methods: no surcharge. */
  applyUpiConvenienceFee(baseAmount: number, paymentMethod?: string) {
    const base = this.roundMoney(baseAmount);
    const isUpi = (paymentMethod ?? PaymentMethod.UPI) === PaymentMethod.UPI;
    if (!isUpi) {
      return {
        base,
        convenienceFee: 0,
        total: base,
        applies: false as const,
        rate: 0,
      };
    }
    const convenienceFee = this.roundMoney(base * UPI_CONVENIENCE_FEE_RATE);
    const total = this.roundMoney(base + convenienceFee);
    return {
      base,
      convenienceFee,
      total,
      applies: true as const,
      rate: UPI_CONVENIENCE_FEE_RATE,
    };
  }

  private isExamFeeLine(gw: GatewayPayload | null) {
    return !gw?.lineType || gw.lineType === 'exam_fee';
  }

  private async getLinkedPayment(paymentId?: number) {
    if (!paymentId) return null;
    return this.paymentRepo.findOne({ where: { id: paymentId } });
  }

  private async validateExamSubjects(
    regulationId: number,
    course: string,
    branch: string,
    batch: string,
    yearOfStudy: number,
    semester: number,
    subjectFees: { subjectId: number; fee: number }[],
  ) {
    const mapped = await this.subjectsService.getMappedSubjectsForExam({
      regulationId,
      course,
      branch,
      batch,
      yearOfStudy,
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

  private normalizeSubjectFees(
    subjects: { subjectId: number; fee: number; examDate?: string }[],
  ) {
    if (!subjects?.length) {
      throw AppError.badRequest('Select at least one subject');
    }
    return subjects.map((s) => {
      const examDate = (s.examDate ?? '').trim();
      if (!examDate) {
        throw AppError.badRequest(
          `Exam date is required for subject ${s.subjectId}`,
        );
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate)) {
        throw AppError.badRequest(
          `Invalid exam date for subject ${s.subjectId} (use YYYY-MM-DD)`,
        );
      }
      return { ...s, examDate };
    });
  }

  private assertSubjectDatesInWindow(
    subjects: { subjectId: number; examDate: string }[],
    examinationStartDate?: string,
    examinationEndDate?: string,
  ) {
    for (const s of subjects) {
      if (examinationStartDate && s.examDate < examinationStartDate) {
        throw AppError.badRequest(
          `Subject ${s.subjectId} exam date is before examination start`,
        );
      }
      if (examinationEndDate && s.examDate > examinationEndDate) {
        throw AppError.badRequest(
          `Subject ${s.subjectId} exam date is after examination end`,
        );
      }
    }
  }

  private resolveCreateTypes(dto: CreateExamDto): ExamType[] {
    const fromList = (dto.types ?? []).filter(Boolean);
    if (fromList.length > 0) {
      return [...new Set(fromList)];
    }
    return [dto.type ?? ExamType.REGULAR];
  }

  /** Types students may enroll under for this exam. */
  getAllowedTypes(exam: Exam): ExamType[] {
    const raw = exam.allowedTypes;
    if (Array.isArray(raw) && raw.length > 0) {
      return [...new Set(raw.filter(Boolean))];
    }
    return [exam.type ?? ExamType.REGULAR];
  }

  private resolveEnrollmentType(exam: Exam, requested?: ExamType): ExamType {
    const allowed = this.getAllowedTypes(exam);
    if (requested) {
      if (!allowed.includes(requested)) {
        throw AppError.badRequest(
          `This examination does not allow enrollment as ${this.typeLabel(requested)}`,
        );
      }
      return requested;
    }
    if (allowed.length === 1) return allowed[0];
    throw AppError.badRequest(
      'Select whether you are applying for Regular or Supply',
    );
  }

  private resolveCreateScopes(dto: CreateExamDto): ExamScopeInputDto[] {
    if (dto.scopes?.length) {
      return dto.scopes.filter((s) => s.branch?.trim());
    }
    if (dto.branch?.trim()) {
      return [{ branch: dto.branch.trim() }];
    }
    throw AppError.badRequest('Select at least one branch');
  }

  private expandScopeRows(
    dto: CreateExamDto,
    scopeInputs: ExamScopeInputDto[],
  ): Omit<ExamScope, 'id' | 'exam' | 'examId'>[] {
    const rows: Omit<ExamScope, 'id' | 'exam' | 'examId'>[] = [];
    for (const s of scopeInputs) {
      const branch = s.branch.trim();
      const sections = (s.sections ?? [])
        .map((x) => x.trim())
        .filter(Boolean);
      if (sections.length === 0) {
        rows.push({
          college: dto.college,
          course: dto.course,
          branch,
          branchId: s.branchId ?? null,
          batch: dto.batch,
          yearOfStudy: dto.yearOfStudy,
          semester: dto.semester,
          section: null,
        });
      } else {
        for (const section of sections) {
          rows.push({
            college: dto.college,
            course: dto.course,
            branch,
            branchId: s.branchId ?? null,
            batch: dto.batch,
            yearOfStudy: dto.yearOfStudy,
            semester: dto.semester,
            section,
          });
        }
      }
    }
    if (rows.length === 0) {
      throw AppError.badRequest('Select at least one branch');
    }
    return rows;
  }

  private typeLabel(type: ExamType) {
    return String(type).replace(/_/g, ' ');
  }

  async create(dto: CreateExamDto): Promise<Exam> {
    if (!dto.college?.trim()) {
      throw AppError.badRequest('College is required');
    }
    await this.regulationsService.findOne(dto.regulationId);

    const allowedTypes = this.resolveCreateTypes(dto);
    if (allowedTypes.length === 0) {
      throw AppError.badRequest('Select at least one exam type');
    }
    const scopeInputs = this.resolveCreateScopes(dto);
    const scopeRows = this.expandScopeRows(dto, scopeInputs);
    const uniqueBranches = [...new Set(scopeRows.map((r) => r.branch))];

    for (const branch of uniqueBranches) {
      await this.validateExamSubjects(
        dto.regulationId,
        dto.course,
        branch,
        dto.batch,
        dto.yearOfStudy,
        dto.semester,
        dto.subjects,
      );
    }
    this.validateDates(dto);
    const subjectFees = this.normalizeSubjectFees(dto.subjects);
    this.assertSubjectDatesInWindow(
      subjectFees,
      dto.examinationStartDate,
      dto.examinationEndDate,
    );

    const primaryBranch = scopeRows[0].branch;
    const branchSummary =
      uniqueBranches.length === 1
        ? uniqueBranches[0]
        : uniqueBranches.join(', ');

    // One exam row; students pick Regular/Supply at enrollment when both allowed.
    const exam = this.examRepo.create({
      name: dto.name.trim(),
      type: allowedTypes[0],
      allowedTypes,
      regulationId: dto.regulationId,
      college: dto.college,
      course: dto.course,
      branch: branchSummary.slice(0, 100) || primaryBranch,
      batch: dto.batch,
      yearOfStudy: dto.yearOfStudy,
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
      hallTicketsReleasedAt: null,
      examSubjects: subjectFees.map((s) =>
        this.examSubjectRepo.create({
          subjectId: s.subjectId,
          fee: s.fee,
          examDate: s.examDate,
        }),
      ),
      lateFeeSlabs: (dto.lateFeeSlabs ?? []).map((slab) =>
        Object.assign(new LateFeeSlab(), slab),
      ),
      scopes: scopeRows.map((row) => this.examScopeRepo.create({ ...row })),
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
      const branch =
        dto.branch ??
        exam.scopes?.[0]?.branch ??
        exam.branch;
      const branches =
        dto.scopes?.map((s) => s.branch).filter(Boolean) ??
        (exam.scopes?.length
          ? [...new Set(exam.scopes.map((s) => s.branch))]
          : [branch]);
      for (const b of branches) {
        await this.validateExamSubjects(
          dto.regulationId ?? exam.regulationId,
          dto.course ?? exam.course,
          b,
          dto.batch ?? exam.batch,
          dto.yearOfStudy ?? exam.yearOfStudy,
          dto.semester ?? exam.semester,
          dto.subjects,
        );
      }
      await this.examSubjectRepo.delete({ examId: id });
      const subjectFees = this.normalizeSubjectFees(dto.subjects);
      this.assertSubjectDatesInWindow(
        subjectFees,
        dto.examinationStartDate ?? exam.examinationStartDate,
        dto.examinationEndDate ?? exam.examinationEndDate,
      );
      exam.examSubjects = subjectFees.map((s) =>
        this.examSubjectRepo.create({
          examId: id,
          subjectId: s.subjectId,
          fee: s.fee,
          examDate: s.examDate,
        }),
      );
    }

    if (dto.scopes?.length) {
      await this.examScopeRepo.delete({ examId: id });
      const scopeRows = this.expandScopeRows(
        {
          ...dto,
          college: dto.college ?? exam.college ?? '',
          course: dto.course ?? exam.course,
          batch: dto.batch ?? exam.batch,
          yearOfStudy: dto.yearOfStudy ?? exam.yearOfStudy,
          semester: dto.semester ?? exam.semester,
          regulationId: dto.regulationId ?? exam.regulationId,
          name: dto.name ?? exam.name,
          subjects: dto.subjects ?? [],
        } as CreateExamDto,
        dto.scopes,
      );
      exam.scopes = scopeRows.map((row) =>
        this.examScopeRepo.create({ ...row, examId: id }),
      );
      const uniqueBranches = [...new Set(scopeRows.map((r) => r.branch))];
      exam.branch =
        uniqueBranches.length === 1
          ? uniqueBranches[0]
          : uniqueBranches.join(', ').slice(0, 100);
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

    if (dto.types?.length || dto.type) {
      const allowed = this.resolveCreateTypes({
        name: exam.name,
        regulationId: exam.regulationId,
        college: exam.college ?? '',
        course: exam.course,
        batch: exam.batch,
        yearOfStudy: exam.yearOfStudy,
        semester: exam.semester,
        subjects: [],
        type: dto.type,
        types: dto.types,
      });
      exam.allowedTypes = allowed;
      exam.type = allowed[0];
    }

    Object.assign(exam, {
      name: dto.name ?? exam.name,
      type: exam.type,
      regulationId: dto.regulationId ?? exam.regulationId,
      college: dto.college ?? exam.college,
      course: dto.course ?? exam.course,
      branch: dto.branch ?? exam.branch,
      batch: dto.batch ?? exam.batch,
      yearOfStudy: dto.yearOfStudy ?? exam.yearOfStudy,
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

  async publish(id: number, _dto?: PublishExamDto): Promise<Exam> {
    const exam = await this.findOne(id);
    if (exam.status !== ExamStatus.APPROVED) {
      throw AppError.badRequest('Only approved examinations can be published');
    }
    const missingDates = (exam.examSubjects ?? []).filter((es) => !es.examDate);
    if (missingDates.length) {
      throw AppError.badRequest(
        'Set an exam date for every subject before publishing',
      );
    }
    exam.status = ExamStatus.PUBLISHED;
    exam.publishedAt = new Date();
    await this.examRepo.save(exam);
    // Fees are created when students enroll (application), not on publish.
    return this.findOne(id);
  }

  /**
   * Opens hall tickets for all paid applicants (and anyone who pays later).
   */
  async releaseHallTickets(id: number): Promise<Exam> {
    const exam = await this.findOne(id);
    if (exam.status !== ExamStatus.PUBLISHED) {
      throw AppError.badRequest(
        'Only published examinations can release hall tickets',
      );
    }
    const missingDates = (exam.examSubjects ?? []).filter((es) => !es.examDate);
    if (missingDates.length) {
      throw AppError.badRequest(
        'Every subject must have an exam date before releasing hall tickets',
      );
    }
    if (!exam.hallTicketsReleasedAt) {
      exam.hallTicketsReleasedAt = new Date();
      await this.examRepo.save(exam);
    }
    return this.findOne(id);
  }

  /**
   * Resolve college name for an exam (stored column, or regulation scope fallback).
   */
  private async resolveExamCollege(exam: Exam): Promise<string> {
    if (exam.college?.trim()) return exam.college.trim();

    try {
      const regulation = await this.regulationsService.findOne(exam.regulationId);
      const scopes = regulation.scopes ?? [];
      const match = scopes.find(
        (s) =>
          s.courseName === exam.course &&
          (s.batch === exam.batch || !exam.batch),
      );
      if (match?.collegeName) return match.collegeName;
      const byCourse = scopes.find((s) => s.courseName === exam.course);
      if (byCourse?.collegeName) return byCourse.collegeName;
    } catch {
      // SDMS / regulation lookup may fail in isolated tests
    }

    throw AppError.badRequest(
      'Exam has no college set. Edit the examination and select a college before publishing.',
    );
  }

  /**
   * SDMS students matching any exam scope (branch + optional section).
   */
  async listEligibleStudents(examId: number): Promise<{
    exam: {
      id: number;
      name: string;
      college: string;
      course: string;
      branch: string;
      batch: string;
      yearOfStudy: number;
      semester: number;
      scopes: {
        branch: string;
        section: string | null;
        yearOfStudy: number;
        semester: number;
      }[];
    };
    students: {
      id: number;
      rollNumber: string;
      name: string;
      admissionNumber: string | null;
      section: string | null;
      studentStatus: string | null;
      college: string | null;
      course: string | null;
      branch: string | null;
      batch: string | null;
      currentYear: number;
      currentSemester: number;
    }[];
    total: number;
  }> {
    const exam = await this.findOne(examId);
    const college = await this.resolveExamCollege(exam);

    type ScopeKey = {
      college: string | null;
      course: string;
      branch: string;
      branchId: number | null;
      batch: string;
      yearOfStudy: number;
      semester: number;
      section: string | null;
    };

    const scopes: ScopeKey[] =
      exam.scopes?.length > 0
        ? exam.scopes.map((s) => ({
            college: s.college,
            course: s.course,
            branch: s.branch,
            branchId: s.branchId,
            batch: s.batch,
            yearOfStudy: s.yearOfStudy,
            semester: s.semester,
            section: s.section,
          }))
        : [
            {
              college: exam.college,
              course: exam.course,
              branch: exam.branch,
              branchId: null,
              batch: exam.batch,
              yearOfStudy: exam.yearOfStudy,
              semester: exam.semester,
              section: null,
            },
          ];

    type StudentRow = {
      id: number;
      rollNumber: string;
      name: string;
      admissionNumber: string | null;
      section: string | null;
      studentStatus: string | null;
      college: string | null;
      course: string | null;
      branch: string | null;
      batch: string | null;
      currentYear: number;
      currentSemester: number;
    };
    const byRoll = new Map<string, StudentRow>();

    const fetchForScope = async (scope: {
      branch: string;
      section: string | null;
      yearOfStudy: number;
      semester: number;
      batch: string;
      course: string;
    }) => {
      let page = 1;
      let totalPages = 1;
      do {
        const result = await this.sdms.listStudents({
          college,
          course: scope.course || exam.course,
          branch: scope.branch,
          batch: scope.batch || exam.batch,
          currentYear: scope.yearOfStudy,
          currentSemester: scope.semester,
          section: scope.section || undefined,
          page,
          limit: 200,
        });
        totalPages = result.totalPages;
        for (const s of result.items) {
          const roll = (s.pinNo || s.admissionNumber || '').trim();
          if (!roll) continue;
          const key = roll.toLowerCase();
          if (byRoll.has(key)) continue;
          byRoll.set(key, {
            id: s.id,
            rollNumber: roll,
            name: s.studentName,
            admissionNumber: s.admissionNumber,
            section: s.section,
            studentStatus: s.studentStatus,
            college: s.college,
            course: s.course,
            branch: s.branch,
            batch: s.batch,
            currentYear: s.currentYear,
            currentSemester: s.currentSemester,
          });
        }
        page += 1;
      } while (page <= totalPages);
    };

    // Group: for branch with only section=null, one query; else each section
    const byBranch = new Map<string, typeof scopes>();
    for (const s of scopes) {
      const list = byBranch.get(s.branch) ?? [];
      list.push(s);
      byBranch.set(s.branch, list);
    }

    for (const [, branchScopes] of byBranch) {
      const allSections = branchScopes.every((s) => !s.section);
      if (allSections) {
        await fetchForScope({
          branch: branchScopes[0].branch,
          section: null,
          yearOfStudy: branchScopes[0].yearOfStudy,
          semester: branchScopes[0].semester,
          batch: branchScopes[0].batch,
          course: branchScopes[0].course,
        });
      } else {
        for (const s of branchScopes) {
          await fetchForScope({
            branch: s.branch,
            section: s.section,
            yearOfStudy: s.yearOfStudy,
            semester: s.semester,
            batch: s.batch,
            course: s.course,
          });
        }
      }
    }

    const students = Array.from(byRoll.values()).sort((a, b) =>
      a.rollNumber.localeCompare(b.rollNumber),
    );

    return {
      exam: {
        id: exam.id,
        name: exam.name,
        college,
        course: exam.course,
        branch: exam.branch,
        batch: exam.batch,
        yearOfStudy: exam.yearOfStudy,
        semester: exam.semester,
        scopes: scopes.map((s) => ({
          branch: s.branch,
          section: s.section,
          yearOfStudy: s.yearOfStudy,
          semester: s.semester,
        })),
      },
      students,
      total: students.length,
    };
  }

  private examScopeRows(exam: Exam) {
    if (exam.scopes?.length) {
      return exam.scopes.map((s) => ({
        college: s.college,
        course: s.course,
        branch: s.branch,
        batch: s.batch,
        yearOfStudy: s.yearOfStudy,
        semester: s.semester,
        section: s.section,
      }));
    }
    return [
      {
        college: exam.college,
        course: exam.course,
        branch: exam.branch,
        batch: exam.batch,
        yearOfStudy: exam.yearOfStudy,
        semester: exam.semester,
        section: null as string | null,
      },
    ];
  }

  private studentMatchesExam(
    exam: Exam,
    student: {
      college?: string | null;
      course?: string | null;
      branch?: string | null;
      batch?: string | null;
      section?: string | null;
      currentYear?: number | null;
      currentSemester?: number | null;
    },
  ): boolean {
    const scopes = this.examScopeRows(exam);
    const studentBranch = (student.branch ?? '').trim().toLowerCase();
    const studentCourse = (student.course ?? '').trim().toLowerCase();
    const studentBatch = (student.batch ?? '').trim().toLowerCase();
    const studentSection = (student.section ?? '').trim().toLowerCase();
    const year = Number(student.currentYear);
    const sem = Number(student.currentSemester);

    return scopes.some((s) => {
      if (
        s.course?.trim() &&
        studentCourse &&
        s.course.trim().toLowerCase() !== studentCourse
      ) {
        return false;
      }
      if (
        s.batch?.trim() &&
        studentBatch &&
        s.batch.trim().toLowerCase() !== studentBatch
      ) {
        return false;
      }
      if (s.branch.trim().toLowerCase() !== studentBranch) return false;
      if (Number(s.yearOfStudy) !== year) return false;
      if (Number(s.semester) !== sem) return false;
      if (s.section) {
        if (s.section.trim().toLowerCase() !== studentSection) return false;
      }
      return true;
    });
  }

  private assertApplicationWindow(exam: Exam) {
    const today = new Date().toISOString().slice(0, 10);
    if (exam.applicationStartDate && today < exam.applicationStartDate) {
      throw AppError.badRequest('Applications have not opened yet');
    }
    if (exam.applicationEndDate && today > exam.applicationEndDate) {
      throw AppError.badRequest('Application window has closed');
    }
  }

  private async loadStudentForEnrollment(studentId: number) {
    const student = await this.sdms.getStudent(studentId);
    if (!student) throw AppError.notFound('Student profile not found');
    const section =
      student.section?.trim() ||
      student.studentSection?.sectionName?.trim() ||
      null;
    return {
      id: student.id,
      studentName: student.studentName,
      pinNo: student.pinNo,
      admissionNumber: student.admissionNumber,
      college: student.college,
      course: student.course,
      branch: student.branch,
      batch: student.batch,
      section,
      currentYear: student.currentYear,
      currentSemester: student.currentSemester,
    };
  }

  private resolveRoll(student: {
    pinNo?: string | null;
    admissionNumber?: string | null;
  }) {
    const roll = (student.pinNo || student.admissionNumber || '').trim();
    if (!roll) {
      throw AppError.badRequest('Student has no PIN / roll number');
    }
    return roll;
  }

  async listPublishedExamsForStudent(studentId: number) {
    const student = await this.loadStudentForEnrollment(studentId);
    const exams = await this.examRepo.find({
      where: { status: ExamStatus.PUBLISHED },
      order: { createdAt: 'DESC' },
    });

    const inScope = exams.filter((e) => this.studentMatchesExam(e, student));
    const roll = this.resolveRoll(student);
    const appsByExam = new Map<number, ExamApplication[]>();
    if (inScope.length > 0) {
      const allApps = await this.applicationRepo
        .createQueryBuilder('a')
        .leftJoinAndSelect('a.feeRecord', 'fee')
        .where('a.examId IN (:...ids)', { ids: inScope.map((e) => e.id) })
        .andWhere('LOWER(a.studentRollNumber) = LOWER(:roll)', { roll })
        .getMany();
      for (const app of allApps) {
        const list = appsByExam.get(app.examId) ?? [];
        list.push(app);
        appsByExam.set(app.examId, list);
      }
    }

    return inScope.map((exam) => {
      const apps = appsByExam.get(exam.id) ?? [];
      const allowedTypes = this.getAllowedTypes(exam);
      const appliedTypes = apps.map((a) => a.examType);
      const openTypes = allowedTypes.filter((t) => !appliedTypes.includes(t));
      return {
        id: exam.id,
        name: exam.name,
        type: exam.type,
        allowedTypes,
        college: exam.college,
        course: exam.course,
        branch: exam.branch,
        batch: exam.batch,
        yearOfStudy: exam.yearOfStudy,
        semester: exam.semester,
        applicationStartDate: exam.applicationStartDate,
        applicationEndDate: exam.applicationEndDate,
        examinationStartDate: exam.examinationStartDate,
        examinationEndDate: exam.examinationEndDate,
        packageFee: exam.packageFee,
        subjectCount: exam.examSubjects?.length ?? 0,
        /** True when every allowed type already has an application */
        alreadyApplied: openTypes.length === 0,
        openTypes,
        applications: apps.map((a) => ({
          id: a.id,
          examType: a.examType,
          feeRecordId: a.feeRecordId,
          feeStatus: a.feeRecord?.status ?? null,
        })),
      };
    });
  }

  async getPublishedExamForStudent(examId: number, studentId: number) {
    const student = await this.loadStudentForEnrollment(studentId);
    const exam = await this.findOne(examId);
    if (exam.status !== ExamStatus.PUBLISHED) {
      throw AppError.badRequest('Examination is not published');
    }
    if (!this.studentMatchesExam(exam, student)) {
      throw AppError.forbidden('You are not in the scope of this examination');
    }

    const roll = this.resolveRoll(student);
    const applications = await this.applicationRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.feeRecord', 'fee')
      .where('a.examId = :examId', { examId })
      .andWhere('LOWER(a.studentRollNumber) = LOWER(:roll)', { roll })
      .getMany();

    const allowedTypes = this.getAllowedTypes(exam);
    const appliedTypes = applications.map((a) => a.examType);
    const openTypes = allowedTypes.filter((t) => !appliedTypes.includes(t));

    const subjects = (exam.examSubjects ?? []).map((es) => ({
      subjectId: es.subjectId,
      fee: Number(es.fee),
      examDate: es.examDate,
      code: es.subject?.code ?? String(es.subjectId),
      name: es.subject?.name ?? '',
    }));

    return {
      exam: {
        id: exam.id,
        name: exam.name,
        type: exam.type,
        allowedTypes,
        college: exam.college,
        course: exam.course,
        branch: exam.branch,
        batch: exam.batch,
        yearOfStudy: exam.yearOfStudy,
        semester: exam.semester,
        packageFee: exam.packageFee,
        applicationStartDate: exam.applicationStartDate,
        applicationEndDate: exam.applicationEndDate,
        examinationStartDate: exam.examinationStartDate,
        examinationEndDate: exam.examinationEndDate,
        instructions: exam.instructions,
        subjects,
      },
      openTypes,
      alreadyApplied: openTypes.length === 0,
      applications: applications.map((a) => ({
        id: a.id,
        examType: a.examType,
        selectedSubjectIds: a.selectedSubjectIds,
        feeRecordId: a.feeRecordId,
        feeStatus: a.feeRecord?.status ?? null,
        submittedAt: a.submittedAt,
      })),
      /** @deprecated use applications / openTypes */
      application: applications[0]
        ? {
            id: applications[0].id,
            examType: applications[0].examType,
            selectedSubjectIds: applications[0].selectedSubjectIds,
            feeRecordId: applications[0].feeRecordId,
            feeStatus: applications[0].feeRecord?.status ?? null,
            submittedAt: applications[0].submittedAt,
          }
        : null,
    };
  }

  async createStudentApplication(
    examId: number,
    studentId: number,
    dto: CreateExamApplicationDto,
  ) {
    if (!dto.declarationAccepted || !dto.consentAccepted) {
      throw AppError.badRequest('Declaration and consent are required');
    }

    const student = await this.loadStudentForEnrollment(studentId);
    const exam = await this.findOne(examId);
    if (exam.status !== ExamStatus.PUBLISHED) {
      throw AppError.badRequest('Examination is not published');
    }
    if (!this.studentMatchesExam(exam, student)) {
      throw AppError.forbidden('You are not in the scope of this examination');
    }
    this.assertApplicationWindow(exam);

    const examType = this.resolveEnrollmentType(exam, dto.examType);
    const roll = this.resolveRoll(student);

    const existing = await this.applicationRepo
      .createQueryBuilder('a')
      .where('a.examId = :examId', { examId })
      .andWhere('LOWER(a.studentRollNumber) = LOWER(:roll)', { roll })
      .andWhere('a.examType = :examType', { examType })
      .getOne();
    if (existing) {
      throw AppError.badRequest(
        `You have already applied for this examination as ${this.typeLabel(examType)}`,
      );
    }

    const existingFee = await this.feeRecordRepo
      .createQueryBuilder('f')
      .where('f.examId = :examId', { examId })
      .andWhere('LOWER(f.studentRollNumber) = LOWER(:roll)', { roll })
      .andWhere('f.examType = :examType', { examType })
      .getOne();
    if (existingFee) {
      throw AppError.badRequest(
        `A fee record already exists for ${this.typeLabel(examType)}`,
      );
    }

    const allIds = exam.examSubjects.map((es) => es.subjectId);
    let selectedSubjectIds =
      dto.selectedSubjectIds?.filter((id) => allIds.includes(id)) ?? [];
    if (selectedSubjectIds.length === 0) {
      selectedSubjectIds = [...allIds];
    }
    if (selectedSubjectIds.length === 0) {
      throw AppError.badRequest('No subjects available for this examination');
    }

    const { breakdown, baseFee } = this.calculateFee(exam, selectedSubjectIds);

    const feeRecord = await this.feeRecordRepo.save(
      this.feeRecordRepo.create({
        examId,
        examType,
        studentRollNumber: roll,
        studentName: student.studentName,
        selectedSubjectIds,
        feeBreakdown: breakdown,
        baseFee,
        lateFee: 0,
        totalAmount: baseFee,
        status: FeeStatus.PENDING,
        dueDate: exam.applicationEndDate,
      }),
    );

    const application = await this.applicationRepo.save(
      this.applicationRepo.create({
        examId,
        examType,
        studentRollNumber: roll,
        studentName: student.studentName,
        selectedSubjectIds,
        feeBreakdown: breakdown,
        declarationAccepted: true,
        consentAccepted: true,
        feeRecordId: feeRecord.id,
      }),
    );

    const refreshed = await this.getFeeRecord(feeRecord.id);
    return {
      application: {
        id: application.id,
        examId: application.examId,
        examType: application.examType,
        selectedSubjectIds: application.selectedSubjectIds,
        feeBreakdown: application.feeBreakdown,
        feeRecordId: application.feeRecordId,
        submittedAt: application.submittedAt,
      },
      feeRecord: refreshed,
    };
  }

  private buildHallTicketPayload(
    exam: Exam,
    application: ExamApplication,
    feeRecord: ExamFeeRecord,
  ) {
    const bySubjectId = new Map(
      (exam.examSubjects ?? []).map((es) => [es.subjectId, es]),
    );
    const papers = (application.selectedSubjectIds ?? [])
      .map((sid) => {
        const es = bySubjectId.get(sid);
        if (!es) return null;
        return {
          subjectId: sid,
          code: es.subject?.code ?? String(sid),
          name: es.subject?.name ?? '',
          examDate: es.examDate,
          fee: Number(es.fee),
        };
      })
      .filter((p): p is NonNullable<typeof p> => !!p)
      .sort((a, b) =>
        (a.examDate ?? '').localeCompare(b.examDate ?? '') ||
        a.code.localeCompare(b.code),
      );

    return {
      applicationId: application.id,
      examId: exam.id,
      examName: exam.name,
      examType: application.examType,
      college: exam.college,
      course: exam.course,
      branch: exam.branch,
      batch: exam.batch,
      yearOfStudy: exam.yearOfStudy,
      semester: exam.semester,
      studentRollNumber: application.studentRollNumber,
      studentName: application.studentName,
      feeRecordId: feeRecord.id,
      feeStatus: feeRecord.status,
      paidAt:
        feeRecord.payments?.find((p) => p.status === PaymentStatus.SUCCESS)
          ?.paidAt ?? null,
      hallTicketsReleasedAt: exam.hallTicketsReleasedAt,
      papers,
    };
  }

  /**
   * Staff: all paid applications for an exam (printable hall tickets).
   * Independent of student-portal release — staff can print once fee is paid.
   */
  async listHallTicketsForExam(examId: number) {
    const exam = await this.findOne(examId);
    const apps = await this.applicationRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.feeRecord', 'fee')
      .leftJoinAndSelect('fee.payments', 'payments')
      .where('a.examId = :examId', { examId })
      .andWhere('fee.status = :paid', { paid: FeeStatus.PAID })
      .orderBy('a.studentName', 'ASC')
      .addOrderBy('a.examType', 'ASC')
      .getMany();

    return {
      exam: {
        id: exam.id,
        name: exam.name,
        hallTicketsReleasedAt: exam.hallTicketsReleasedAt,
        status: exam.status,
      },
      tickets: apps.map((a) =>
        this.buildHallTicketPayload(exam, a, a.feeRecord),
      ),
      total: apps.length,
    };
  }

  async getHallTicketForExam(examId: number, applicationId: number) {
    const exam = await this.findOne(examId);
    const application = await this.applicationRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.feeRecord', 'fee')
      .leftJoinAndSelect('fee.payments', 'payments')
      .where('a.id = :applicationId', { applicationId })
      .andWhere('a.examId = :examId', { examId })
      .getOne();

    if (!application) throw AppError.notFound('Application not found');
    if (application.feeRecord?.status !== FeeStatus.PAID) {
      throw AppError.badRequest(
        'Hall ticket is only available after examination fee is paid',
      );
    }
    return this.buildHallTicketPayload(exam, application, application.feeRecord);
  }

  /**
   * Hall tickets available when admin has released them AND the student paid.
   * Late payers after release also appear here automatically.
   */
  async listHallTicketsForStudent(studentId: number) {
    const student = await this.loadStudentForEnrollment(studentId);
    const roll = this.resolveRoll(student);
    const apps = await this.applicationRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.feeRecord', 'fee')
      .leftJoinAndSelect('fee.payments', 'payments')
      .leftJoinAndSelect('a.exam', 'exam')
      .leftJoinAndSelect('exam.examSubjects', 'examSubjects')
      .leftJoinAndSelect('examSubjects.subject', 'subject')
      .where('LOWER(a.studentRollNumber) = LOWER(:roll)', { roll })
      .andWhere('fee.status = :paid', { paid: FeeStatus.PAID })
      .andWhere('exam.hallTicketsReleasedAt IS NOT NULL')
      .orderBy('a.submittedAt', 'DESC')
      .getMany();

    return apps.map((a) =>
      this.buildHallTicketPayload(a.exam, a, a.feeRecord),
    );
  }

  async getHallTicketForStudent(applicationId: number, studentId: number) {
    const student = await this.loadStudentForEnrollment(studentId);
    const roll = this.resolveRoll(student);
    const application = await this.applicationRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.feeRecord', 'fee')
      .leftJoinAndSelect('fee.payments', 'payments')
      .leftJoinAndSelect('a.exam', 'exam')
      .leftJoinAndSelect('exam.examSubjects', 'examSubjects')
      .leftJoinAndSelect('examSubjects.subject', 'subject')
      .where('a.id = :applicationId', { applicationId })
      .getOne();

    if (!application) throw AppError.notFound('Application not found');
    if (application.studentRollNumber.toLowerCase() !== roll.toLowerCase()) {
      throw AppError.forbidden('Hall ticket not found for your account');
    }
    if (!application.exam?.hallTicketsReleasedAt) {
      throw AppError.badRequest('Hall tickets have not been released yet');
    }
    if (application.feeRecord?.status !== FeeStatus.PAID) {
      throw AppError.badRequest(
        'Hall ticket is available only after the examination fee is paid',
      );
    }
    return this.buildHallTicketPayload(
      application.exam,
      application,
      application.feeRecord,
    );
  }

  async getExamAnalytics(examId: number) {
    const eligible = await this.listEligibleStudents(examId);
    const exam = await this.findOne(examId);
    const applications = await this.applicationRepo.find({
      where: { examId },
      relations: ['feeRecord'],
    });
    const feeRecords = await this.feeRecordRepo.find({ where: { examId } });

    const enrolledRolls = new Set(
      applications.map((a) => a.studentRollNumber.toLowerCase()),
    );
    const paidRolls = new Set(
      feeRecords
        .filter((f) => f.status === FeeStatus.PAID)
        .map((f) => f.studentRollNumber.toLowerCase()),
    );
    const pendingPayRolls = new Set(
      feeRecords
        .filter((f) => f.status === FeeStatus.PENDING)
        .map((f) => f.studentRollNumber.toLowerCase()),
    );

    const allSubjectIds = exam.examSubjects.map((es) => es.subjectId);
    const fullFee = this.calculateFee(exam, allSubjectIds);
    const estimatedPerStudent = fullFee.baseFee;
    const eligibleCount = eligible.total;
    const enrolledCount = enrolledRolls.size;
    const paidCount = paidRolls.size;
    const pendingPaymentCount = pendingPayRolls.size;
    const notEnrolledCount = Math.max(0, eligibleCount - enrolledCount);

    type Bucket = {
      course: string;
      branch: string;
      semester: number;
      yearOfStudy: number;
      eligible: number;
      enrolled: number;
      paid: number;
      pendingPayment: number;
      notEnrolled: number;
      estimatedRevenue: number;
      collectedRevenue: number;
    };
    const buckets = new Map<string, Bucket>();

    const keyFor = (s: {
      course: string | null;
      branch: string | null;
      currentSemester: number;
      currentYear: number;
    }) =>
      `${s.course ?? exam.course}|${s.branch ?? ''}|Y${s.currentYear}|S${s.currentSemester}`;

    for (const s of eligible.students) {
      const key = keyFor(s);
      let b = buckets.get(key);
      if (!b) {
        b = {
          course: s.course ?? exam.course,
          branch: s.branch ?? '',
          semester: s.currentSemester,
          yearOfStudy: s.currentYear,
          eligible: 0,
          enrolled: 0,
          paid: 0,
          pendingPayment: 0,
          notEnrolled: 0,
          estimatedRevenue: 0,
          collectedRevenue: 0,
        };
        buckets.set(key, b);
      }
      b.eligible += 1;
      b.estimatedRevenue += estimatedPerStudent;
      const roll = s.rollNumber.toLowerCase();
      if (enrolledRolls.has(roll)) b.enrolled += 1;
      else b.notEnrolled += 1;
      if (paidRolls.has(roll)) b.paid += 1;
      if (pendingPayRolls.has(roll)) b.pendingPayment += 1;
    }

    let collectedRevenue = 0;
    const feeByRoll = new Map(
      feeRecords.map((f) => [f.studentRollNumber.toLowerCase(), f]),
    );
    for (const s of eligible.students) {
      const fee = feeByRoll.get(s.rollNumber.toLowerCase());
      if (fee?.status === FeeStatus.PAID) {
        const b = buckets.get(keyFor(s));
        if (b) b.collectedRevenue += Number(fee.totalAmount);
      }
    }
    collectedRevenue = [...buckets.values()].reduce(
      (sum, b) => sum + b.collectedRevenue,
      0,
    );

    return {
      examId: exam.id,
      examName: exam.name,
      type: exam.type,
      eligibleCount,
      enrolledCount,
      paidCount,
      pendingPaymentCount,
      notEnrolledCount,
      estimatedPerStudent,
      estimatedRevenue: this.roundMoney(estimatedPerStudent * eligibleCount),
      collectedRevenue: this.roundMoney(collectedRevenue),
      byScope: Array.from(buckets.values()).sort((a, b) =>
        `${a.course}${a.branch}`.localeCompare(`${b.course}${b.branch}`),
      ),
    };
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
        examType: this.getAllowedTypes(exam)[0] ?? exam.type,
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

  private feeRecordRelations = [
    'exam',
    'exam.lateFeeSlabs',
    'exam.examSubjects',
    'exam.examSubjects.subject',
    'payments',
  ] as const;

  /**
   * Days late relative to exam.lateFeeStartDate.
   * Late-fee start date counts as day 1.
   */
  calculateLateFee(
    exam: Exam,
    asOf: Date = new Date(),
  ): {
    daysLate: number;
    lateFee: number;
    matchedSlab: LateFeeSlab | null;
    beyondLastSlab: boolean;
  } {
    if (!exam.lateFeeStartDate || !exam.lateFeeSlabs?.length) {
      return { daysLate: 0, lateFee: 0, matchedSlab: null, beyondLastSlab: false };
    }

    const start = new Date(`${exam.lateFeeStartDate}T00:00:00`);
    const today = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
    const diffMs = today.getTime() - start.getTime();
    if (diffMs < 0) {
      return { daysLate: 0, lateFee: 0, matchedSlab: null, beyondLastSlab: false };
    }

    const daysLate = Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1;
    const slabs = [...exam.lateFeeSlabs].sort((a, b) => a.fromDay - b.fromDay);
    const matched = slabs.find(
      (s) => daysLate >= s.fromDay && daysLate <= s.toDay,
    );
    if (matched) {
      return {
        daysLate,
        lateFee: Number(matched.amount),
        matchedSlab: matched,
        beyondLastSlab: false,
      };
    }

    const last = slabs[slabs.length - 1];
    if (daysLate > last.toDay) {
      return {
        daysLate,
        lateFee: Number(last.amount),
        matchedSlab: last,
        beyondLastSlab: true,
      };
    }

    return { daysLate, lateFee: 0, matchedSlab: null, beyondLastSlab: false };
  }

  /** Recalculate and persist late fee on pending records. */
  async refreshLateFee(record: ExamFeeRecord): Promise<ExamFeeRecord> {
    if (record.status === FeeStatus.PAID) return record;

    let exam = record.exam;
    if (!exam) {
      exam = await this.findOne(record.examId);
      record.exam = exam;
    }

    const { lateFee } = this.calculateLateFee(exam);
    const nextLate = Number(lateFee);
    const nextTotal = Number(record.baseFee) + nextLate;
    if (
      Number(record.lateFee) !== nextLate ||
      Number(record.totalAmount) !== nextTotal
    ) {
      record.lateFee = nextLate;
      record.totalAmount = nextTotal;
      // Column-only update — avoid cascading relation saves that clear FKs
      await this.feeRecordRepo.update(record.id, {
        lateFee: nextLate,
        totalAmount: nextTotal,
      });
    }
    return record;
  }

  async listFeeRecords(
    examId?: number,
    rollNumber?: string,
    status?: FeeStatus,
  ): Promise<ExamFeeRecord[]> {
    const qb = this.feeRecordRepo
      .createQueryBuilder('fr')
      .leftJoinAndSelect('fr.exam', 'exam')
      .leftJoinAndSelect('exam.lateFeeSlabs', 'slabs')
      .leftJoinAndSelect('exam.examSubjects', 'examSubjects')
      .leftJoinAndSelect('examSubjects.subject', 'subject')
      .leftJoinAndSelect('fr.payments', 'payments')
      .orderBy(
        `CASE WHEN fr.status = :pendingStatus THEN 0 ELSE 1 END`,
        'ASC',
      )
      .setParameter('pendingStatus', FeeStatus.PENDING)
      .addOrderBy('fr.studentName', 'ASC')
      .addOrderBy('fr.createdAt', 'DESC');

    if (examId) qb.andWhere('fr.examId = :examId', { examId });
    if (rollNumber?.trim()) {
      qb.andWhere('LOWER(fr.studentRollNumber) = LOWER(:roll)', {
        roll: rollNumber.trim(),
      });
    }
    if (status) {
      qb.andWhere('fr.status = :status', { status });
    }

    const records = await qb.getMany();
    for (const record of records) {
      if (record.status !== FeeStatus.PAID) {
        await this.refreshLateFee(record);
      }
    }
    return records;
  }

  async getFeeRecord(id: number): Promise<ExamFeeRecord> {
    const record = await this.feeRecordRepo.findOne({
      where: { id },
      relations: [...this.feeRecordRelations],
    });
    if (!record) throw AppError.notFound('Fee record not found');
    if (record.status !== FeeStatus.PAID) {
      await this.refreshLateFee(record);
    }
    return record;
  }

  /**
   * Desk lookup: fee records for a roll number with late fees applied.
   */
  async lookupForCollection(rollNumber: string): Promise<{
    rollNumber: string;
    studentName: string | null;
    records: ExamFeeRecord[];
    pendingCount: number;
    paidCount: number;
  }> {
    const roll = rollNumber.trim();
    if (!roll) throw AppError.badRequest('Roll number is required');

    const records = await this.listFeeRecords(undefined, roll);
    return {
      rollNumber: roll,
      studentName: records[0]?.studentName ?? null,
      records,
      pendingCount: records.filter((r) => r.status === FeeStatus.PENDING).length,
      paidCount: records.filter((r) => r.status === FeeStatus.PAID).length,
    };
  }

  private generateReceiptNumber(): string {
    return `RCP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }

  /** @deprecated Simulated online pay — use createRazorpayOrder + verify */
  async payOnline(
    _feeRecordId: number,
    _dto: OnlinePaymentDto,
  ): Promise<{ payment: Payment; feeRecord: ExamFeeRecord }> {
    throw AppError.badRequest(
      'Simulated online pay is disabled. Use Razorpay Checkout (/fees/razorpay/order).',
    );
  }

  async createRazorpayOrder(
    feeRecordId: number,
    opts: {
      paymentMethod?: string;
      actor?: {
        role?: string;
        pinNo?: string;
        username?: string;
        fullName?: string;
      };
    } = {},
  ) {
    const feeRecord = await this.getFeeRecord(feeRecordId);
    if (feeRecord.status === FeeStatus.PAID) {
      throw AppError.badRequest('Fee already paid');
    }

    if (opts.actor?.role === 'student') {
      const pin = opts.actor.pinNo?.toLowerCase() ?? '';
      if (feeRecord.studentRollNumber.toLowerCase() !== pin) {
        throw AppError.forbidden('This fee does not belong to your account');
      }
    }

    await this.refreshLateFee(feeRecord);

    // Abandon earlier incomplete online attempts for this fee
    const open = await this.paymentRepo.find({
      where: { feeRecordId },
    });
    for (const p of open) {
      if (
        p.status === PaymentStatus.PENDING ||
        p.status === PaymentStatus.PROCESSING
      ) {
        p.status = PaymentStatus.FAILED;
        const gw = this.parseGateway(p.gatewayResponse) ?? {
          provider: 'razorpay' as const,
        };
        p.gatewayResponse = JSON.stringify({
          ...gw,
          event: 'superseded',
        });
        await this.paymentRepo.save(p);
      }
    }

    const { cfg, client } = await this.getRazorpayClient();
    const split = this.applyUpiConvenienceFee(
      feeRecord.totalAmount,
      opts.paymentMethod,
    );
    const chargePaise = Math.round(split.total * 100);
    if (chargePaise < 100) {
      throw AppError.badRequest('Amount must be at least ₹1.00');
    }

    const examPayment = this.paymentRepo.create({
      feeRecordId,
      amountPaid: split.base,
      paymentMode: PaymentMode.ONLINE,
      paymentMethod: opts.paymentMethod || PaymentMethod.UPI,
      status: PaymentStatus.PENDING,
      receiptNumber: this.generateReceiptNumber(),
      transactionReference: null,
      collectedBy: opts.actor?.fullName || opts.actor?.username || null,
      collectorUsername:
        opts.actor?.role === 'student'
          ? null
          : opts.actor?.username || null,
      remarks: null,
      gatewayResponse: JSON.stringify({
        provider: 'razorpay',
        lineType: 'exam_fee',
        event: 'order_creating',
        baseFeeAmount: split.base,
        convenienceFeeAmount: split.convenienceFee,
        convenienceFeeRate: split.rate,
      } satisfies GatewayPayload),
    });
    const savedExam = await this.paymentRepo.save(examPayment);

    let savedConvenience: Payment | null = null;
    if (split.applies && split.convenienceFee > 0) {
      savedConvenience = await this.paymentRepo.save(
        this.paymentRepo.create({
          feeRecordId,
          amountPaid: split.convenienceFee,
          paymentMode: PaymentMode.ONLINE,
          paymentMethod: PaymentMethod.UPI,
          status: PaymentStatus.PENDING,
          receiptNumber: this.generateReceiptNumber(),
          transactionReference: null,
          collectedBy: savedExam.collectedBy,
          collectorUsername: savedExam.collectorUsername,
          remarks: 'UPI convenience / bank charges (2.2%)',
          gatewayResponse: JSON.stringify({
            provider: 'razorpay',
            lineType: 'convenience_fee',
            event: 'order_creating',
            companionPaymentId: savedExam.id,
            convenienceFeeRate: split.rate,
            baseFeeAmount: split.base,
          } satisfies GatewayPayload),
        }),
      );

      savedExam.gatewayResponse = JSON.stringify({
        provider: 'razorpay',
        lineType: 'exam_fee',
        event: 'order_creating',
        companionPaymentId: savedConvenience.id,
        baseFeeAmount: split.base,
        convenienceFeeAmount: split.convenienceFee,
        convenienceFeeRate: split.rate,
      } satisfies GatewayPayload);
      await this.paymentRepo.save(savedExam);

      savedConvenience.gatewayResponse = JSON.stringify({
        provider: 'razorpay',
        lineType: 'convenience_fee',
        event: 'order_creating',
        companionPaymentId: savedExam.id,
        convenienceFeeRate: split.rate,
        baseFeeAmount: split.base,
        convenienceFeeAmount: split.convenienceFee,
      } satisfies GatewayPayload);
      await this.paymentRepo.save(savedConvenience);
    }

    const order = await client.orders.create({
      amount: chargePaise,
      currency: 'INR',
      receipt: `fee_${feeRecordId}_p${savedExam.id}`.slice(0, 40),
      notes: {
        feeRecordId: String(feeRecordId),
        primaryPaymentId: String(savedExam.id),
        companionPaymentId: savedConvenience
          ? String(savedConvenience.id)
          : '',
        rollNumber: feeRecord.studentRollNumber,
      },
    });

    const orderMeta = {
      provider: 'razorpay' as const,
      orderId: order.id,
      event: 'order_created',
      method: opts.paymentMethod || PaymentMethod.UPI,
    };

    const examGw = this.parseGateway(savedExam.gatewayResponse) ?? {
      provider: 'razorpay' as const,
      lineType: 'exam_fee' as const,
    };
    savedExam.status = PaymentStatus.PROCESSING;
    savedExam.gatewayResponse = JSON.stringify({
      ...examGw,
      ...orderMeta,
    } satisfies GatewayPayload);
    await this.paymentRepo.save(savedExam);

    if (savedConvenience) {
      const convGw = this.parseGateway(savedConvenience.gatewayResponse) ?? {
        provider: 'razorpay' as const,
        lineType: 'convenience_fee' as const,
      };
      savedConvenience.status = PaymentStatus.PROCESSING;
      savedConvenience.gatewayResponse = JSON.stringify({
        ...convGw,
        ...orderMeta,
      } satisfies GatewayPayload);
      await this.paymentRepo.save(savedConvenience);
    }

    // Prefill Razorpay with SDMS mobile / email so Checkout skips asking for phone
    let studentContact: string | null = null;
    let studentEmail: string | null = null;
    try {
      const sdmsStudent = await this.sdms.findStudentByPin(
        feeRecord.studentRollNumber,
      );
      if (sdmsStudent) {
        studentContact = this.sdms.resolveStudentContact(sdmsStudent);
        studentEmail = sdmsStudent.email?.trim() || null;
      }
    } catch {
      /* ignore — checkout still works without prefill */
    }

    return {
      keyId: cfg.keyId,
      orderId: order.id,
      amount: chargePaise,
      currency: 'INR',
      paymentId: savedExam.id,
      companionPaymentId: savedConvenience?.id ?? null,
      receiptNumber: savedExam.receiptNumber,
      feeRecordId,
      studentName: feeRecord.studentName,
      studentRollNumber: feeRecord.studentRollNumber,
      studentContact,
      studentEmail,
      baseAmount: split.base,
      convenienceFee: split.convenienceFee,
      totalAmount: split.total,
      convenienceFeeApplied: split.applies,
      convenienceFeeRate: split.rate,
      description: feeRecord.exam?.name
        ? `Exam fee — ${feeRecord.exam.name}`
        : `Exam fee #${feeRecordId}`,
    };
  }

  async verifyRazorpayPayment(dto: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
    paymentId?: number;
  }) {
    const { cfg } = await this.getRazorpayClient();
    const body = `${dto.razorpayOrderId}|${dto.razorpayPaymentId}`;
    const expected = createHmac('sha256', cfg.keySecret)
      .update(body)
      .digest('hex');

    if (!this.safeEqualHex(expected, dto.razorpaySignature)) {
      throw AppError.forbidden('Invalid Razorpay payment signature');
    }

    const payment = await this.findPaymentForRazorpayOrder(
      dto.razorpayOrderId,
      dto.paymentId,
    );
    return this.markRazorpaySuccess(payment, {
      paymentId: dto.razorpayPaymentId,
      orderId: dto.razorpayOrderId,
      signature: dto.razorpaySignature,
      event: 'checkout_verified',
    });
  }

  async handleRazorpayWebhook(rawBody: Buffer, signatureHeader?: string) {
    const webhookSecret = await this.resolveWebhookSecret();

    if (!webhookSecret) {
      throw AppError.badRequest('Razorpay webhook secret is not configured');
    }
    if (!signatureHeader) {
      throw AppError.forbidden('Missing Razorpay signature');
    }

    const expected = createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');
    if (!this.safeEqualHex(expected, signatureHeader)) {
      throw AppError.forbidden('Invalid webhook signature');
    }

    const payload = JSON.parse(rawBody.toString('utf8')) as {
      event?: string;
      payload?: {
        payment?: { entity?: Record<string, unknown> };
        order?: { entity?: Record<string, unknown> };
      };
    };

    const event = payload.event ?? '';
    const paymentEntity = payload.payload?.payment?.entity;
    const orderEntity = payload.payload?.order?.entity;

    if (
      event === 'payment.captured' ||
      event === 'payment.authorized' ||
      event === 'order.paid'
    ) {
      const orderId = String(
        paymentEntity?.order_id ?? orderEntity?.id ?? '',
      );
      const rzPaymentId = String(paymentEntity?.id ?? '');
      if (!orderId) {
        return { ok: true, ignored: true, reason: 'no_order_id' };
      }

      let payment: Payment;
      try {
        payment = await this.findPaymentForRazorpayOrder(orderId);
      } catch {
        return { ok: true, ignored: true, reason: 'payment_not_found' };
      }

      if (payment.status === PaymentStatus.SUCCESS) {
        return { ok: true, alreadyPaid: true, paymentId: payment.id };
      }

      await this.markRazorpaySuccess(payment, {
        paymentId: rzPaymentId || undefined,
        orderId,
        event,
        method: paymentEntity?.method
          ? String(paymentEntity.method)
          : undefined,
      });
      return { ok: true, paid: true, paymentId: payment.id };
    }

    if (event === 'payment.failed') {
      const orderId = String(paymentEntity?.order_id ?? '');
      if (!orderId) return { ok: true, ignored: true };
      try {
        const payment = await this.findPaymentForRazorpayOrder(orderId);
        if (payment && payment.status !== PaymentStatus.SUCCESS) {
          const gw = this.parseGateway(payment.gatewayResponse) ?? {
            provider: 'razorpay' as const,
          };
          payment.status = PaymentStatus.FAILED;
          payment.gatewayResponse = JSON.stringify({
            ...gw,
            orderId,
            paymentId: paymentEntity?.id
              ? String(paymentEntity.id)
              : gw.paymentId,
            event: 'payment.failed',
          });
          await this.paymentRepo.save(payment);
          const companion = await this.getLinkedPayment(gw.companionPaymentId);
          if (
            companion &&
            companion.status !== PaymentStatus.SUCCESS &&
            companion.status !== PaymentStatus.VOIDED
          ) {
            const cgw = this.parseGateway(companion.gatewayResponse) ?? {
              provider: 'razorpay' as const,
            };
            companion.status = PaymentStatus.FAILED;
            companion.gatewayResponse = JSON.stringify({
              ...cgw,
              orderId,
              event: 'payment.failed',
            });
            await this.paymentRepo.save(companion);
          }
        }
      } catch {
        /* ignore */
      }
      return { ok: true, failed: true };
    }

    return { ok: true, ignored: true, event };
  }

  private async resolveWebhookSecret(): Promise<string | null> {
    return this.settings.getWebhookSecret();
  }

  private async findPaymentForRazorpayOrder(
    orderId: string,
    paymentId?: number,
  ): Promise<Payment> {
    if (paymentId) {
      const byId = await this.paymentRepo.findOne({
        where: { id: paymentId },
        relations: ['feeRecord', 'feeRecord.exam'],
      });
      if (byId) {
        const gw = this.parseGateway(byId.gatewayResponse);
        if (!gw?.orderId || gw.orderId === orderId) return byId;
      }
    }

    const recent = await this.paymentRepo.find({
      where: { paymentMode: PaymentMode.ONLINE },
      relations: ['feeRecord', 'feeRecord.exam'],
      order: { id: 'DESC' },
      take: 200,
    });
    const match = recent.find((p) => {
      const gw = this.parseGateway(p.gatewayResponse);
      return gw?.orderId === orderId && this.isExamFeeLine(gw);
    }) ?? recent.find((p) => {
      const gw = this.parseGateway(p.gatewayResponse);
      return gw?.orderId === orderId;
    });
    if (!match) throw AppError.notFound('Payment for this order was not found');
    return match;
  }

  private async finalizeRazorpaySuccess(
    payment: Payment,
    meta: {
      paymentId?: string;
      orderId: string;
      signature?: string;
      event?: string;
      method?: string;
    },
  ) {
    const methodMap: Record<string, string> = {
      upi: PaymentMethod.UPI,
      card: PaymentMethod.DEBIT_CARD,
      netbanking: PaymentMethod.NET_BANKING,
    };
    const rzMethod =
      meta.method && methodMap[meta.method]
        ? methodMap[meta.method]
        : payment.paymentMethod;

    const applySuccess = async (row: Payment) => {
      const existing = this.parseGateway(row.gatewayResponse) ?? {
        provider: 'razorpay' as const,
      };
      row.status = PaymentStatus.SUCCESS;
      row.transactionReference =
        meta.paymentId || row.transactionReference;
      if (this.isExamFeeLine(existing)) {
        row.paymentMethod = rzMethod;
      }
      row.gatewayResponse = JSON.stringify({
        ...existing,
        provider: 'razorpay',
        orderId: meta.orderId,
        paymentId: meta.paymentId,
        signature: meta.signature,
        event: meta.event ?? 'captured',
        method: meta.method,
      } satisfies GatewayPayload);
      await this.paymentRepo.save(row);
    };

    await applySuccess(payment);

    const gw = this.parseGateway(payment.gatewayResponse);
    const companionId = gw?.companionPaymentId;
    if (companionId) {
      const companion = await this.getLinkedPayment(companionId);
      if (companion && companion.status !== PaymentStatus.SUCCESS) {
        await applySuccess(companion);
      }
    }

    if (this.isExamFeeLine(gw)) {
      await this.feeRecordRepo.update(payment.feeRecordId, {
        status: FeeStatus.PAID,
      });
    }
  }

  private async markRazorpaySuccess(
    payment: Payment,
    meta: {
      paymentId?: string;
      orderId: string;
      signature?: string;
      event?: string;
      method?: string;
    },
  ) {
    if (payment.status === PaymentStatus.SUCCESS) {
      return {
        payment: this.withVerificationMeta(payment),
        feeRecord: await this.getFeeRecord(payment.feeRecordId),
        alreadyPaid: true as const,
      };
    }

    const fee = await this.getFeeRecord(payment.feeRecordId);
    if (fee.status === FeeStatus.PAID) {
      await this.finalizeRazorpaySuccess(payment, meta);
      return {
        payment: this.withVerificationMeta(
          await this.getPayment(payment.id),
        ),
        feeRecord: fee,
        alreadyPaid: true as const,
      };
    }

    await this.finalizeRazorpaySuccess(payment, meta);

    return {
      payment: this.withVerificationMeta(await this.getPayment(payment.id)),
      feeRecord: await this.getFeeRecord(payment.feeRecordId),
      alreadyPaid: false as const,
    };
  }

  async getPaymentStatus(id: number) {
    const payment = await this.getPayment(id);
    const fee = payment.feeRecord
      ? payment.feeRecord
      : await this.getFeeRecord(payment.feeRecordId);
    return {
      paymentId: payment.id,
      status: payment.status,
      feeRecordId: payment.feeRecordId,
      feeStatus: fee.status,
      receiptNumber: payment.receiptNumber,
      transactionReference: payment.transactionReference,
      paidAt: payment.paidAt,
    };
  }

  async payOffline(dto: OfflinePaymentDto): Promise<{
    payment: Payment;
    feeRecord: ExamFeeRecord;
  }> {
    const collectedBy = dto.collectedBy?.trim();
    if (!collectedBy) {
      throw AppError.badRequest('Collector name (collectedBy) is required');
    }
    if (!dto.paymentMethod) {
      throw AppError.badRequest('Payment method is required');
    }

    let feeRecord: ExamFeeRecord | null = null;

    if (dto.feeRecordId) {
      feeRecord = await this.feeRecordRepo.findOne({
        where: { id: dto.feeRecordId },
        relations: [...this.feeRecordRelations],
      });
    } else if (dto.examId && dto.studentRollNumber?.trim()) {
      feeRecord = await this.feeRecordRepo
        .createQueryBuilder('fr')
        .leftJoinAndSelect('fr.exam', 'exam')
        .leftJoinAndSelect('exam.lateFeeSlabs', 'slabs')
        .leftJoinAndSelect('exam.examSubjects', 'examSubjects')
        .leftJoinAndSelect('examSubjects.subject', 'subject')
        .leftJoinAndSelect('fr.payments', 'payments')
        .where('fr.examId = :examId', { examId: dto.examId })
        .andWhere('LOWER(fr.studentRollNumber) = LOWER(:roll)', {
          roll: dto.studentRollNumber.trim(),
        })
        .getOne();
    } else {
      throw AppError.badRequest(
        'Provide feeRecordId, or examId with studentRollNumber',
      );
    }

    if (!feeRecord) {
      throw AppError.notFound('Pending fee record not found for student');
    }
    if (feeRecord.status === FeeStatus.PAID) {
      throw AppError.badRequest('Fee already paid');
    }

    await this.refreshLateFee(feeRecord);

    const payment = this.paymentRepo.create({
      feeRecordId: feeRecord.id,
      amountPaid: feeRecord.totalAmount,
      paymentMode: PaymentMode.OFFLINE,
      paymentMethod: dto.paymentMethod,
      status: PaymentStatus.SUCCESS,
      receiptNumber: this.generateReceiptNumber(),
      transactionReference: dto.transactionNumber?.trim() || null,
      collectedBy,
      collectorUsername: dto.collectorUsername?.trim() || null,
      remarks: dto.remarks?.trim() || null,
      gatewayResponse: JSON.stringify({
        bankName: dto.bankName?.trim() || null,
        offline: true,
      }),
    });
    await this.paymentRepo.save(payment);
    await this.feeRecordRepo.update(feeRecord.id, { status: FeeStatus.PAID });

    return {
      payment: this.withVerificationMeta(payment),
      feeRecord: await this.getFeeRecord(feeRecord.id),
    };
  }

  /**
   * Void a successful payment (human-error correction).
   * Marks the payment voided and sets the fee record back to pending/unpaid.
   */
  async voidPayment(
    paymentId: number,
    opts: {
      reason?: string;
      voidedBy?: string;
      voidedByUsername?: string;
    } = {},
  ) {
    const payment = await this.paymentRepo.findOne({
      where: { id: paymentId },
      relations: ['feeRecord', 'feeRecord.exam'],
    });
    if (!payment) throw AppError.notFound('Payment not found');

    if (payment.status === PaymentStatus.VOIDED) {
      throw AppError.badRequest('This payment is already voided');
    }
    if (payment.status !== PaymentStatus.SUCCESS) {
      throw AppError.badRequest(
        'Only successful payments can be voided. Incomplete attempts can be ignored.',
      );
    }

    const reason = opts.reason?.trim() || 'Corrected by staff';

    const voidOne = async (row: Payment) => {
      const rowGw = (() => {
        try {
          return row.gatewayResponse
            ? (JSON.parse(row.gatewayResponse) as Record<string, unknown>)
            : {};
        } catch {
          return {};
        }
      })();

      row.status = PaymentStatus.VOIDED;
      row.gatewayResponse = JSON.stringify({
        ...rowGw,
        voided: true,
        voidedAt: new Date().toISOString(),
        voidedBy: opts.voidedBy ?? null,
        voidedByUsername: opts.voidedByUsername ?? null,
        voidReason: reason,
      });
      const note = `[VOIDED] ${reason}`;
      row.remarks = row.remarks ? `${row.remarks}\n${note}` : note;
      await this.paymentRepo.save(row);
    };

    await voidOne(payment);

    const gw = this.parseGateway(payment.gatewayResponse);
    const companion = await this.getLinkedPayment(gw?.companionPaymentId);
    if (companion && companion.status === PaymentStatus.SUCCESS) {
      await voidOne(companion);
    }

    await this.feeRecordRepo.update(payment.feeRecordId, {
      status: FeeStatus.PENDING,
    });

    return {
      payment: this.withVerificationMeta(payment),
      feeRecord: await this.getFeeRecord(payment.feeRecordId),
    };
  }

  /**
   * Mark a paid fee unpaid by voiding its latest successful exam-fee payment.
   */
  async markFeeUnpaid(
    feeRecordId: number,
    opts: {
      reason?: string;
      voidedBy?: string;
      voidedByUsername?: string;
    } = {},
  ) {
    const feeRecord = await this.getFeeRecord(feeRecordId);
    if (feeRecord.status !== FeeStatus.PAID) {
      throw AppError.badRequest('Fee is already unpaid / pending');
    }

    const successPayments = await this.paymentRepo.find({
      where: {
        feeRecordId,
        status: PaymentStatus.SUCCESS,
      },
      order: { id: 'DESC' },
    });

    const examPayment =
      successPayments.find((p) =>
        this.isExamFeeLine(this.parseGateway(p.gatewayResponse)),
      ) ?? successPayments[0];

    if (!examPayment) {
      await this.feeRecordRepo.update(feeRecordId, {
        status: FeeStatus.PENDING,
      });
      return {
        payment: null,
        feeRecord: await this.getFeeRecord(feeRecordId),
      };
    }

    return this.voidPayment(examPayment.id, opts);
  }

  listPayments(feeRecordId?: number): Promise<Payment[]> {
    const qb = this.paymentRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.feeRecord', 'fr')
      .leftJoinAndSelect('fr.exam', 'exam')
      .orderBy('p.paidAt', 'DESC');
    if (feeRecordId) {
      qb.andWhere('p.feeRecordId = :feeRecordId', { feeRecordId });
    }
    return qb.getMany();
  }

  async getPayment(id: number): Promise<Payment> {
    const payment = await this.paymentRepo.findOne({
      where: { id },
      relations: ['feeRecord', 'feeRecord.exam', 'feeRecord.exam.examSubjects'],
    });
    if (!payment) throw AppError.notFound('Payment / receipt not found');
    return payment;
  }

  async getPaymentByReceiptNumber(receiptNumber: string): Promise<Payment> {
    const receipt = receiptNumber.trim();
    if (!receipt) throw AppError.badRequest('Receipt number is required');

    const payment = await this.paymentRepo.findOne({
      where: { receiptNumber: receipt },
      relations: ['feeRecord', 'feeRecord.exam'],
    });
    if (!payment) throw AppError.notFound('Receipt not found');
    return payment;
  }

  makeReceiptVerifyToken(receiptNumber: string): string {
    return createHmac('sha256', config.jwt.secret)
      .update(`receipt:${receiptNumber.trim()}`)
      .digest('hex')
      .slice(0, 16);
  }

  /**
   * Public verification payload — confirms a printed receipt is genuine.
   * Token (`v`) is recommended (QR); receipt number alone is also accepted.
   */
  async verifyReceipt(receiptNumber: string, token?: string) {
    const receipt = receiptNumber.trim();
    if (!receipt) throw AppError.badRequest('Receipt number is required');

    const expected = this.makeReceiptVerifyToken(receipt);
    const provided = token?.trim();

    // If a token is supplied, it must match (prevents forged links)
    if (provided && provided !== expected) {
      throw AppError.forbidden('Invalid receipt verification link');
    }

    const payment = await this.getPaymentByReceiptNumber(receipt);
    const fr = payment.feeRecord;
    const exam = fr?.exam;

    return {
      valid: true,
      receiptNumber: payment.receiptNumber,
      amountPaid: Number(payment.amountPaid),
      paymentMode: payment.paymentMode,
      paymentMethod: payment.paymentMethod,
      paidAt: payment.paidAt,
      studentName: fr?.studentName ?? '—',
      studentRollNumber: fr?.studentRollNumber ?? '—',
      examName: exam?.name ?? null,
      college: exam?.college ?? null,
      course: exam?.course ?? null,
      branch: exam?.branch ?? null,
      batch: exam?.batch ?? null,
      yearOfStudy: exam?.yearOfStudy ?? null,
      semester: exam?.semester ?? null,
      collectedBy: payment.collectedBy,
      status: payment.status,
      tokenValidated: Boolean(provided && provided === expected),
    };
  }

  withVerificationMeta(payment: Payment) {
    const token = this.makeReceiptVerifyToken(payment.receiptNumber);
    return {
      ...payment,
      verificationToken: token,
    };
  }

  async listPaymentsByRoll(rollNumber: string): Promise<Payment[]> {
    const roll = rollNumber.trim();
    return this.paymentRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.feeRecord', 'fr')
      .leftJoinAndSelect('fr.exam', 'exam')
      .where('LOWER(fr.studentRollNumber) = LOWER(:roll)', { roll })
      .orderBy('p.paidAt', 'DESC')
      .getMany();
  }
}
