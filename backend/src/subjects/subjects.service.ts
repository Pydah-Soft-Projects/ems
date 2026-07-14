import { In, Repository } from 'typeorm';
import { AppError } from '../common/errors';
import { Subject } from './schemas/subject.schema';
import { SubjectMappingEntry } from './schemas/subject-mapping-entry.schema';
import { Regulation } from '../regulations/schemas/regulation.schema';
import {
  CreateSubjectDto,
  UpdateSubjectDto,
  CreateSubjectMappingBulkDto,
  SubjectMappingAssignmentDto,
  UpdateSubjectMappingDto,
  ReplaceScopeMappingDto,
  normalizeSectionFields,
} from './dto/subject.dto';
import { SubjectStatus, SubjectType } from './schemas/subject.enums';

export class SubjectsService {
  constructor(
    private readonly subjectRepo: Repository<Subject>,
    private readonly mappingRepo: Repository<SubjectMappingEntry>,
    private readonly regulationRepo: Repository<Regulation>,
  ) {}

  private async assertRegulation(regulationId: number) {
    const regulation = await this.regulationRepo.findOne({
      where: { id: regulationId },
    });
    if (!regulation) throw AppError.notFound('Regulation not found');
    return regulation;
  }

  async create(dto: CreateSubjectDto): Promise<Subject> {
    await this.assertRegulation(dto.regulationId);

    if (!dto.code?.trim() || !dto.name?.trim()) {
      throw AppError.badRequest('Regulation, code, and name are required');
    }

    const exists = await this.subjectRepo.findOne({
      where: {
        regulationId: dto.regulationId,
        code: dto.code,
      },
    });
    if (exists) {
      throw AppError.badRequest(
        `Subject code '${dto.code}' already exists for this regulation`,
      );
    }

    const subject = this.subjectRepo.create({
      ...dto,
      type: dto.type ?? SubjectType.THEORY,
      status: dto.status ?? SubjectStatus.ACTIVE,
      credits: dto.credits ?? 0,
      internalMarks: dto.internalMarks ?? 0,
      externalMarks: dto.externalMarks ?? 0,
      totalMarks:
        dto.totalMarks ??
        (dto.internalMarks ?? 0) + (dto.externalMarks ?? 0),
      yearOfStudy: dto.yearOfStudy ?? 1,
      collegeId: dto.collegeId ?? null,
      collegeName: dto.collegeName ?? null,
      courseId: dto.courseId ?? null,
      courseName: dto.courseName ?? null,
      branchId: dto.branchId ?? null,
      branchName: dto.branchName ?? null,
      semester: dto.semester ?? null,
    });
    return this.subjectRepo.save(subject);
  }

  findAll(regulationId?: number): Promise<Subject[]> {
    const where = regulationId ? { regulationId } : {};
    return this.subjectRepo.find({ where, order: { code: 'ASC' } });
  }

  async findOne(id: number): Promise<Subject> {
    const subject = await this.subjectRepo.findOne({ where: { id } });
    if (!subject) throw AppError.notFound('Subject not found');
    return subject;
  }

  async update(id: number, dto: UpdateSubjectDto): Promise<Subject> {
    const subject = await this.findOne(id);
    if (dto.regulationId && dto.regulationId !== subject.regulationId) {
      await this.assertRegulation(dto.regulationId);
    }
    if (dto.code && dto.code !== subject.code) {
      const exists = await this.subjectRepo.findOne({
        where: {
          regulationId: dto.regulationId ?? subject.regulationId,
          code: dto.code,
        },
      });
      if (exists && exists.id !== subject.id) {
        throw AppError.badRequest(
          `Subject code '${dto.code}' already exists for this regulation`,
        );
      }
    }
    Object.assign(subject, dto);
    if (dto.internalMarks !== undefined || dto.externalMarks !== undefined) {
      subject.totalMarks =
        dto.totalMarks ??
        Number(subject.internalMarks) + Number(subject.externalMarks);
    }
    return this.subjectRepo.save(subject);
  }

  async remove(id: number): Promise<void> {
    const subject = await this.findOne(id);
    await this.subjectRepo.remove(subject);
  }

