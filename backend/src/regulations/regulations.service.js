'use strict';

const { AppError } = require('../common/errors');
const { RegulationStatus } = require('./schemas/regulation-status.enum');
class RegulationsService {
    constructor(regulationRepo, scopeRepo, subjectRepo, sdms) {
        this.regulationRepo = regulationRepo;
        this.scopeRepo = scopeRepo;
        this.subjectRepo = subjectRepo;
        this.sdms = sdms;
    }
    expandScopes(regulationId, scopeInputs) {
        const rows = [];
        for (const entry of scopeInputs) {
            const uniqueBatches = [...new Set(entry.batches.map((b) => b.trim()).filter(Boolean))];
            if (uniqueBatches.length === 0) {
                throw AppError.badRequest(`Select at least one batch for ${entry.collegeName} / ${entry.courseName}`);
            }
            for (const batch of uniqueBatches) {
                rows.push(this.scopeRepo.create({
                    regulationId,
                    collegeId: entry.collegeId,
                    collegeName: entry.collegeName,
                    courseId: entry.courseId,
                    courseName: entry.courseName,
                    batch,
                }));
            }
        }
        return rows;
    }
    scopeKey(collegeId, courseId, batch) {
        return `${collegeId}:${courseId}:${batch}`;
    }
    async getClaimedBatches(excludeRegulationId) {
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
            .getRawMany();
        return rows;
    }
    async assertScopesNotClaimed(scopeInputs, excludeRegulationId) {
        if (scopeInputs.length === 0)
            return;
        const claimed = await this.getClaimedBatches(excludeRegulationId);
        const claimedByKey = new Map(claimed.map((row) => [this.scopeKey(row.collegeId, row.courseId, row.batch), row]));
        for (const entry of scopeInputs) {
            for (const batch of entry.batches) {
                const conflict = claimedByKey.get(this.scopeKey(entry.collegeId, entry.courseId, batch));
                if (conflict) {
                    throw AppError.badRequest(`Batch ${batch} for ${entry.collegeName} / ${entry.courseName} is already assigned to active regulation ${conflict.regulationCode}`);
                }
            }
        }
    }
    async replaceScopes(regulationId, scopeInputs, options) {
        if (scopeInputs === undefined)
            return;
        const status = options?.regulationStatus ??
            (await this.findOne(regulationId)).status;
        if (!options?.skipClaimCheck &&
            status === RegulationStatus.ACTIVE &&
            scopeInputs.length > 0) {
            await this.assertScopesNotClaimed(scopeInputs, regulationId);
        }
        await this.scopeRepo.delete({ regulationId });
        if (scopeInputs.length === 0)
            return;
        const rows = this.expandScopes(regulationId, scopeInputs);
        await this.scopeRepo.save(rows);
    }
    groupScopes(scopes) {
        const collegeMap = new Map();
        for (const scope of scopes) {
            if (!collegeMap.has(scope.collegeId)) {
                collegeMap.set(scope.collegeId, {
                    collegeId: scope.collegeId,
                    collegeName: scope.collegeName,
                    courses: new Map(),
                });
            }
            const college = collegeMap.get(scope.collegeId);
            if (!college.courses.has(scope.courseId)) {
                college.courses.set(scope.courseId, {
                    courseId: scope.courseId,
                    courseName: scope.courseName,
                    batches: [],
                });
            }
            college.courses.get(scope.courseId).batches.push({
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
    async create(dto, actor) {
        if (dto.scopes && actor && !actor.isSuperAdmin) {
            const allowed = new Set((actor.collegeIds || []).map(Number));
            if (allowed.size > 0) {
                for (const s of dto.scopes) {
                    if (!allowed.has(Number(s.collegeId))) {
                        throw AppError.forbidden(`You do not have permission to map scopes for ${s.collegeName || s.collegeId}`);
                    }
                }
            }
        }
        const exists = await this.regulationRepo.findOne({
            where: { code: dto.code },
        });
        if (exists) {
            throw AppError.badRequest(`Regulation code '${dto.code}' already exists`);
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
        return this.findOne(saved.id, actor);
    }
    async findAll(actor) {
        const all = await this.regulationRepo.find({
            order: { createdAt: 'DESC' },
            relations: ['scopes'],
        });
        if (!actor || actor.isSuperAdmin) {
            return all;
        }
        const collegeIds = Array.isArray(actor.collegeIds) ? actor.collegeIds.map(Number).filter(Boolean) : [];
        if (collegeIds.length === 0) {
            return all;
        }
        const collegeSet = new Set(collegeIds);
        const courseSet = Array.isArray(actor.courseIds) && actor.courseIds.length > 0
            ? new Set(actor.courseIds.map(Number).filter(Boolean))
            : null;

        return all
            .filter((reg) => {
                if (!reg.scopes || reg.scopes.length === 0) return true;
                return reg.scopes.some((s) => {
                    if (!collegeSet.has(Number(s.collegeId))) return false;
                    if (courseSet && s.courseId && !courseSet.has(Number(s.courseId))) return false;
                    return true;
                });
            })
            .map((reg) => {
                if (reg.scopes && reg.scopes.length > 0) {
                    const filteredScopes = reg.scopes.filter((s) => {
                        if (!collegeSet.has(Number(s.collegeId))) return false;
                        if (courseSet && s.courseId && !courseSet.has(Number(s.courseId))) return false;
                        return true;
                    });
                    return { ...reg, scopes: filteredScopes };
                }
                return reg;
            });
    }
    async findOne(id, actor) {
        const regulation = await this.regulationRepo.findOne({
            where: { id },
            relations: ['scopes'],
        });
        if (!regulation)
            throw AppError.notFound('Regulation not found');
        if (actor && !actor.isSuperAdmin) {
            const collegeIds = Array.isArray(actor.collegeIds) ? actor.collegeIds.map(Number).filter(Boolean) : [];
            if (collegeIds.length > 0 && regulation.scopes && regulation.scopes.length > 0) {
                const collegeSet = new Set(collegeIds);
                const hasMatch = regulation.scopes.some((s) => collegeSet.has(Number(s.collegeId)));
                if (!hasMatch) {
                    throw AppError.forbidden('You do not have access to this regulation');
                }
            }
        }
        return regulation;
    }
    async getDetail(id, actor) {
        const regulation = await this.findOne(id, actor);
        let scopes = regulation.scopes ?? [];
        if (actor && !actor.isSuperAdmin) {
            const collegeIds = Array.isArray(actor.collegeIds) ? actor.collegeIds.map(Number).filter(Boolean) : [];
            if (collegeIds.length > 0) {
                const collegeSet = new Set(collegeIds);
                scopes = scopes.filter((s) => collegeSet.has(Number(s.collegeId)));
            }
        }
        const grouped = this.groupScopes(scopes);
        const scopeSummaries = await Promise.all(scopes.map(async (scope) => {
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
            }
            catch {
                return { scopeId: scope.id, studentCount: 0 };
            }
        }));
        const countByScopeId = new Map(scopeSummaries.map((s) => [s.scopeId, s.studentCount]));
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
        const totalStudents = scopeSummaries.reduce((sum, s) => sum + s.studentCount, 0);
        return {
            ...regulation,
            scopes,
            colleges,
            summary: {
                collegeCount: colleges.length,
                courseCount: colleges.reduce((n, c) => n + c.courses.length, 0),
                batchCount: scopes.length,
                totalStudents,
            },
        };
    }
    async getBatchInsight(regulationId, params) {
        const regulation = await this.findOne(regulationId);
        const scope = regulation.scopes?.find((s) => s.collegeId === params.collegeId &&
            s.courseId === params.courseId &&
            s.batch === params.batch);
        if (!scope) {
            throw AppError.notFound('This batch is not mapped to the regulation');
        }
        return this.sdms.getBatchScopeInsight(params);
    }
    async update(id, dto, actor) {
        const regulation = await this.findOne(id, actor);
        if (dto.scopes && actor && !actor.isSuperAdmin) {
            const allowed = new Set((actor.collegeIds || []).map(Number));
            if (allowed.size > 0) {
                for (const s of dto.scopes) {
                    if (!allowed.has(Number(s.collegeId))) {
                        throw AppError.forbidden(`You do not have permission to map scopes for ${s.collegeName || s.collegeId}`);
                    }
                }
            }
        }
        if (dto.code && dto.code !== regulation.code) {
            const exists = await this.regulationRepo.findOne({
                where: { code: dto.code },
            });
            if (exists) {
                throw AppError.badRequest(`Regulation code '${dto.code}' already exists`);
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
        return this.findOne(id, actor);
    }
    async remove(id) {
        const regulation = await this.findOne(id);
        const subjectCount = await this.subjectRepo.count({
            where: { regulationId: id },
        });
        if (subjectCount > 0) {
            throw AppError.badRequest('Cannot delete regulation while subjects are linked to it');
        }
        await this.regulationRepo.remove(regulation);
    }
}
module.exports = { RegulationsService };
