'use strict';

const { In } = require('typeorm');
const { AppError } = require('../common/errors');
const { SdmsCollege } = require('./entities/college.entity');
const { SdmsCourse } = require('./entities/course.entity');
const { SdmsCourseBranch } = require('./entities/course-branch.entity');
const { SdmsAcademicYear } = require('./entities/academic-year.entity');
const { SdmsBranchAcademicYear } = require('./entities/branch-academic-year.entity');
const { SdmsSemester } = require('./entities/semester.entity');
const { SdmsStudent } = require('./entities/student.entity');
const { SdmsStudentSection } = require('./entities/student-section.entity');
const { SdmsStudentCredentials } = require('./entities/student-credentials.entity');
const { SdmsEvent } = require('./entities/event.entity');

function pad2(value) {
    return String(value).padStart(2, '0');
}

function toDateOnly(value) {
    if (!value)
        return null;
    if (typeof value === 'string') {
        const plain = value.match(/^\d{4}-\d{2}-\d{2}/);
        if (plain)
            return plain[0];
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime()))
        return null;
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

class SdmsService {
    constructor(collegeRepo, courseRepo, branchRepo, academicYearRepo, branchAcademicYearRepo, semesterRepo, studentRepo, studentSectionRepo, credentialsRepo, dataSource) {
        this.collegeRepo = collegeRepo;
        this.courseRepo = courseRepo;
        this.branchRepo = branchRepo;
        this.academicYearRepo = academicYearRepo;
        this.branchAcademicYearRepo = branchAcademicYearRepo;
        this.semesterRepo = semesterRepo;
        this.studentRepo = studentRepo;
        this.studentSectionRepo = studentSectionRepo;
        this.credentialsRepo = credentialsRepo;
        this.dataSource = dataSource;
        this.studentPhotoColumn = undefined;
    }
    async getStatus() {
        await this.dataSource.query('SELECT 1');
        return {
            connected: true,
            database: this.dataSource.options.database,
            readOnly: true,
        };
    }
    listColleges(activeOnly = true) {
        const where = activeOnly ? { isActive: true } : {};
        return this.collegeRepo.find({
            where,
            order: { name: 'ASC' },
            select: ['id', 'name', 'code', 'isActive'],
        });
    }
    async getCollege(id) {
        const college = await this.collegeRepo.findOne({
            where: { id },
            select: ['id', 'name', 'code', 'isActive'],
        });
        if (!college)
            throw AppError.notFound('College not found');
        return college;
    }
    listCourses(collegeId, activeOnly = true) {
        const where = { collegeId };
        if (activeOnly)
            where.isActive = true;
        return this.courseRepo.find({
            where,
            order: { name: 'ASC' },
            select: [
                'id',
                'collegeId',
                'name',
                'code',
                'level',
                'totalYears',
                'semestersPerYear',
                'isActive',
            ],
        });
    }
    async getCourse(id) {
        const course = await this.courseRepo.findOne({
            where: { id },
            relations: ['college'],
            select: {
                id: true,
                collegeId: true,
                name: true,
                code: true,
                level: true,
                totalYears: true,
                semestersPerYear: true,
                yearSemesterConfig: true,
                isActive: true,
                college: { id: true, name: true, code: true },
            },
        });
        if (!course)
            throw AppError.notFound('Course not found');
        return course;
    }
    listBranches(courseId, activeOnly = true) {
        const where = { courseId };
        if (activeOnly)
            where.isActive = true;
        return this.branchRepo.find({
            where,
            order: { name: 'ASC' },
            select: ['id', 'courseId', 'name', 'code', 'isActive'],
        });
    }
    async getBranch(id) {
        const branch = await this.branchRepo.findOne({
            where: { id },
            relations: ['course', 'course.college'],
            select: {
                id: true,
                courseId: true,
                name: true,
                code: true,
                totalYears: true,
                semestersPerYear: true,
                yearSemesterConfig: true,
                metadata: true,
                isActive: true,
                course: {
                    id: true,
                    name: true,
                    code: true,
                    collegeId: true,
                    totalYears: true,
                    semestersPerYear: true,
                    yearSemesterConfig: true,
                    college: { id: true, name: true, code: true },
                },
            },
        });
        if (!branch)
            throw AppError.notFound('Branch not found');
        return branch;
    }
    async getBranchYearSemesters(branchId) {
        const branch = await this.getBranch(branchId);
        const course = branch.course;
        const metadata = branch.metadata;
        const config = this.normalizeYearSemesterConfig(branch.yearSemesterConfig) ??
            this.normalizeYearSemesterConfig(course.yearSemesterConfig);
        const semestersPerYear = branch.semestersPerYear ?? course.semestersPerYear ?? 2;
        const maxYear = this.resolveMaxProgramYear(branch.totalYears, course.totalYears, config, metadata);
        const additionalYear = metadata?.hasAdditionalYear && metadata.additionalYear
            ? Number(metadata.additionalYear)
            : null;
        const years = Array.from({ length: maxYear }, (_, index) => {
            const year = index + 1;
            const isAdditional = additionalYear === year;
            const configured = config?.find((item) => item.year === year);
            const semesterCount = configured?.semesters ??
                (isAdditional ? metadata?.additionalYearSemesters : undefined) ??
                semestersPerYear;
            return {
                yearOfStudy: year,
                isAdditional,
                label: isAdditional
                    ? `Year ${year} (optional / additional)`
                    : `Year ${year}`,
                semesters: Array.from({ length: semesterCount }, (_, semIndex) => ({
                    semesterNumber: semIndex + 1,
                    label: `Sem ${semIndex + 1}`,
                })),
            };
        });
        const sectionItems = (metadata?.sections?.items ?? [])
            .filter((item) => !!item.name)
            .map((item) => ({
            name: item.name,
            strength: item.strength,
        }));
        const sectionsEnabled = metadata?.sections?.enabled === true;
        const hasSections = sectionsEnabled && sectionItems.length > 0;
        return {
            branch: {
                id: branch.id,
                name: branch.name,
                code: branch.code,
                courseId: branch.courseId,
            },
            course: {
                id: course.id,
                name: course.name,
                code: course.code,
            },
            years,
            additionalYear,
            hasAdditionalYear: !!additionalYear,
            sections: {
                enabled: hasSections,
                items: hasSections ? sectionItems : [],
            },
        };
    }
    normalizeYearSemesterConfig(value) {
        if (!Array.isArray(value) || value.length === 0)
            return null;
        const normalized = value
            .map((item) => ({
            year: Number(item.year),
            semesters: Number(item.semesters),
        }))
            .filter((item) => Number.isInteger(item.year) &&
            item.year > 0 &&
            Number.isInteger(item.semesters) &&
            item.semesters > 0);
        return normalized.length > 0 ? normalized : null;
    }
    resolveMaxProgramYear(branchYears, courseYears, config, metadata) {
        const configuredMax = config?.length
            ? Math.max(...config.map((item) => item.year))
            : undefined;
        const additionalYear = metadata?.hasAdditionalYear && metadata.additionalYear
            ? Number(metadata.additionalYear)
            : undefined;
        return Math.max(configuredMax ?? 0, additionalYear ?? 0, branchYears ?? 0, courseYears ?? 0, 4);
    }
    listAcademicYears(activeOnly = true) {
        const where = activeOnly ? { isActive: true } : {};
        return this.academicYearRepo.find({
            where,
            order: { yearLabel: 'DESC' },
            select: ['id', 'yearLabel', 'startDate', 'endDate', 'isActive'],
        });
    }
    async listBranchAcademicYears(branchId) {
        await this.getBranch(branchId);
        const links = await this.branchAcademicYearRepo.find({
            where: { branchId },
            relations: ['academicYear'],
            order: { academicYear: { yearLabel: 'DESC' } },
        });
        return links.map((link) => link.academicYear);
    }
    async listBatches(filters = {}) {
        const scope = await this.resolveScopeNames(filters);
        const studentQb = this.studentRepo
            .createQueryBuilder('s')
            .select('DISTINCT s.batch', 'batch')
            .where("s.batch IS NOT NULL AND s.batch != ''");
        if (scope.collegeName) {
            studentQb.andWhere('s.college = :college', { college: scope.collegeName });
        }
        if (scope.courseName) {
            studentQb.andWhere('s.course = :course', { course: scope.courseName });
        }
        if (scope.branchName) {
            studentQb.andWhere('s.branch = :branch', { branch: scope.branchName });
        }
        const semesterQb = this.semesterRepo
            .createQueryBuilder('sem')
            .select('DISTINCT sem.batch', 'batch')
            .where("sem.batch IS NOT NULL AND sem.batch != ''");
        if (scope.collegeId) {
            semesterQb.andWhere('sem.college_id = :collegeId', {
                collegeId: scope.collegeId,
            });
        }
        if (scope.courseId) {
            semesterQb.andWhere('sem.course_id = :courseId', {
                courseId: scope.courseId,
            });
        }
        const [studentRows, semesterRows] = await Promise.all([
            studentQb.orderBy('batch', 'DESC').getRawMany(),
            semesterQb.orderBy('batch', 'DESC').getRawMany(),
        ]);
        const batches = new Set();
        for (const row of [...studentRows, ...semesterRows]) {
            if (row.batch)
                batches.add(row.batch);
        }
        return Array.from(batches).sort((a, b) => b.localeCompare(a));
    }
    async listBranchSections(branchId, batch) {
        const branch = await this.getBranch(branchId);
        const sections = new Map();
        const metadata = branch.metadata;
        if (metadata?.sections?.items) {
            for (const item of metadata.sections.items) {
                if (item.name) {
                    sections.set(item.name, {
                        name: item.name,
                        strength: item.strength,
                        source: 'metadata',
                    });
                }
            }
        }
        const assignedQb = this.studentSectionRepo
            .createQueryBuilder('ss')
            .select('DISTINCT ss.section_name', 'sectionName')
            .where('ss.branch_id = :branchId', { branchId });
        if (batch) {
            assignedQb.andWhere('ss.batch = :batch', { batch });
        }
        const assigned = await assignedQb.getRawMany();
        for (const row of assigned) {
            if (row.sectionName && !sections.has(row.sectionName)) {
                sections.set(row.sectionName, {
                    name: row.sectionName,
                    source: 'assigned',
                });
            }
        }
        return Array.from(sections.values()).sort((a, b) => a.name.localeCompare(b.name));
    }
    async listSemesters(filters) {
        const where = {};
        if (filters.collegeId)
            where.collegeId = filters.collegeId;
        if (filters.courseId)
            where.courseId = filters.courseId;
        if (filters.academicYearId)
            where.academicYearId = filters.academicYearId;
        if (filters.batch)
            where.batch = filters.batch;
        if (filters.yearOfStudy)
            where.yearOfStudy = filters.yearOfStudy;
        return this.semesterRepo.find({
            where,
            order: { yearOfStudy: 'ASC', semesterNumber: 'ASC' },
        });
    }
    async listStudentSections(filters = {}) {
        const qb = this.studentSectionRepo
            .createQueryBuilder('ss')
            .leftJoinAndSelect('ss.student', 'student')
            .leftJoinAndSelect('ss.branch', 'branch')
            .orderBy('ss.batch', 'DESC')
            .addOrderBy('ss.section_name', 'ASC');
        if (filters.branchId) {
            qb.andWhere('ss.branch_id = :branchId', { branchId: filters.branchId });
        }
        if (filters.batch) {
            qb.andWhere('ss.batch = :batch', { batch: filters.batch });
        }
        if (filters.sectionName) {
            qb.andWhere('ss.section_name = :sectionName', {
                sectionName: filters.sectionName,
            });
        }
        const rows = await qb.getMany();
        return rows.map((row) => ({
            id: row.id,
            studentId: row.studentId,
            branchId: row.branchId,
            batch: row.batch,
            sectionName: row.sectionName,
            isManual: row.isManual === 1,
            student: row.student
                ? {
                    id: row.student.id,
                    studentName: row.student.studentName,
                    admissionNumber: row.student.admissionNumber,
                    pinNo: row.student.pinNo,
                    college: row.student.college,
                    course: row.student.course,
                    branch: row.student.branch,
                }
                : null,
            branch: row.branch
                ? { id: row.branch.id, name: row.branch.name, code: row.branch.code }
                : null,
        }));
    }
    async listStudents(filters = {}) {
        const page = Math.max(filters.page ?? 1, 1);
        const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
        const skip = (page - 1) * limit;
        const qb = this.studentRepo
            .createQueryBuilder('s')
            .select([
            's.id',
            's.studentName',
            's.admissionNumber',
            's.pinNo',
            's.college',
            's.course',
            's.branch',
            's.batch',
            's.section',
            's.currentYear',
            's.currentSemester',
            's.studentStatus',
            's.studentMobile',
            's.preferredMobileNumber',
            's.email',
        ])
            .orderBy('s.student_name', 'ASC');
        if (Array.isArray(filters.colleges) && filters.colleges.length > 0) {
            qb.andWhere('s.college IN (:...sdmsColleges)', { sdmsColleges: filters.colleges });
        } else if (filters.college) {
            if (Array.isArray(filters.college)) {
                qb.andWhere('s.college IN (:...sdmsColleges)', { sdmsColleges: filters.college });
            } else {
                qb.andWhere('s.college = :college', { college: filters.college });
            }
        }
        if (Array.isArray(filters.courses) && filters.courses.length > 0) {
            qb.andWhere('s.course IN (:...sdmsCourses)', { sdmsCourses: filters.courses });
        } else if (filters.course) {
            if (Array.isArray(filters.course)) {
                qb.andWhere('s.course IN (:...sdmsCourses)', { sdmsCourses: filters.course });
            } else {
                qb.andWhere('s.course = :course', { course: filters.course });
            }
        }
        if (Array.isArray(filters.branches) && filters.branches.length > 0) {
            qb.andWhere('s.branch IN (:...sdmsBranches)', { sdmsBranches: filters.branches });
        } else if (filters.branch) {
            if (Array.isArray(filters.branch)) {
                qb.andWhere('s.branch IN (:...sdmsBranches)', { sdmsBranches: filters.branch });
            } else {
                qb.andWhere('s.branch = :branch', { branch: filters.branch });
            }
        }
        if (filters.batch) {
            qb.andWhere('s.batch = :batch', { batch: filters.batch });
        }
        if (filters.currentYear) {
            qb.andWhere('s.current_year = :currentYear', {
                currentYear: filters.currentYear,
            });
        }
        if (filters.currentSemester) {
            qb.andWhere('s.current_semester = :currentSemester', {
                currentSemester: filters.currentSemester,
            });
        }
        if (filters.section) {
            qb.andWhere('s.section = :section', { section: filters.section });
        }
        if (filters.admissionNumber) {
            qb.andWhere('s.admission_number LIKE :admissionNumber', {
                admissionNumber: `%${filters.admissionNumber}%`,
            });
        }
        if (filters.pinNo) {
            qb.andWhere('s.pin_no LIKE :pinNo', { pinNo: `%${filters.pinNo}%` });
        }
        if (filters.search) {
            qb.andWhere('(s.student_name LIKE :search OR s.pin_no LIKE :search OR s.admission_number LIKE :search)', { search: `%${filters.search}%` });
        }
        const [items, total] = await qb.skip(skip).take(limit).getManyAndCount();
        return {
            items,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit) || 1,
        };
    }
    async findStudentByPin(pinNo) {
        const pin = pinNo.trim();
        if (!pin)
            return null;
        return this.studentRepo.findOne({
            where: { pinNo: pin },
            select: {
                id: true,
                studentName: true,
                admissionNumber: true,
                pinNo: true,
                college: true,
                course: true,
                branch: true,
                batch: true,
                section: true,
                currentYear: true,
                currentSemester: true,
                studentStatus: true,
                studentMobile: true,
                preferredMobileNumber: true,
                email: true,
            },
        });
    }
    resolveStudentContact(student) {
        const raw = student.preferredMobileNumber?.trim() ||
            student.studentMobile?.trim() ||
            '';
        if (!raw)
            return null;
        const digits = raw.replace(/\D/g, '');
        if (digits.length >= 10)
            return digits.slice(-10);
        return null;
    }
    async findStudentCredentials(loginId) {
        const id = loginId.trim();
        if (!id)
            return null;
        let credentials = await this.credentialsRepo
            .createQueryBuilder('c')
            .where('LOWER(c.username) = LOWER(:id)', { id })
            .orWhere('LOWER(c.admissionNumber) = LOWER(:id)', { id })
            .getOne();
        let student = null;
        if (credentials) {
            student = await this.studentRepo.findOne({
                where: { id: credentials.studentId },
                select: {
                    id: true,
                    studentName: true,
                    admissionNumber: true,
                    pinNo: true,
                    college: true,
                    course: true,
                    branch: true,
                    batch: true,
                    section: true,
                    currentYear: true,
                    currentSemester: true,
                    studentStatus: true,
                    studentMobile: true,
                    preferredMobileNumber: true,
                    email: true,
                },
            });
        }
        else {
            const byPin = await this.findStudentByPin(id);
            if (byPin) {
                student = byPin;
            }
            else {
                const result = await this.listStudents({ pinNo: id, limit: 20 });
                const found = result.items.find((s) => s.pinNo?.toLowerCase() === id.toLowerCase()) ?? null;
                if (found) {
                    student = {
                        id: found.id,
                        studentName: found.studentName,
                        admissionNumber: found.admissionNumber,
                        pinNo: found.pinNo,
                        college: found.college,
                        course: found.course,
                        branch: found.branch,
                        batch: found.batch,
                        section: found.section,
                        currentYear: found.currentYear,
                        currentSemester: found.currentSemester,
                        studentStatus: found.studentStatus,
                        studentMobile: found.studentMobile ?? null,
                        preferredMobileNumber: found.preferredMobileNumber ?? null,
                        email: found.email ?? null,
                    };
                }
            }
            if (!student)
                return null;
            credentials = await this.credentialsRepo.findOne({
                where: { studentId: student.id },
            });
        }
        if (!credentials?.passwordHash || !student)
            return null;
        return { credentials, student };
    }
    async getStudent(id) {
        const student = await this.studentRepo.findOne({
            where: { id },
            relations: ['studentSection', 'studentSection.branch'],
            select: {
                id: true,
                studentName: true,
                admissionNumber: true,
                pinNo: true,
                college: true,
                course: true,
                branch: true,
                batch: true,
                section: true,
                currentYear: true,
                currentSemester: true,
                studentStatus: true,
                studentSection: {
                    id: true,
                    branchId: true,
                    batch: true,
                    sectionName: true,
                    isManual: true,
                    branch: { id: true, name: true, code: true },
                },
            },
        });
        if (!student)
            throw AppError.notFound('Student not found');
        student.photoUrl = await this.getStudentPhotoUrl(id);
        return student;
    }
    async getStudentPhotoUrl(id) {
        if (this.studentPhotoColumn === undefined) {
            try {
                const columns = await this.dataSource.query('SHOW COLUMNS FROM students');
                const names = new Map(columns.map((column) => [String(column.Field).toLowerCase(), column.Field]));
                const candidates = ['photo_url', 'photo', 'image_url', 'image', 'student_photo', 'profile_photo'];
                this.studentPhotoColumn = candidates.find((name) => names.has(name))
                    ? names.get(candidates.find((name) => names.has(name)))
                    : null;
            }
            catch {
                this.studentPhotoColumn = null;
            }
        }
        if (!this.studentPhotoColumn)
            return null;
        const column = String(this.studentPhotoColumn).replace(/`/g, '``');
        try {
            const rows = await this.dataSource.query(`SELECT \`${column}\` AS photoUrl FROM students WHERE id = ? LIMIT 1`, [id]);
            return rows[0]?.photoUrl || null;
        }
        catch {
            return null;
        }
    }
    async getBatchScopeInsight(params) {
        const course = await this.getCourse(params.courseId);
        const college = course.college ?? (await this.getCollege(params.collegeId));
        const collegeName = college.name;
        const courseName = course.name;
        const totalStudents = await this.studentRepo.count({
            where: { college: collegeName, course: courseName, batch: params.batch },
        });
        const yearSemesterRows = await this.studentRepo
            .createQueryBuilder('s')
            .select('s.current_year', 'yearOfStudy')
            .addSelect('s.current_semester', 'semesterNumber')
            .addSelect('COUNT(*)', 'studentCount')
            .where('s.college = :college', { college: collegeName })
            .andWhere('s.course = :course', { course: courseName })
            .andWhere('s.batch = :batch', { batch: params.batch })
            .groupBy('s.current_year')
            .addGroupBy('s.current_semester')
            .orderBy('s.current_year', 'ASC')
            .addOrderBy('s.current_semester', 'ASC')
            .getRawMany();
        const statusRows = await this.studentRepo
            .createQueryBuilder('s')
            .select('s.current_year', 'yearOfStudy')
            .addSelect('s.current_semester', 'semesterNumber')
            .addSelect('COALESCE(NULLIF(TRIM(s.student_status), ""), "Unknown")', 'status')
            .addSelect('COUNT(*)', 'studentCount')
            .where('s.college = :college', { college: collegeName })
            .andWhere('s.course = :course', { course: courseName })
            .andWhere('s.batch = :batch', { batch: params.batch })
            .groupBy('s.current_year')
            .addGroupBy('s.current_semester')
            .addGroupBy('COALESCE(NULLIF(TRIM(s.student_status), ""), "Unknown")')
            .orderBy('s.current_year', 'ASC')
            .addOrderBy('s.current_semester', 'ASC')
            .addOrderBy('status', 'ASC')
            .getRawMany();
        const statusTotalsMap = new Map();
        const yearSemMap = new Map();
        for (const row of statusRows) {
            const count = Number(row.studentCount);
            const status = row.status || 'Unknown';
            statusTotalsMap.set(status, (statusTotalsMap.get(status) ?? 0) + count);
            const key = `${row.yearOfStudy}:${row.semesterNumber}`;
            if (!yearSemMap.has(key)) {
                yearSemMap.set(key, {
                    yearOfStudy: Number(row.yearOfStudy),
                    semesterNumber: Number(row.semesterNumber),
                    byStatus: [],
                });
            }
            yearSemMap.get(key).byStatus.push({ status, studentCount: count });
        }
        const yearSemesterStatusBreakdown = Array.from(yearSemMap.values())
            .map((entry) => ({
            ...entry,
            totalStudents: entry.byStatus.reduce((sum, s) => sum + s.studentCount, 0),
            byStatus: entry.byStatus.sort((a, b) => b.studentCount - a.studentCount),
        }))
            .sort((a, b) => a.yearOfStudy !== b.yearOfStudy
            ? a.yearOfStudy - b.yearOfStudy
            : a.semesterNumber - b.semesterNumber);
        const statusTotals = Array.from(statusTotalsMap.entries())
            .map(([status, studentCount]) => ({ status, studentCount }))
            .sort((a, b) => b.studentCount - a.studentCount);
        const sectionRows = await this.studentRepo
            .createQueryBuilder('s')
            .select('COALESCE(NULLIF(s.section, ""), "Unassigned")', 'section')
            .addSelect('COUNT(*)', 'studentCount')
            .where('s.college = :college', { college: collegeName })
            .andWhere('s.course = :course', { course: courseName })
            .andWhere('s.batch = :batch', { batch: params.batch })
            .groupBy('s.section')
            .orderBy('studentCount', 'DESC')
            .getRawMany();
        const branchRows = await this.studentRepo
            .createQueryBuilder('s')
            .select('s.branch', 'branch')
            .addSelect('COUNT(*)', 'studentCount')
            .where('s.college = :college', { college: collegeName })
            .andWhere('s.course = :course', { course: courseName })
            .andWhere('s.batch = :batch', { batch: params.batch })
            .andWhere('s.branch IS NOT NULL AND s.branch != ""')
            .groupBy('s.branch')
            .orderBy('studentCount', 'DESC')
            .getRawMany();
        const calendarSemesters = await this.semesterRepo.find({
            where: { courseId: params.courseId, batch: params.batch },
            order: { yearOfStudy: 'ASC', semesterNumber: 'ASC' },
        });
        const academicYearIds = [
            ...new Set(calendarSemesters.map((s) => s.academicYearId)),
        ];
        const academicYears = academicYearIds.length > 0
            ? await this.academicYearRepo.find({
                where: { id: In(academicYearIds) },
            })
            : [];
        const yearMap = new Map(academicYears.map((y) => [y.id, y.yearLabel]));
        return {
            college: { id: college.id, name: collegeName, code: college.code },
            course: { id: course.id, name: courseName, code: course.code },
            batch: params.batch,
            totalStudents,
            yearSemesterBreakdown: yearSemesterRows.map((row) => ({
                yearOfStudy: Number(row.yearOfStudy),
                semesterNumber: Number(row.semesterNumber),
                studentCount: Number(row.studentCount),
            })),
            yearSemesterStatusBreakdown,
            statusTotals,
            sectionBreakdown: sectionRows.map((row) => ({
                section: row.section,
                studentCount: Number(row.studentCount),
            })),
            branchBreakdown: branchRows.map((row) => ({
                branch: row.branch,
                studentCount: Number(row.studentCount),
            })),
            calendarSemesters: calendarSemesters.map((sem) => ({
                id: sem.id,
                yearOfStudy: sem.yearOfStudy,
                semesterNumber: sem.semesterNumber,
                academicYearLabel: yearMap.get(sem.academicYearId) ?? null,
                startDate: sem.startDate,
                endDate: sem.endDate,
            })),
        };
    }
    async resolveScopeNames(filters) {
        let collegeId = filters.collegeId;
        let courseId = filters.courseId;
        let collegeName;
        let courseName;
        let branchName;
        if (filters.branchId) {
            const branch = await this.getBranch(filters.branchId);
            branchName = branch.name;
            courseId = branch.courseId;
            courseName = branch.course.name;
            collegeId = branch.course.collegeId ?? undefined;
            collegeName = branch.course.college?.name;
        }
        else if (filters.courseId) {
            const course = await this.getCourse(filters.courseId);
            courseName = course.name;
            collegeId = course.collegeId ?? undefined;
            collegeName = course.college?.name;
        }
        else if (filters.collegeId) {
            const college = await this.getCollege(filters.collegeId);
            collegeName = college.name;
        }
        return { collegeId, courseId, collegeName, courseName, branchName };
    }

    async listEvents(filters = {}) {
        const eventRepo = this.dataSource.getRepository(SdmsEvent);
        const from = filters.from ? new Date(String(filters.from)) : null;
        const to = filters.to ? new Date(String(filters.to)) : null;

        // If the client didn't specify a range, default to a broad 1-month window around now.
        const now = new Date();
        const fromDate = from ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const toDate = to ?? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        const fromDateStr = toDateOnly(fromDate);
        const toDateStr = toDateOnly(toDate);

        const qb = eventRepo.createQueryBuilder('e')
            .select('e.id', 'id')
            .addSelect('e.title', 'title')
            .addSelect('e.description', 'description')
            .addSelect('e.event_date', 'event_date')
            .addSelect('e.end_date', 'end_date')
            .addSelect('e.start_time', 'start_time')
            .addSelect('e.end_time', 'end_time')
            .addSelect('e.event_type', 'event_type')
            .addSelect('e.created_by', 'created_by')
            .addSelect('e.target_college', 'target_college')
            .addSelect('e.target_course', 'target_course')
            .addSelect('e.target_branch', 'target_branch')
            .addSelect('e.target_batch', 'target_batch')
            .addSelect('e.target_year', 'target_year')
            .addSelect('e.target_semester', 'target_semester')
            .addSelect('e.is_active', 'is_active')
            .addSelect('e.created_at', 'created_at')
            .addSelect('e.updated_at', 'updated_at')
            .where('e.is_active = 1')
            .andWhere('e.event_date <= :toDate', { toDate: toDateStr })
            // Spanning events: included if end_date is NULL (open-ended) OR >= fromDate
            .andWhere('(e.end_date IS NULL OR e.end_date >= :fromDate)', { fromDate: fromDateStr })
            .orderBy('e.event_date', 'ASC')
            .addOrderBy('e.id', 'ASC');

        if (filters.targetCollege) qb.andWhere('e.target_college = :v', { v: String(filters.targetCollege) });
        if (filters.targetCourse) qb.andWhere('e.target_course = :v', { v: String(filters.targetCourse) });
        if (filters.targetBranch) qb.andWhere('e.target_branch = :v', { v: String(filters.targetBranch) });
        if (filters.targetBatch) qb.andWhere('e.target_batch = :v', { v: String(filters.targetBatch) });
        if (filters.targetYear) qb.andWhere('e.target_year = :v', { v: String(filters.targetYear) });
        if (filters.targetSemester) qb.andWhere('e.target_semester = :v', { v: String(filters.targetSemester) });

        const rows = await qb.getRawMany();
        return rows.map((r) => ({
            id: Number(r.id),
            title: r.title,
            description: r.description,
            eventDate: toDateOnly(r.event_date),
            endDate: toDateOnly(r.end_date),
            startTime: r.start_time,
            endTime: r.end_time,
            eventType: r.event_type,
            createdBy: r.created_by != null ? Number(r.created_by) : null,
            targetCollege: r.target_college,
            targetCourse: r.target_course,
            targetBranch: r.target_branch,
            targetBatch: r.target_batch,
            targetYear: r.target_year,
            targetSemester: r.target_semester,
            isActive: Number(r.is_active) === 1,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
        }));
    }

    async createOrReplaceExamEventsForPublishedExam(exam, actor = {}) {
        const eventRepo = this.dataSource.getRepository(SdmsEvent);
        const examId = Number(exam.id);
        if (!examId) throw AppError.badRequest('Invalid exam id for SDMS event creation');

        const marker = `[ems_exam_id:${examId}]`;
        const descriptionBase = (suffix) => `${marker} ${suffix}`;

        // De-duplicate: delete all previously created events for this exam ID or exam name
        const deleteResult = await eventRepo.createQueryBuilder()
            .delete()
            .where('description LIKE :p', { p: `%${marker}%` })
            .orWhere('title LIKE :nameP', { nameP: `%${exam.name}%` })
            .execute();

        if (exam.status !== 'published') {
            return {
                deleted: deleteResult?.affectedRows ?? null,
                created: 0,
            };
        }

        const scopes = (exam.scopes && exam.scopes.length > 0)
            ? exam.scopes
            : [
                {
                    college: exam.college,
                    course: exam.course,
                    branch: exam.branch,
                    batch: exam.batch,
                    yearOfStudy: exam.yearOfStudy,
                    semester: exam.semester,
                    section: exam.section ?? null,
                },
            ];

        // Combine scope attributes into clean summary strings to prevent scope repetition
        const colleges = [...new Set(scopes.map((s) => s.college ?? exam.college).filter(Boolean))];
        const courses = [...new Set(scopes.map((s) => s.course ?? exam.course).filter(Boolean))];
        const branches = [...new Set(scopes.map((s) => s.branch ?? exam.branch).filter(Boolean))];
        const batches = [...new Set(scopes.map((s) => s.batch ?? exam.batch).filter(Boolean))];

        const targetCollege = colleges.join(', ') || null;
        const targetCourse = courses.join(', ') || null;
        const targetBranch = branches.join(', ') || null;
        const targetBatch = batches.join(', ') || null;
        const targetYear = exam.yearOfStudy != null ? String(exam.yearOfStudy) : null;
        const targetSemester = exam.semester != null ? String(exam.semester) : null;

        const createdBy = actor?.id ? Number(actor.id) : null;
        const createdAt = new Date();

        const saveEvent = (payload) => eventRepo.save(eventRepo.create({
            ...payload,
            createdBy,
            isActive: 1,
            createdAt,
            updatedAt: createdAt,
        }));

        const events = [];

        // 1) Application Start & Application Close milestones
        if (exam.applicationStartDate) {
            const startDateStr = toDateOnly(exam.applicationStartDate);
            const endDateStr = exam.applicationEndDate ? toDateOnly(exam.applicationEndDate) : null;
            const desc = endDateStr
                ? `Exam application opens on ${startDateStr}. Application window ends on ${endDateStr}.`
                : `Exam application opens on ${startDateStr}.`;

            events.push(
                await saveEvent({
                    title: `Application Open: ${exam.name}`,
                    description: descriptionBase(desc),
                    eventDate: startDateStr,
                    endDate: startDateStr,
                    eventType: 'exam',
                    targetCollege,
                    targetCourse,
                    targetBranch,
                    targetBatch,
                    targetYear,
                    targetSemester,
                    startTime: null,
                    endTime: null,
                }),
            );
        }

        if (exam.applicationEndDate && toDateOnly(exam.applicationEndDate) !== toDateOnly(exam.applicationStartDate)) {
            const startDateStr = exam.applicationStartDate ? toDateOnly(exam.applicationStartDate) : null;
            const endDateStr = toDateOnly(exam.applicationEndDate);
            const desc = startDateStr
                ? `Exam application closes on ${endDateStr} (Last Date). Application window started on ${startDateStr}.`
                : `Exam application closes on ${endDateStr} (Last Date).`;

            events.push(
                await saveEvent({
                    title: `Application Closing: ${exam.name}`,
                    description: descriptionBase(desc),
                    eventDate: endDateStr,
                    endDate: endDateStr,
                    eventType: 'exam',
                    targetCollege,
                    targetCourse,
                    targetBranch,
                    targetBatch,
                    targetYear,
                    targetSemester,
                    startTime: null,
                    endTime: null,
                }),
            );
        }

        // 2) Late fee slabs
        const slabs = Array.isArray(exam.lateFeeSlabs) ? exam.lateFeeSlabs : [];
        for (let i = 0; i < slabs.length; i++) {
            const slab = slabs[i];
            if (!slab?.fromDate) continue;
            const slabDateStr = toDateOnly(slab.fromDate);
            events.push(
                await saveEvent({
                    title: `Late Fee Slab ${i + 1} (${slab.amount ?? '—'}): ${exam.name}`,
                    description: descriptionBase(`Late fee slab amount=${slab.amount ?? null}`),
                    eventDate: slabDateStr,
                    endDate: slabDateStr,
                    eventType: 'exam',
                    targetCollege,
                    targetCourse,
                    targetBranch,
                    targetBatch,
                    targetYear,
                    targetSemester,
                    startTime: null,
                    endTime: null,
                }),
            );
        }

        // 3) Examination Start & Examination End milestones
        if (exam.examinationStartDate) {
            const examStartStr = toDateOnly(exam.examinationStartDate);
            events.push(
                await saveEvent({
                    title: `Examination Start: ${exam.name}`,
                    description: descriptionBase('Examination start date'),
                    eventDate: examStartStr,
                    endDate: examStartStr,
                    eventType: 'exam',
                    targetCollege,
                    targetCourse,
                    targetBranch,
                    targetBatch,
                    targetYear,
                    targetSemester,
                    startTime: null,
                    endTime: null,
                }),
            );
        }

        if (exam.examinationEndDate && toDateOnly(exam.examinationEndDate) !== toDateOnly(exam.examinationStartDate)) {
            const examEndStr = toDateOnly(exam.examinationEndDate);
            events.push(
                await saveEvent({
                    title: `Examination End: ${exam.name}`,
                    description: descriptionBase('Examination end date'),
                    eventDate: examEndStr,
                    endDate: examEndStr,
                    eventType: 'exam',
                    targetCollege,
                    targetCourse,
                    targetBranch,
                    targetBatch,
                    targetYear,
                    targetSemester,
                    startTime: null,
                    endTime: null,
                }),
            );
        }

        // 4) Individual Subject Exam Timetable (Deduplicated)
        const examSubjects = Array.isArray(exam.examSubjects) ? exam.examSubjects : [];
        const processedPapers = new Set();

        for (const es of examSubjects) {
            if (!es.examDate) continue;
            const dateStr = toDateOnly(es.examDate);
            const paperKey = `${es.subjectId}:${dateStr}:${es.session ?? ''}:${es.branch ?? ''}`;
            if (processedPapers.has(paperKey)) continue;
            processedPapers.add(paperKey);

            const subjectTitle = es.subject?.code && es.subject?.name
                ? `${es.subject.code} - ${es.subject.name}`
                : es.subject?.name ?? `Subject ${es.subjectId}`;

            events.push(
                await saveEvent({
                    title: `Paper: ${subjectTitle} (${exam.name})`,
                    description: descriptionBase(`Subject exam paper: ${subjectTitle}`),
                    eventDate: dateStr,
                    endDate: dateStr,
                    eventType: 'exam',
                    targetCollege,
                    targetCourse,
                    targetBranch: es.branch ?? targetBranch,
                    targetBatch,
                    targetYear,
                    targetSemester,
                    startTime: es.startTime ?? null,
                    endTime: es.endTime ?? null,
                }),
            );
        }

        return {
            deleted: deleteResult?.affectedRows ?? null,
            created: events.length,
        };
    }
}
function createSdmsService(dataSource) {
    return new SdmsService(dataSource.getRepository(SdmsCollege), dataSource.getRepository(SdmsCourse), dataSource.getRepository(SdmsCourseBranch), dataSource.getRepository(SdmsAcademicYear), dataSource.getRepository(SdmsBranchAcademicYear), dataSource.getRepository(SdmsSemester), dataSource.getRepository(SdmsStudent), dataSource.getRepository(SdmsStudentSection), dataSource.getRepository(SdmsStudentCredentials), dataSource);
}

module.exports = { createSdmsService };
