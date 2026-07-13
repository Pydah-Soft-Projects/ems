import { DataSource, Repository, In } from 'typeorm';
import { AppError } from '../common/errors';
import { SdmsCollege } from './entities/college.entity';
import { SdmsCourse } from './entities/course.entity';
import { SdmsCourseBranch } from './entities/course-branch.entity';
import { SdmsAcademicYear } from './entities/academic-year.entity';
import { SdmsBranchAcademicYear } from './entities/branch-academic-year.entity';
import { SdmsSemester } from './entities/semester.entity';
import { SdmsStudent } from './entities/student.entity';
import { SdmsStudentSection } from './entities/student-section.entity';

export interface SdmsStudentFilters {
  college?: string;
  course?: string;
  branch?: string;
  batch?: string;
  currentYear?: number;
  currentSemester?: number;
  section?: string;
  admissionNumber?: string;
  pinNo?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface SdmsStudentSectionFilters {
  branchId?: number;
  batch?: string;
  sectionName?: string;
}

export interface SdmsBatchFilters {
  collegeId?: number;
  courseId?: number;
  branchId?: number;
}

interface SectionItem {
  name: string;
  strength?: number;
  source: 'metadata' | 'assigned';
}

interface YearSemesterConfig {
  year: number;
  semesters: number;
}

/** Read-only access to student_database (SDMS) */
export class SdmsService {
  constructor(
    private readonly collegeRepo: Repository<SdmsCollege>,
    private readonly courseRepo: Repository<SdmsCourse>,
    private readonly branchRepo: Repository<SdmsCourseBranch>,
    private readonly academicYearRepo: Repository<SdmsAcademicYear>,
    private readonly branchAcademicYearRepo: Repository<SdmsBranchAcademicYear>,
    private readonly semesterRepo: Repository<SdmsSemester>,
    private readonly studentRepo: Repository<SdmsStudent>,
    private readonly studentSectionRepo: Repository<SdmsStudentSection>,
    private readonly dataSource: DataSource,
  ) {}

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

  async getCollege(id: number) {
    const college = await this.collegeRepo.findOne({
      where: { id },
      select: ['id', 'name', 'code', 'isActive'],
    });
    if (!college) throw AppError.notFound('College not found');
    return college;
  }

  listCourses(collegeId: number, activeOnly = true) {
    const where: Record<string, unknown> = { collegeId };
    if (activeOnly) where.isActive = true;
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

  async getCourse(id: number) {
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
    if (!course) throw AppError.notFound('Course not found');
    return course;
  }

  listBranches(courseId: number, activeOnly = true) {
    const where: Record<string, unknown> = { courseId };
    if (activeOnly) where.isActive = true;
    return this.branchRepo.find({
      where,
      order: { name: 'ASC' },
      select: ['id', 'courseId', 'name', 'code', 'isActive'],
    });
  }

  async getBranch(id: number) {
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
    if (!branch) throw AppError.notFound('Branch not found');
    return branch;
  }

  async getBranchYearSemesters(branchId: number) {
    const branch = await this.getBranch(branchId);
    const course = branch.course;
    const metadata = branch.metadata as
      | {
          hasAdditionalYear?: boolean;
          additionalYear?: number;
          additionalYearSemesters?: number;
        }
      | null;

    const config =
      this.normalizeYearSemesterConfig(branch.yearSemesterConfig) ??
      this.normalizeYearSemesterConfig(course.yearSemesterConfig);

    const semestersPerYear =
      branch.semestersPerYear ?? course.semestersPerYear ?? 2;

    const maxYear = this.resolveMaxProgramYear(
      branch.totalYears,
      course.totalYears,
      config,
      metadata,
    );

    const years = Array.from({ length: maxYear }, (_, index) => {
      const year = index + 1;
      const configured = config?.find((item) => item.year === year);
      const semesterCount =
        configured?.semesters ??
        (metadata?.hasAdditionalYear && metadata.additionalYear === year
          ? metadata.additionalYearSemesters
          : undefined) ??
        semestersPerYear;

      return {
        yearOfStudy: year,
        semesters: Array.from({ length: semesterCount }, (_, semIndex) => ({
          semesterNumber: semIndex + 1,
          label: `Year ${year} / Sem ${semIndex + 1}`,
        })),
      };
    });

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
    };
  }