  private async resolveSubjects(
    regulationId: number,
    subjectIds: number[],
  ): Promise<Subject[]> {
    const subjects = await this.subjectRepo.find({
      where: { id: In(subjectIds), regulationId },
    });
    if (subjects.length !== subjectIds.length) {
      throw AppError.badRequest(
        'One or more subjects are invalid for the selected regulation',
      );
    }
    return subjects;
  }

  private async assertRegulationWithScopes(regulationId: number) {
    const regulation = await this.regulationRepo.findOne({
      where: { id: regulationId },
      relations: ['scopes'],
    });
    if (!regulation) throw AppError.notFound('Regulation not found');
    return regulation;
  }

  private assertAssignmentInRegulationScope(
    regulation: Regulation,
    assignment: SubjectMappingAssignmentDto,
  ) {
    const inScope = regulation.scopes?.some(
      (scope) =>
        scope.collegeId === assignment.collegeId &&
        scope.courseId === assignment.courseId &&
        scope.batch === assignment.batch,
    );
    if (!inScope) {
      throw AppError.badRequest(
        `Batch ${assignment.batch} for ${assignment.collegeName} / ${assignment.courseName} is not in the regulation scope`,
      );
    }
  }

  async createMapping(
    dto: CreateSubjectMappingBulkDto,
  ): Promise<SubjectMappingEntry[]> {
    const regulation = await this.assertRegulationWithScopes(dto.regulationId);

    if (!dto.assignments?.length) {
      throw AppError.badRequest('At least one subject assignment is required');
    }

    const subjectIds = [...new Set(dto.assignments.map((a) => a.subjectId))];
    await this.resolveSubjects(dto.regulationId, subjectIds);

    for (const assignment of dto.assignments) {
      this.assertAssignmentInRegulationScope(regulation, assignment);
      const sectionFields = normalizeSectionFields(assignment);

      const exists = await this.mappingRepo.findOne({
        where: {
          regulationId: dto.regulationId,
          subjectId: assignment.subjectId,
          collegeId: assignment.collegeId,
          courseId: assignment.courseId,
          branchId: assignment.branchId,
          batch: assignment.batch,
          yearOfStudy: assignment.yearOfStudy,
          semester: assignment.semester,
          sectionKey: sectionFields.sectionKey,
        },
      });
      if (exists) {
        throw AppError.badRequest(
          `Subject is already mapped for ${assignment.branchName} batch ${assignment.batch} year ${assignment.yearOfStudy} semester ${assignment.semester} (${sectionFields.sectionMode === 'all' ? 'all sections' : sectionFields.sections?.join(', ')})`,
        );
      }
    }

    const rows = dto.assignments.map((assignment) => {
      const sectionFields = normalizeSectionFields(assignment);
      return this.mappingRepo.create({
        regulationId: dto.regulationId,
        subjectId: assignment.subjectId,
        collegeId: assignment.collegeId,
        collegeName: assignment.collegeName,
        courseId: assignment.courseId,
        courseName: assignment.courseName,
        branchId: assignment.branchId,
        branchName: assignment.branchName,
        batch: assignment.batch,
        yearOfStudy: assignment.yearOfStudy,
        semester: assignment.semester,
        ...sectionFields,
      });
    });
    return this.mappingRepo.save(rows);
  }

