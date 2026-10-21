'use strict';

const { In } = require('typeorm');
const { AppError } = require('../common/errors');
const { normalizeSectionFields } = require('./dto/subject.dto');
const { SubjectType, SubjectStatus } = require('./schemas/subject.enums');

const DEFAULT_SUBJECT_TYPES = [
    { code: SubjectType.THEORY, name: 'Theory', sortOrder: 1 },
    { code: SubjectType.PRACTICAL, name: 'Practical', sortOrder: 2 },
    { code: SubjectType.LABORATORY, name: 'Laboratory', sortOrder: 3 },
];

function slugifyTypeCode(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 50);
}

class SubjectsService {
    constructor(subjectRepo, mappingRepo, regulationRepo, subjectTypeRepo) {
        this.subjectRepo = subjectRepo;
        this.mappingRepo = mappingRepo;
        this.regulationRepo = regulationRepo;
        this.subjectTypeRepo = subjectTypeRepo;
    }
    async assertRegulation(regulationId) {
        const regulation = await this.regulationRepo.findOne({
            where: { id: regulationId },
        });
        if (!regulation)
            throw AppError.notFound('Regulation not found');
        return regulation;
    }
    async ensureDefaultSubjectTypes() {
        const count = await this.subjectTypeRepo.count();
        if (count > 0) return;
        await this.subjectTypeRepo.save(
            DEFAULT_SUBJECT_TYPES.map((row) =>
                this.subjectTypeRepo.create({
                    ...row,
                    status: SubjectStatus.ACTIVE,
                }),
            ),
        );
    }
    async findAllSubjectTypes() {
        await this.ensureDefaultSubjectTypes();
        return this.subjectTypeRepo.find({
            order: { sortOrder: 'ASC', name: 'ASC' },
        });
    }
    async findActiveSubjectTypes() {
        await this.ensureDefaultSubjectTypes();
        return this.subjectTypeRepo.find({
            where: { status: SubjectStatus.ACTIVE },
            order: { sortOrder: 'ASC', name: 'ASC' },
        });
    }
    async assertSubjectTypeCode(code) {
        const normalized = slugifyTypeCode(code);
        if (!normalized) {
            throw AppError.badRequest('Subject type is required');
        }
        await this.ensureDefaultSubjectTypes();
        const row = await this.subjectTypeRepo.findOne({
            where: { code: normalized },
        });
        if (!row) {
            throw AppError.badRequest(
                `Unknown subject type '${normalized}'. Create it from Subjects → Manage types first.`,
            );
        }
        if (row.status !== SubjectStatus.ACTIVE) {
            throw AppError.badRequest(`Subject type '${row.name}' is inactive`);
        }
        return row;
    }
    async createSubjectType(dto) {
        const name = String(dto?.name ?? '').trim();
        if (!name) {
            throw AppError.badRequest('Type name is required');
        }
        const code = slugifyTypeCode(dto?.code || name);
        if (!code) {
            throw AppError.badRequest('Type code is required');
        }
        const exists = await this.subjectTypeRepo.findOne({ where: { code } });
        if (exists) {
            throw AppError.badRequest(`Subject type '${code}' already exists`);
        }
        const maxSort = await this.subjectTypeRepo
            .createQueryBuilder('t')
            .select('MAX(t.sortOrder)', 'max')
            .getRawOne();
        const sortOrder =
            dto?.sortOrder != null && Number.isFinite(Number(dto.sortOrder))
                ? Number(dto.sortOrder)
                : Number(maxSort?.max ?? 0) + 1;
        const row = this.subjectTypeRepo.create({
            code,
            name,
            status: dto?.status === SubjectStatus.INACTIVE
                ? SubjectStatus.INACTIVE
                : SubjectStatus.ACTIVE,
            sortOrder,
        });
        return this.subjectTypeRepo.save(row);
    }
    async updateSubjectType(id, dto) {
        const row = await this.subjectTypeRepo.findOne({ where: { id } });
        if (!row) throw AppError.notFound('Subject type not found');
        if (dto?.name != null) {
            const name = String(dto.name).trim();
            if (!name) throw AppError.badRequest('Type name is required');
            row.name = name;
        }
        if (dto?.status != null) {
            if (![SubjectStatus.ACTIVE, SubjectStatus.INACTIVE].includes(dto.status)) {
                throw AppError.badRequest('Invalid status');
            }
            row.status = dto.status;
        }
        if (dto?.sortOrder != null && Number.isFinite(Number(dto.sortOrder))) {
            row.sortOrder = Number(dto.sortOrder);
        }
        return this.subjectTypeRepo.save(row);
    }
    async findSubjectTypeUsage(id) {
        const row = await this.subjectTypeRepo.findOne({ where: { id } });
        if (!row) throw AppError.notFound('Subject type not found');
        const subjects = await this.subjectRepo
            .createQueryBuilder('s')
            .leftJoinAndSelect('s.regulation', 'regulation')
            .where('s.type = :type', { type: row.code })
            .orderBy('regulation.code', 'ASC')
            .addOrderBy('s.code', 'ASC')
            .getMany();
        return {
            type: row,
            total: subjects.length,
            subjects: subjects.map((subject) => ({
                id: subject.id,
                code: subject.code,
                name: subject.name,
                type: subject.type,
                status: subject.status,
                regulationId: subject.regulationId,
                regulationCode: subject.regulation?.code ?? null,
                regulationName: subject.regulation?.name ?? null,
            })),
        };
    }
    async reassignSubjectType(id, dto = {}) {
        const row = await this.subjectTypeRepo.findOne({ where: { id } });
        if (!row) throw AppError.notFound('Subject type not found');
        const toType = await this.assertSubjectTypeCode(dto.toTypeCode ?? dto.toType);
        if (toType.code === row.code) {
            throw AppError.badRequest('Choose a different subject type to swap to');
        }
        const subjectIds = Array.isArray(dto.subjectIds)
            ? dto.subjectIds
                .map((value) => Number(value))
                .filter((value) => Number.isFinite(value))
            : null;
        if (subjectIds && subjectIds.length === 0) {
            throw AppError.badRequest('Select at least one subject to reassign');
        }
        const where = subjectIds?.length
            ? { id: In(subjectIds), type: row.code }
            : { type: row.code };
        const result = await this.subjectRepo.update(where, { type: toType.code });
        const remaining = await this.subjectRepo.count({ where: { type: row.code } });
        return {
            fromType: row,
            toType,
            updated: result.affected ?? 0,
            remaining,
        };
    }
    async removeSubjectType(id) {
        const row = await this.subjectTypeRepo.findOne({ where: { id } });
        if (!row) throw AppError.notFound('Subject type not found');
        const inUse = await this.subjectRepo.count({ where: { type: row.code } });
        if (inUse > 0) {
            throw AppError.badRequest(
                `Cannot delete type '${row.name}' because ${inUse} subject(s) still use it. Reassign them first.`,
            );
        }
        await this.subjectTypeRepo.remove(row);
    }
    async create(dto) {
        await this.assertRegulation(dto.regulationId);
        if (!dto.code?.trim() || !dto.name?.trim()) {
            throw AppError.badRequest('Regulation, code, and name are required');
        }
        const typeRow = await this.assertSubjectTypeCode(dto.type ?? SubjectType.THEORY);
        const exists = await this.subjectRepo.findOne({
            where: {
                regulationId: dto.regulationId,
                code: dto.code,
            },
        });
        if (exists) {
            throw AppError.badRequest(`Subject code '${dto.code}' already exists for this regulation`);
        }
        const subject = this.subjectRepo.create({
            ...dto,
            type: typeRow.code,
            status: dto.status ?? SubjectStatus.ACTIVE,
            credits: dto.credits ?? 0,
            internalMarks: dto.internalMarks ?? 0,
            externalMarks: dto.externalMarks ?? 0,
            totalMarks: dto.totalMarks ??
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
    async findAll(regulationId, actor) {
        const where = regulationId ? { regulationId } : {};
        let subjects = await this.subjectRepo.find({ where, order: { code: 'ASC' } });
        if (actor && !actor.isSuperAdmin) {
            const collegeIds = Array.isArray(actor.collegeIds) ? actor.collegeIds.map(Number).filter(Boolean) : [];
            if (collegeIds.length > 0) {
                const collegeSet = new Set(collegeIds);
                subjects = subjects.filter((s) => !s.collegeId || collegeSet.has(Number(s.collegeId)));
            }
            const courseIds = Array.isArray(actor.courseIds) ? actor.courseIds.map(Number).filter(Boolean) : [];
            if (courseIds.length > 0) {
                const courseSet = new Set(courseIds);
                subjects = subjects.filter((s) => !s.courseId || courseSet.has(Number(s.courseId)));
            }
        }
        return subjects;
    }
    async findOne(id) {
        const subject = await this.subjectRepo.findOne({ where: { id } });
        if (!subject)
            throw AppError.notFound('Subject not found');
        return subject;
    }
    async update(id, dto) {
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
                throw AppError.badRequest(`Subject code '${dto.code}' already exists for this regulation`);
            }
        }
        if (dto.type != null) {
            const nextType = String(dto.type).trim().toLowerCase();
            if (nextType !== String(subject.type).toLowerCase()) {
                const typeRow = await this.assertSubjectTypeCode(dto.type);
                dto = { ...dto, type: typeRow.code };
            } else {
                dto = { ...dto, type: subject.type };
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
    async remove(id) {
        const subject = await this.findOne(id);
        await this.subjectRepo.remove(subject);
    }
    async resolveSubjects(regulationId, subjectIds) {
        const subjects = await this.subjectRepo.find({
            where: { id: In(subjectIds), regulationId },
        });
        if (subjects.length !== subjectIds.length) {
            throw AppError.badRequest('One or more subjects are invalid for the selected regulation');
        }
        return subjects;
    }
    async assertRegulationWithScopes(regulationId) {
        const regulation = await this.regulationRepo.findOne({
            where: { id: regulationId },
            relations: ['scopes'],
        });
        if (!regulation)
            throw AppError.notFound('Regulation not found');
        return regulation;
    }
    assertAssignmentInRegulationScope(regulation, assignment) {
        const inScope = regulation.scopes?.some((scope) => scope.collegeId === assignment.collegeId &&
            scope.courseId === assignment.courseId &&
            scope.batch === assignment.batch);
        if (!inScope) {
            throw AppError.badRequest(`Batch ${assignment.batch} for ${assignment.collegeName} / ${assignment.courseName} is not in the regulation scope`);
        }
    }
    async createMapping(dto) {
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
                throw AppError.badRequest(`Subject is already mapped for ${assignment.branchName} batch ${assignment.batch} year ${assignment.yearOfStudy} semester ${assignment.semester} (${sectionFields.sectionMode === 'all' ? 'all sections' : sectionFields.sections?.join(', ')})`);
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
    async replaceScopeMapping(dto) {
        const regulation = await this.assertRegulationWithScopes(dto.regulationId);
        const subjectIds = [...new Set(dto.subjectIds ?? [])];
        const scopeAssignment = {
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
            const scopeMoved = dto.previous.collegeId !== dto.collegeId ||
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
                if (oldRows.length > 0)
                    await this.mappingRepo.remove(oldRows);
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
            if (existing.length > 0)
                await this.mappingRepo.remove(existing);
            return [];
        }
        await this.resolveSubjects(dto.regulationId, subjectIds);
        const keep = new Set(subjectIds);
        const toRemove = existing.filter((row) => !keep.has(row.subjectId));
        if (toRemove.length > 0) {
            await this.mappingRepo.remove(toRemove);
        }
        const existingBySubject = new Map(existing
            .filter((row) => keep.has(row.subjectId))
            .map((row) => [row.subjectId, row]));
        const result = [];
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
            }
            else {
                const created = await this.mappingRepo.save(this.mappingRepo.create({
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
                }));
                const loaded = await this.mappingRepo.findOne({
                    where: { id: created.id },
                    relations: ['subject'],
                });
                if (loaded)
                    result.push(loaded);
            }
        }
        return result;
    }
    findAllMappings(filters) {
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
            const courses = Array.isArray(filters.course)
                ? filters.course
                : String(filters.course).split(',').map((c) => c.trim()).filter(Boolean);
            if (courses.length > 1) {
                qb.andWhere('entry.courseName IN (:...courses)', { courses });
            } else if (courses.length === 1) {
                qb.andWhere('entry.courseName = :course', { course: courses[0] });
            }
        }
        if (filters?.branch) {
            qb.andWhere('entry.branchName = :branch', { branch: filters.branch });
        }
        if (filters?.batch) {
            const batches = Array.isArray(filters.batch)
                ? filters.batch
                : String(filters.batch).split(',').map((b) => b.trim()).filter(Boolean);
            if (batches.length > 1) {
                qb.andWhere('entry.batch IN (:...batches)', { batches });
            } else if (batches.length === 1) {
                qb.andWhere('entry.batch = :batch', { batch: batches[0] });
            }
        }
        if (filters?.yearOfStudy) {
            const years = Array.isArray(filters.yearOfStudy)
                ? filters.yearOfStudy.map(Number)
                : [Number(filters.yearOfStudy)];
            if (years.length > 1) {
                qb.andWhere('entry.yearOfStudy IN (:...years)', { years });
            } else if (years.length === 1) {
                qb.andWhere('entry.yearOfStudy = :yearOfStudy', { yearOfStudy: years[0] });
            }
        }
        if (filters?.semester) {
            const sems = Array.isArray(filters.semester)
                ? filters.semester.map(Number)
                : [Number(filters.semester)];
            if (sems.length > 1) {
                qb.andWhere('entry.semester IN (:...sems)', { sems });
            } else if (sems.length === 1) {
                qb.andWhere('entry.semester = :semester', { semester: sems[0] });
            }
        }
        if (filters?.subjectId) {
            qb.andWhere('entry.subjectId = :subjectId', {
                subjectId: filters.subjectId,
            });
        }
        return qb.getMany();
    }
    async findMapping(id) {
        const mapping = await this.mappingRepo.findOne({
            where: { id },
            relations: ['subject'],
        });
        if (!mapping)
            throw AppError.notFound('Subject mapping not found');
        return mapping;
    }
    async updateMapping(id, dto) {
        const mapping = await this.findMapping(id);
        const regulation = await this.assertRegulationWithScopes(mapping.regulationId);
        const next = {
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
            sections: dto.sections !== undefined ? dto.sections : (mapping.sections ?? undefined),
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
    async removeMapping(id) {
        const mapping = await this.findMapping(id);
        await this.mappingRepo.remove(mapping);
    }
    async getMappedSubjectEntriesForExam(params) {
        const courseVals = Array.isArray(params.course)
            ? params.course
            : (typeof params.course === 'string'
                ? params.course.split(',').map((c) => c.trim()).filter(Boolean)
                : (params.course ? [params.course] : []));
        const batchVals = Array.isArray(params.batch)
            ? params.batch
            : (typeof params.batch === 'string'
                ? params.batch.split(',').map((b) => b.trim()).filter(Boolean)
                : (params.batch ? [params.batch] : []));
        const yearVals = Array.isArray(params.yearOfStudy)
            ? params.yearOfStudy.map(Number)
            : (params.yearOfStudy != null ? [Number(params.yearOfStudy)] : []);
        const semVals = Array.isArray(params.semester)
            ? params.semester.map(Number)
            : (params.semester != null ? [Number(params.semester)] : []);

        const where = {
            regulationId: params.regulationId,
            branchName: params.branch,
        };
        if (courseVals.length > 1) {
            where.courseName = In(courseVals);
        } else if (courseVals.length === 1) {
            where.courseName = courseVals[0];
        } else if (params.course) {
            where.courseName = params.course;
        }
        if (batchVals.length > 1) {
            where.batch = In(batchVals);
        } else if (batchVals.length === 1) {
            where.batch = batchVals[0];
        }
        if (yearVals.length > 1) {
            where.yearOfStudy = In(yearVals);
        } else if (yearVals.length === 1) {
            where.yearOfStudy = yearVals[0];
        }
        if (semVals.length > 1) {
            where.semester = In(semVals);
        } else if (semVals.length === 1) {
            where.semester = semVals[0];
        }

        const entries = await this.mappingRepo.find({
            where,
            relations: ['subject'],
        });
        if (entries.length === 0) {
            throw AppError.badRequest('Subject mapping not found for the selected academic scope');
        }
        return entries;
    }
    async getMappedSubjectsForExam(params) {
        const entries = await this.getMappedSubjectEntriesForExam(params);
        const byId = new Map();
        for (const entry of entries) {
            if (entry.subject)
                byId.set(entry.subject.id, entry.subject);
        }
        return Array.from(byId.values());
    }
}
module.exports = { SubjectsService };
