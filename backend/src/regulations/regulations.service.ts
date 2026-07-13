import { Repository } from 'typeorm';
import { AppError } from '../common/errors';
import { Regulation } from './schemas/regulation.schema';
import { RegulationScope } from './schemas/regulation-scope.schema';
import { Subject } from '../subjects/schemas/subject.schema';
import {
  CreateRegulationDto,
  UpdateRegulationDto,
  RegulationScopeInput,
} from './dto/regulation.dto';
import { RegulationStatus } from './schemas/regulation-status.enum';
import { SdmsService } from '../sdms/sdms.service';

export class RegulationsService {
  constructor(
    private readonly regulationRepo: Repository<Regulation>,
    private readonly scopeRepo: Repository<RegulationScope>,
    private readonly subjectRepo: Repository<Subject>,
    private readonly sdms: SdmsService,
  ) {}

  private expandScopes(
    regulationId: number,
    scopeInputs: RegulationScopeInput[],
  ): RegulationScope[] {
    const rows: RegulationScope[] = [];
    for (const entry of scopeInputs) {
      const uniqueBatches = [...new Set(entry.batches.map((b) => b.trim()).filter(Boolean))];
      if (uniqueBatches.length === 0) {
        throw AppError.badRequest(
          `Select at least one batch for ${entry.collegeName} / ${entry.courseName}`,
        );
      }
      for (const batch of uniqueBatches) {
        rows.push(
          this.scopeRepo.create({
            regulationId,
            collegeId: entry.collegeId,
            collegeName: entry.collegeName,
            courseId: entry.courseId,
            courseName: entry.courseName,
            batch,
          }),
        );
      }
    }
    return rows;
  }

  private scopeKey(collegeId: number, courseId: number, batch: string) {
    return `${collegeId}:${courseId}:${batch}`;
  }

  async getClaimedBatches(excludeRegulationId?: number) {
    const qb = this.scopeRepo
      .createQueryBuilder('scope')
      .innerJoin('scope.regulation', 'regulation')
      .where('regulation.status = :status', {
        status: RegulationStatus.ACTIVE,
      });

    if (excludeRegulationId) {
      qb.andWhere('regulation.id != :excludeId', {
        excludeId: excludeRegulationId,
      });
    }

    const rows = await qb
      .select([
        'scope.collegeId AS collegeId',
        'scope.collegeName AS collegeName',
        'scope.courseId AS courseId',
        'scope.courseName AS courseName',
        'scope.batch AS batch',
        'regulation.id AS regulationId',
        'regulation.code AS regulationCode',
        'regulation.name AS regulationName',
      ])
      .orderBy('scope.collegeName', 'ASC')
      .addOrderBy('scope.courseName', 'ASC')
      .addOrderBy('scope.batch', 'DESC')
      .getRawMany<{
        collegeId: number;
        collegeName: string;
        courseId: number;
        courseName: string;
        batch: string;
        regulationId: number;
        regulationCode: string;
        regulationName: string;
      }>();

    return rows;
  }

  private async assertScopesNotClaimed(
    scopeInputs: RegulationScopeInput[],
    excludeRegulationId?: number,
  ) {
    if (scopeInputs.length === 0) return;

    const claimed = await this.getClaimedBatches(excludeRegulationId);
    const claimedByKey = new Map(
      claimed.map((row) => [this.scopeKey(row.collegeId, row.courseId, row.batch), row]),
    );

    for (const entry of scopeInputs) {
      for (const batch of entry.batches) {
        const conflict = claimedByKey.get(
          this.scopeKey(entry.collegeId, entry.courseId, batch),
        );
        if (conflict) {
          throw AppError.badRequest(
            `Batch ${batch} for ${entry.collegeName} / ${entry.courseName} is already assigned to active regulation ${conflict.regulationCode}`,
          );
        }
      }
    }
  }

  private async replaceScopes(
    regulationId: number,
    scopeInputs?: RegulationScopeInput[],
    options?: { skipClaimCheck?: boolean; regulationStatus?: RegulationStatus },
  ) {
    if (scopeInputs === undefined) return;

    const status =
      options?.regulationStatus ??
      (await this.findOne(regulationId)).status;

    if (
      !options?.skipClaimCheck &&
      status === RegulationStatus.ACTIVE &&
      scopeInputs.length > 0
    ) {
      await this.assertScopesNotClaimed(scopeInputs, regulationId);
    }

    await this.scopeRepo.delete({ regulationId });
    if (scopeInputs.length === 0) return;
    const rows = this.expandScopes(regulationId, scopeInputs);
    await this.scopeRepo.save(rows);
  }