  /**
   * Sync subjects for one academic scope. Creates missing rows, deletes removed,
   * updates section fields on kept rows. Same table as createMapping / updateMapping.
   */
  async replaceScopeMapping(
    dto: ReplaceScopeMappingDto,
  ): Promise<SubjectMappingEntry[]> {
    const regulation = await this.assertRegulationWithScopes(dto.regulationId);
    const subjectIds = [...new Set(dto.subjectIds ?? [])];

    const scopeAssignment: SubjectMappingAssignmentDto = {
      subjectId: 0,
      collegeId: dto.collegeId,
      collegeName: dto.collegeName,
      courseId: dto.courseId,
      courseName: dto.courseName,
      branchId: dto.branchId,
      branchName: dto.branchName,
      batch: dto.batch,
      yearOfStudy: dto.yearOfStudy,
      semester: dto.semester,
      sectionMode: dto.sectionMode,
      sections: dto.sections,
    };
    this.assertAssignmentInRegulationScope(regulation, {
      ...scopeAssignment,
      subjectId: subjectIds[0] ?? 0,
    });

    const sectionFields = normalizeSectionFields(dto);

    if (dto.previous) {
      const prevKey = dto.previous.sectionKey;
      const newKey = sectionFields.sectionKey;
      const scopeMoved =
        dto.previous.collegeId !== dto.collegeId ||
        dto.previous.courseId !== dto.courseId ||
        dto.previous.branchId !== dto.branchId ||
        dto.previous.batch !== dto.batch ||
        dto.previous.yearOfStudy !== dto.yearOfStudy ||
        dto.previous.semester !== dto.semester ||
        prevKey !== newKey;

      if (scopeMoved) {
        const oldRows = await this.mappingRepo.find({
          where: {
            regulationId: dto.regulationId,
            collegeId: dto.previous.collegeId,
            courseId: dto.previous.courseId,
            branchId: dto.previous.branchId,
            batch: dto.previous.batch,
            yearOfStudy: dto.previous.yearOfStudy,
            semester: dto.previous.semester,
            sectionKey: dto.previous.sectionKey,
          },
        });
        if (oldRows.length > 0) await this.mappingRepo.remove(oldRows);
      }
    }

    const existing = await this.mappingRepo.find({
      where: {
        regulationId: dto.regulationId,
        collegeId: dto.collegeId,
        courseId: dto.courseId,
        branchId: dto.branchId,
        batch: dto.batch,
        yearOfStudy: dto.yearOfStudy,
        semester: dto.semester,
        sectionKey: sectionFields.sectionKey,
      },
      relations: ['subject'],
    });

    if (subjectIds.length === 0) {
      if (existing.length > 0) await this.mappingRepo.remove(existing);
      return [];
    }

    await this.resolveSubjects(dto.regulationId, subjectIds);

    const keep = new Set(subjectIds);
    const toRemove = existing.filter((row) => !keep.has(row.subjectId));
    if (toRemove.length > 0) {
      await this.mappingRepo.remove(toRemove);
    }

    const existingBySubject = new Map(
      existing
        .filter((row) => keep.has(row.subjectId))
        .map((row) => [row.subjectId, row]),
    );
    const result: SubjectMappingEntry[] = [];

    for (const subjectId of subjectIds) {
      const current = existingBySubject.get(subjectId);
      if (current) {
        Object.assign(current, {
          collegeName: dto.collegeName,
          courseName: dto.courseName,
          branchName: dto.branchName,
          ...sectionFields,
        });
        result.push(await this.mappingRepo.save(current));
      } else {
        const created = await this.mappingRepo.save(
          this.mappingRepo.create({
            regulationId: dto.regulationId,
            subjectId,
            collegeId: dto.collegeId,
            collegeName: dto.collegeName,
            courseId: dto.courseId,
            courseName: dto.courseName,
            branchId: dto.branchId,
            branchName: dto.branchName,
            batch: dto.batch,
            yearOfStudy: dto.yearOfStudy,
            semester: dto.semester,
            ...sectionFields,
          }),
        );
        const loaded = await this.mappingRepo.findOne({
          where: { id: created.id },
          relations: ['subject'],
        });
        if (loaded) result.push(loaded);
      }
    }

    return result;
  }