  private normalizeYearSemesterConfig(
    value?: YearSemesterConfig[] | null,
  ): YearSemesterConfig[] | null {
    if (!Array.isArray(value) || value.length === 0) return null;
    const normalized = value
      .map((item) => ({
        year: Number(item.year),
        semesters: Number(item.semesters),
      }))
      .filter(
        (item) =>
          Number.isInteger(item.year) &&
          item.year > 0 &&
          Number.isInteger(item.semesters) &&
          item.semesters > 0,
      );
    return normalized.length > 0 ? normalized : null;
  }

  private resolveMaxProgramYear(
    branchYears: number | null,
    courseYears: number | null,
    config: YearSemesterConfig[] | null,
    metadata:
      | {
          hasAdditionalYear?: boolean;
          additionalYear?: number;
        }
      | null,
  ) {
    const configuredMax = config?.length
      ? Math.max(...config.map((item) => item.year))
      : undefined;
    const additionalYear =
      metadata?.hasAdditionalYear && metadata.additionalYear
        ? Number(metadata.additionalYear)
        : undefined;

    return Math.max(
      configuredMax ?? 0,
      additionalYear ?? 0,
      branchYears ?? 0,
      courseYears ?? 0,
      4,
    );
  }

  listAcademicYears(activeOnly = true) {
    const where = activeOnly ? { isActive: true } : {};
    return this.academicYearRepo.find({
      where,
      order: { yearLabel: 'DESC' },
      select: ['id', 'yearLabel', 'startDate', 'endDate', 'isActive'],
    });
  }

  async listBranchAcademicYears(branchId: number) {
    await this.getBranch(branchId);
    const links = await this.branchAcademicYearRepo.find({
      where: { branchId },
      relations: ['academicYear'],
      order: { academicYear: { yearLabel: 'DESC' } },
    });
    return links.map((link) => link.academicYear);
  }

  async listBatches(filters: SdmsBatchFilters = {}) {
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
      studentQb.orderBy('batch', 'DESC').getRawMany<{ batch: string }>(),
      semesterQb.orderBy('batch', 'DESC').getRawMany<{ batch: string }>(),
    ]);

    const batches = new Set<string>();
    for (const row of [...studentRows, ...semesterRows]) {
      if (row.batch) batches.add(row.batch);
    }