  private groupScopes(scopes: RegulationScope[]) {
    const collegeMap = new Map<
      number,
      {
        collegeId: number;
        collegeName: string;
        courses: Map<
          number,
          {
            courseId: number;
            courseName: string;
            batches: { batch: string; scopeId: number; studentCount?: number }[];
          }
        >;
      }
    >();

    for (const scope of scopes) {
      if (!collegeMap.has(scope.collegeId)) {
        collegeMap.set(scope.collegeId, {
          collegeId: scope.collegeId,
          collegeName: scope.collegeName,
          courses: new Map(),
        });
      }
      const college = collegeMap.get(scope.collegeId)!;
      if (!college.courses.has(scope.courseId)) {
        college.courses.set(scope.courseId, {
          courseId: scope.courseId,
          courseName: scope.courseName,
          batches: [],
        });
      }
      college.courses.get(scope.courseId)!.batches.push({
        batch: scope.batch,
        scopeId: scope.id,
      });
    }

    return Array.from(collegeMap.values()).map((college) => ({
      collegeId: college.collegeId,
      collegeName: college.collegeName,
      courses: Array.from(college.courses.values()),
    }));
  }

  async create(dto: CreateRegulationDto): Promise<Regulation> {
    const exists = await this.regulationRepo.findOne({
      where: { code: dto.code },
    });
    if (exists) {
      throw AppError.badRequest(
        `Regulation code '${dto.code}' already exists`,
      );
    }

    const { scopes, ...meta } = dto;
    const status = dto.status ?? RegulationStatus.ACTIVE;
    const regulation = this.regulationRepo.create({
      ...meta,
      status,
    });
    const saved = await this.regulationRepo.save(regulation);

    if (scopes && status === RegulationStatus.ACTIVE) {
      await this.assertScopesNotClaimed(scopes);
    }
    await this.replaceScopes(saved.id, scopes ?? [], {
      skipClaimCheck: true,
      regulationStatus: status,
    });
    return this.findOne(saved.id);
  }

  findAll(): Promise<Regulation[]> {
    return this.regulationRepo.find({
      order: { createdAt: 'DESC' },
      relations: ['scopes'],
    });
  }

  async findOne(id: number): Promise<Regulation> {
    const regulation = await this.regulationRepo.findOne({
      where: { id },
      relations: ['scopes'],
    });
    if (!regulation) throw AppError.notFound('Regulation not found');
    return regulation;
  }

  async getDetail(id: number) {
    const regulation = await this.findOne(id);
    const grouped = this.groupScopes(regulation.scopes ?? []);

    const scopeSummaries = await Promise.all(
      (regulation.scopes ?? []).map(async (scope) => {
        try {
          const insight = await this.sdms.getBatchScopeInsight({
            collegeId: scope.collegeId,
            courseId: scope.courseId,
            batch: scope.batch,
          });
          return {
            scopeId: scope.id,
            studentCount: insight.totalStudents,
          };
        } catch {
          return { scopeId: scope.id, studentCount: 0 };
        }
      }),
    );
    const countByScopeId = new Map(
      scopeSummaries.map((s) => [s.scopeId, s.studentCount]),
    );

    const colleges = grouped.map((college) => ({
      ...college,
      courses: college.courses.map((course) => ({
        ...course,
        batches: course.batches.map((b) => ({
          ...b,
          studentCount: countByScopeId.get(b.scopeId) ?? 0,
        })),
      })),
    }));

    const totalStudents = scopeSummaries.reduce(
      (sum, s) => sum + s.studentCount,
      0,
    );

    return {
      ...regulation,
      colleges,
      summary: {
        collegeCount: colleges.length,
        courseCount: colleges.reduce((n, c) => n + c.courses.length, 0),
        batchCount: regulation.scopes?.length ?? 0,
        totalStudents,
      },
    };
  }

  async getBatchInsight(
    regulationId: number,
    params: { collegeId: number; courseId: number; batch: string },
  ) {
    const regulation = await this.findOne(regulationId);
    const scope = regulation.scopes?.find(
      (s) =>
        s.collegeId === params.collegeId &&
        s.courseId === params.courseId &&
        s.batch === params.batch,
    );
    if (!scope) {
      throw AppError.notFound('This batch is not mapped to the regulation');
    }
    return this.sdms.getBatchScopeInsight(params);
  }

  async update(id: number, dto: UpdateRegulationDto): Promise<Regulation> {
    const regulation = await this.findOne(id);
    if (dto.code && dto.code !== regulation.code) {
      const exists = await this.regulationRepo.findOne({
        where: { code: dto.code },
      });
      if (exists) {
        throw AppError.badRequest(
          `Regulation code '${dto.code}' already exists`,
        );
      }
    }

    const { scopes, ...meta } = dto;
    const finalStatus = dto.status ?? regulation.status;
    Object.assign(regulation, meta);
    await this.regulationRepo.save(regulation);

    if (scopes !== undefined && finalStatus === RegulationStatus.ACTIVE) {
      await this.assertScopesNotClaimed(scopes, id);
    }
    await this.replaceScopes(id, scopes, {
      skipClaimCheck: true,
      regulationStatus: finalStatus,
    });
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    const regulation = await this.findOne(id);
    const subjectCount = await this.subjectRepo.count({
      where: { regulationId: id },
    });
    if (subjectCount > 0) {
      throw AppError.badRequest(
        'Cannot delete regulation while subjects are linked to it',
      );
    }
    await this.regulationRepo.remove(regulation);
  }
}