  findAllMappings(filters?: {
    regulationId?: number;
    course?: string;
    branch?: string;
    batch?: string;
    yearOfStudy?: number;
    semester?: number;
    subjectId?: number;
  }): Promise<SubjectMappingEntry[]> {
    const qb = this.mappingRepo
      .createQueryBuilder('entry')
      .leftJoinAndSelect('entry.subject', 'subject')
      .orderBy('entry.createdAt', 'DESC');

    if (filters?.regulationId) {
      qb.andWhere('entry.regulationId = :regulationId', {
        regulationId: filters.regulationId,
      });
    }
    if (filters?.course) {
      qb.andWhere('entry.courseName = :course', { course: filters.course });
    }
    if (filters?.branch) {
      qb.andWhere('entry.branchName = :branch', { branch: filters.branch });
    }
    if (filters?.batch) {
      qb.andWhere('entry.batch = :batch', { batch: filters.batch });
    }
    if (filters?.yearOfStudy) {
      qb.andWhere('entry.yearOfStudy = :yearOfStudy', {
        yearOfStudy: filters.yearOfStudy,
      });
    }
    if (filters?.semester) {
      qb.andWhere('entry.semester = :semester', { semester: filters.semester });
    }
    if (filters?.subjectId) {
      qb.andWhere('entry.subjectId = :subjectId', {
        subjectId: filters.subjectId,
      });
    }

    return qb.getMany();
  }

  async findMapping(id: number): Promise<SubjectMappingEntry> {
    const mapping = await this.mappingRepo.findOne({
      where: { id },
      relations: ['subject'],
    });
    if (!mapping) throw AppError.notFound('Subject mapping not found');
    return mapping;
  }

  async updateMapping(
    id: number,
    dto: UpdateSubjectMappingDto,
  ): Promise<SubjectMappingEntry> {
    const mapping = await this.findMapping(id);
    const regulation = await this.assertRegulationWithScopes(
      mapping.regulationId,
    );

    const next: SubjectMappingAssignmentDto = {
      subjectId: dto.subjectId ?? mapping.subjectId,
      collegeId: dto.collegeId ?? mapping.collegeId,
      collegeName: dto.collegeName ?? mapping.collegeName,
      courseId: dto.courseId ?? mapping.courseId,
      courseName: dto.courseName ?? mapping.courseName,
      branchId: dto.branchId ?? mapping.branchId,
      branchName: dto.branchName ?? mapping.branchName,
      batch: dto.batch ?? mapping.batch,
      yearOfStudy: dto.yearOfStudy ?? mapping.yearOfStudy,
      semester: dto.semester ?? mapping.semester,
      sectionMode: dto.sectionMode ?? mapping.sectionMode,
      sections:
        dto.sections !== undefined ? dto.sections : (mapping.sections ?? undefined),
    };

    await this.resolveSubjects(mapping.regulationId, [next.subjectId]);
    this.assertAssignmentInRegulationScope(regulation, next);
    const sectionFields = normalizeSectionFields(next);

    const duplicate = await this.mappingRepo.findOne({
      where: {
        regulationId: mapping.regulationId,
        subjectId: next.subjectId,
        collegeId: next.collegeId,
        courseId: next.courseId,
        branchId: next.branchId,
        batch: next.batch,
        yearOfStudy: next.yearOfStudy,
        semester: next.semester,
        sectionKey: sectionFields.sectionKey,
      },
    });
    if (duplicate && duplicate.id !== mapping.id) {
      throw AppError.badRequest('This subject assignment already exists');
    }

    Object.assign(mapping, {
      ...next,
      ...sectionFields,
    });
    return this.mappingRepo.save(mapping);
  }

  async removeMapping(id: number): Promise<void> {
    const mapping = await this.findMapping(id);
    await this.mappingRepo.remove(mapping);
  }

  async getMappedSubjectsForExam(params: {
    regulationId: number;
    course: string;
    branch: string;
    batch: string;
    yearOfStudy: number;
    semester: number;
  }): Promise<Subject[]> {
    const entries = await this.mappingRepo.find({
      where: {
        regulationId: params.regulationId,
        courseName: params.course,
        branchName: params.branch,
        batch: params.batch,
        yearOfStudy: params.yearOfStudy,
        semester: params.semester,
      },
      relations: ['subject'],
    });
    if (entries.length === 0) {
      throw AppError.badRequest(
        'Subject mapping not found for the selected academic scope',
      );
    }
    const byId = new Map<number, Subject>();
    for (const entry of entries) {
      if (entry.subject) byId.set(entry.subject.id, entry.subject);
    }
    return Array.from(byId.values());
  }
}