    return Array.from(batches).sort((a, b) => b.localeCompare(a));
  }

  async listBranchSections(branchId: number, batch?: string) {
    const branch = await this.getBranch(branchId);
    const sections = new Map<string, SectionItem>();

    const metadata = branch.metadata as {
      sections?: { enabled?: boolean; items?: { name: string; strength?: number }[] };
    } | null;

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

    const assigned = await assignedQb.getRawMany<{ sectionName: string }>();
    for (const row of assigned) {
      if (row.sectionName && !sections.has(row.sectionName)) {
        sections.set(row.sectionName, {
          name: row.sectionName,
          source: 'assigned',
        });
      }
    }

    return Array.from(sections.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  async listSemesters(filters: {
    collegeId?: number;
    courseId?: number;
    academicYearId?: number;
    batch?: string;
    yearOfStudy?: number;
  }) {
    const where: Record<string, unknown> = {};
    if (filters.collegeId) where.collegeId = filters.collegeId;
    if (filters.courseId) where.courseId = filters.courseId;
    if (filters.academicYearId) where.academicYearId = filters.academicYearId;
    if (filters.batch) where.batch = filters.batch;
    if (filters.yearOfStudy) where.yearOfStudy = filters.yearOfStudy;

    return this.semesterRepo.find({
      where,
      order: { yearOfStudy: 'ASC', semesterNumber: 'ASC' },
    });
  }

  async listStudentSections(filters: SdmsStudentSectionFilters = {}) {
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

  async listStudents(filters: SdmsStudentFilters = {}) {
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
      ])
      .orderBy('s.student_name', 'ASC');

    if (filters.college) {
      qb.andWhere('s.college = :college', { college: filters.college });
    }
    if (filters.course) {
      qb.andWhere('s.course = :course', { course: filters.course });
    }
    if (filters.branch) {
      qb.andWhere('s.branch = :branch', { branch: filters.branch });
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
      qb.andWhere(
        '(s.student_name LIKE :search OR s.pin_no LIKE :search OR s.admission_number LIKE :search)',
        { search: `%${filters.search}%` },
      );
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

  async getStudent(id: number) {
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
    if (!student) throw AppError.notFound('Student not found');
    return student;
  }

  async getBatchScopeInsight(params: {
    collegeId: number;
    courseId: number;
    batch: string;
  }) {
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
      .getRawMany<{ yearOfStudy: number; semesterNumber: number; studentCount: string }>();

    const statusRows = await this.studentRepo
      .createQueryBuilder('s')
      .select('s.current_year', 'yearOfStudy')
      .addSelect('s.current_semester', 'semesterNumber')
      .addSelect(
        'COALESCE(NULLIF(TRIM(s.student_status), ""), "Unknown")',
        'status',
      )
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
      .getRawMany<{
        yearOfStudy: number;
        semesterNumber: number;
        status: string;
        studentCount: string;
      }>();

    const statusTotalsMap = new Map<string, number>();
    const yearSemMap = new Map<
      string,
      { yearOfStudy: number; semesterNumber: number; byStatus: { status: string; studentCount: number }[] }
    >();

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
      yearSemMap.get(key)!.byStatus.push({ status, studentCount: count });
    }

    const yearSemesterStatusBreakdown = Array.from(yearSemMap.values())
      .map((entry) => ({
        ...entry,
        totalStudents: entry.byStatus.reduce((sum, s) => sum + s.studentCount, 0),
        byStatus: entry.byStatus.sort((a, b) => b.studentCount - a.studentCount),
      }))
      .sort((a, b) =>
        a.yearOfStudy !== b.yearOfStudy
          ? a.yearOfStudy - b.yearOfStudy
          : a.semesterNumber - b.semesterNumber,
      );

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
      .getRawMany<{ section: string; studentCount: string }>();

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
      .getRawMany<{ branch: string; studentCount: string }>();

    const calendarSemesters = await this.semesterRepo.find({
      where: { courseId: params.courseId, batch: params.batch },
      order: { yearOfStudy: 'ASC', semesterNumber: 'ASC' },
    });

    const academicYearIds = [
      ...new Set(calendarSemesters.map((s) => s.academicYearId)),
    ];
    const academicYears =
      academicYearIds.length > 0
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

  private async resolveScopeNames(filters: SdmsBatchFilters) {
    let collegeId = filters.collegeId;
    let courseId = filters.courseId;
    let collegeName: string | undefined;
    let courseName: string | undefined;
    let branchName: string | undefined;

    if (filters.branchId) {
      const branch = await this.getBranch(filters.branchId);
      branchName = branch.name;
      courseId = branch.courseId;
      courseName = branch.course.name;
      collegeId = branch.course.collegeId ?? undefined;
      collegeName = branch.course.college?.name;
    } else if (filters.courseId) {
      const course = await this.getCourse(filters.courseId);
      courseName = course.name;
      collegeId = course.collegeId ?? undefined;
      collegeName = course.college?.name;
    } else if (filters.collegeId) {
      const college = await this.getCollege(filters.collegeId);
      collegeName = college.name;
    }

    return { collegeId, courseId, collegeName, courseName, branchName };
  }
}

export function createSdmsService(dataSource: DataSource): SdmsService {
  return new SdmsService(
    dataSource.getRepository(SdmsCollege),
    dataSource.getRepository(SdmsCourse),
    dataSource.getRepository(SdmsCourseBranch),
    dataSource.getRepository(SdmsAcademicYear),
    dataSource.getRepository(SdmsBranchAcademicYear),
    dataSource.getRepository(SdmsSemester),
    dataSource.getRepository(SdmsStudent),
    dataSource.getRepository(SdmsStudentSection),
    dataSource,
  );
}
