'use strict';

const { AppError } = require('../common/errors');
const { RegulationStatus } = require('../regulations/schemas/regulation-status.enum');

class RevaluationService {
  constructor(notificationRepo, applicationRepo, regulationRepo, subjectRepo, mappingRepo, feeRecordRepo, sdms) {
    this.notificationRepo = notificationRepo;
    this.applicationRepo = applicationRepo;
    this.regulationRepo = regulationRepo;
    this.subjectRepo = subjectRepo;
    this.mappingRepo = mappingRepo;
    this.feeRecordRepo = feeRecordRepo;
    this.sdms = sdms;
  }

  async findNotification(id) {
    const notification = await this.notificationRepo.findOne({
      where: { id },
      relations: ['regulation'],
    });
    if (!notification) throw AppError.notFound('Revaluation notification not found');
    return notification;
  }

  async findRegulation(id) {
    const regulation = await this.regulationRepo.findOne({
      where: { id, status: RegulationStatus.ACTIVE },
      relations: ['scopes'],
    });
    if (!regulation) throw AppError.notFound('Active regulation not found');
    return regulation;
  }

  async subjectsForScopes(regulationId, scopes, yearSemesters = []) {
    if (!scopes.length) return [];
    const query = this.mappingRepo
      .createQueryBuilder('mapping')
      .innerJoinAndSelect('mapping.subject', 'subject')
      .where('mapping.regulationId = :regulationId', { regulationId })
      .andWhere('subject.status = :status', { status: 'active' })
      .andWhere(
        scopes
          .map((scope, index) =>
            `(mapping.collegeName = :college${index} AND mapping.courseName = :course${index} AND mapping.batch = :batch${index})`,
          )
          .join(' OR '),
        Object.fromEntries(scopes.flatMap((scope, index) => [
          [`college${index}`, scope.collegeName],
          [`course${index}`, scope.courseName],
          [`batch${index}`, scope.batch],
        ])),
      )
      .andWhere(
        yearSemesters.length
          ? `(${yearSemesters.map((item, index) => `(mapping.yearOfStudy = :year${index} AND mapping.semester = :semester${index})`).join(' OR ')})`
          : '1 = 1',
        Object.fromEntries(yearSemesters.flatMap((item, index) => [
          [`year${index}`, item.yearOfStudy],
          [`semester${index}`, item.semester],
        ])),
      )
      .orderBy('mapping.yearOfStudy', 'ASC')
      .addOrderBy('mapping.semester', 'ASC')
      .addOrderBy('subject.code', 'ASC');
    const mappings = await query.getMany();
    const unique = new Map();
    for (const mapping of mappings) {
      const key = `${mapping.subjectId}:${mapping.yearOfStudy}:${mapping.semester}`;
      if (!unique.has(key)) unique.set(key, {
        id: mapping.subjectId,
        code: mapping.subject.code,
        name: mapping.subject.name,
        yearOfStudy: mapping.yearOfStudy,
        semester: mapping.semester,
      });
    }
    return [...unique.values()];
  }

  async subjectsForRegulation(regulationId) {
    return this.subjectRepo.find({ where: { regulationId, status: 'active' }, order: { semester: 'ASC', code: 'ASC' } });
  }

  normalizeScopes(raw, regulation) {
    const valid = new Map(
      (regulation.scopes ?? []).map((scope) => [
        `${scope.collegeName}|${scope.courseName}|${scope.batch}`,
        scope,
      ]),
    );
    const scopes = Array.isArray(raw) ? raw : [];
    const normalized = [];
    for (const value of scopes) {
      const key = `${String(value.collegeName ?? '').trim()}|${String(value.courseName ?? '').trim()}|${String(value.batch ?? '').trim()}`;
      const scope = valid.get(key);
      if (scope && !normalized.some((item) => item.key === key)) {
        normalized.push({
          key,
          collegeName: scope.collegeName,
          courseName: scope.courseName,
          batch: scope.batch,
        });
      }
    }
    return normalized;
  }

  async serialize(notification) {
    const regulation = notification.regulation ?? await this.findRegulation(notification.regulationId);
    const subjects = await this.subjectsForScopes(regulation.id, notification.selectedScopes ?? []);
    return {
      id: notification.id,
      regulationId: regulation.id,
      regulationCode: regulation.code,
      regulationName: regulation.name,
      title: notification.title,
      message: notification.message,
      startDate: notification.startDate,
      endDate: notification.endDate,
      selectedScopes: notification.selectedScopes ?? [],
      selectedYearSemesters: notification.selectedYearSemesters ?? [],
      excludedBatches: notification.excludedBatches ?? [],
      subjectIds: notification.subjectIds ?? [],
      subjects: subjects.filter((subject) => (notification.subjectIds ?? []).map(Number).includes(subject.id)),
      feesByCount: notification.feesByCount ?? [],
      status: notification.status,
      createdAt: notification.createdAt,
      updatedAt: notification.updatedAt,
    };
  }

  async list() {
    const rows = await this.notificationRepo.find({
      relations: ['regulation'],
      order: { createdAt: 'DESC' },
    });
    return Promise.all(rows.map((row) => this.serialize(row)));
  }

  async get(id) {
    return this.serialize(await this.findNotification(id));
  }

  async getMappedSubjects(regulationId, rawScopes, yearSemesters = []) {
    const regulation = await this.findRegulation(regulationId);
    const scopes = this.normalizeScopes(rawScopes, regulation);
    return this.subjectsForScopes(regulation.id, scopes, yearSemesters);
  }

  async save(dto, actor, id) {
    const regulation = await this.findRegulation(Number(dto.regulationId));
    const selectedScopes = this.normalizeScopes(dto.selectedScopes, regulation);
    if (!selectedScopes.length) throw AppError.badRequest('Select at least one regulation batch');
    const selectedYearSemesters = Array.isArray(dto.selectedYearSemesters)
      ? dto.selectedYearSemesters
        .map((item) => ({ yearOfStudy: Number(item.yearOfStudy), semester: Number(item.semester) }))
        .filter((item) => Number.isInteger(item.yearOfStudy) && Number.isInteger(item.semester))
      : [];
    if (!selectedYearSemesters.length) throw AppError.badRequest('Select at least one year and semester');
    const subjects = await this.subjectsForScopes(regulation.id, selectedScopes, selectedYearSemesters);
    if (!subjects.length) throw AppError.badRequest('No subjects are mapped for the selected year and semester');
    const subjectIds = [...new Set((dto.subjectIds ?? []).map(Number).filter(Number.isInteger))];
    const subjectSet = new Set(subjects.map((subject) => subject.id));
    if (!subjectIds.length || subjectIds.some((subjectId) => !subjectSet.has(subjectId))) {
      throw AppError.badRequest('Select at least one active subject from the regulation');
    }
    const excludedBatches = [];
    const feesByCount = Array.from({ length: subjectIds.length }, (_, index) => Number(dto.feesByCount?.[index]));
    if (feesByCount.some((fee) => !Number.isFinite(fee) || fee < 0)) {
      throw AppError.badRequest(`Enter fees for 1 through ${subjectIds.length} subject(s)`);
    }
    const title = String(dto.title ?? '').trim();
    const message = String(dto.message ?? '').trim();
    if (!title || !message) throw AppError.badRequest('Notification title and message are required');
    const startDate = String(dto.startDate ?? '').trim();
    const endDate = String(dto.endDate ?? '').trim();
    if (!startDate || !endDate || endDate < startDate) throw AppError.badRequest('Enter a valid application date range');
    const notification = id ? await this.findNotification(id) : this.notificationRepo.create();
    Object.assign(notification, {
      regulationId: regulation.id,
      title,
      message,
      startDate,
      endDate,
      selectedScopes: selectedScopes.map(({ key, ...scope }) => scope),
      selectedYearSemesters,
      excludedBatches,
      subjectIds,
      feesByCount,
      status: dto.status === 'published' ? 'published' : 'draft',
      createdBy: notification.createdBy || actor?.username || actor?.email || null,
    });
    const saved = await this.notificationRepo.save(notification);
    return this.serialize({ ...saved, regulation });
  }

  async findStudent(identifier) {
    const value = String(identifier ?? '').trim();
    if (!value) throw AppError.badRequest('Student PIN or admission number is required');
    const result = await this.sdms.listStudents({ search: value, limit: 25 });
    const lower = value.toLowerCase();
    const student = result.items.find((item) =>
      [item.pinNo, item.admissionNumber].some((candidate) => String(candidate ?? '').trim().toLowerCase() === lower),
    );
    if (!student) throw AppError.notFound('Student not found');
    return student;
  }

  async getStudent(id, identifier) {
    const notification = await this.findNotification(id);
    const student = await this.findStudent(identifier);
    if (notification.status !== 'published') throw AppError.badRequest('This revaluation notification is not published');
    const scopeMatches = (notification.selectedScopes ?? []).some((scope) =>
      String(scope.collegeName).trim().toLowerCase() === String(student.college ?? '').trim().toLowerCase() &&
      String(scope.courseName).trim().toLowerCase() === String(student.course ?? '').trim().toLowerCase() &&
      String(scope.batch).trim().toLowerCase() === String(student.batch ?? '').trim().toLowerCase() &&
      !(notification.excludedBatches ?? []).map((batch) => String(batch).toLowerCase()).includes(String(student.batch ?? '').toLowerCase()),
    );
    if (!scopeMatches) throw AppError.badRequest('This student is outside the notification batch scope');
    const subjects = await this.subjectsForScopes(notification.regulationId, notification.selectedScopes ?? [], notification.selectedYearSemesters ?? []);
    const allowed = new Set((notification.subjectIds ?? []).map(Number));
    return {
      notification: await this.serialize(notification),
      student: { id: student.id, name: student.studentName, pinNo: student.pinNo, admissionNumber: student.admissionNumber, batch: student.batch, college: student.college, course: student.course, branch: student.branch },
      subjects: subjects.filter((subject) => allowed.has(subject.id)),
    };
  }

  async apply(id, dto) {
    const detail = await this.getStudent(id, dto.studentIdentifier);
    const selected = [...new Set((dto.selectedSubjectIds ?? []).map(Number).filter(Number.isInteger))];
    const allowed = new Set(detail.subjects.map((subject) => subject.id));
    if (!selected.length || selected.some((subjectId) => !allowed.has(subjectId))) throw AppError.badRequest('Select valid subjects for this notification');
    const fee = Number(detail.notification.feesByCount[selected.length - 1]);
    if (!Number.isFinite(fee)) throw AppError.badRequest('Fee is not configured for this subject count');
    const roll = detail.student.pinNo || detail.student.admissionNumber;
    const existing = await this.applicationRepo.findOne({ where: { notificationId: id, studentRollNumber: roll } });
    if (existing) throw AppError.badRequest('Revaluation has already been applied for this student');
    const feeRecord = await this.feeRecordRepo.save(this.feeRecordRepo.create({
      examId: null,
      feeType: 'REVALUATION',
      feeLabel: detail.notification.title,
      revaluationNotificationId: id,
      studentRollNumber: roll,
      studentName: detail.student.name,
      selectedSubjectIds: selected,
      feeBreakdown: detail.subjects.filter((subject) => selected.includes(subject.id)).map((subject) => ({ subjectId: subject.id, subjectCode: subject.code, subjectName: subject.name })),
      baseFee: fee,
      lateFee: 0,
      totalAmount: fee,
      status: 'pending',
    }));
    return this.applicationRepo.save(this.applicationRepo.create({ notificationId: id, feeRecordId: feeRecord.id, studentRollNumber: roll, studentName: detail.student.name, selectedSubjectIds: selected, feeAmount: fee, status: 'pending' }));
  }

  async listApplications(notificationId) {
    return this.applicationRepo.find({
      where: { notificationId },
      relations: ['feeRecord', 'feeRecord.payments'],
      order: { createdAt: 'DESC' },
    });
  }

  async listEligibleStudents(notificationId) {
    const notification = await this.findNotification(notificationId);
    if (notification.status !== 'published') throw AppError.badRequest('This revaluation notification is not published');
    const byRoll = new Map();
    const excluded = (notification.excludedBatches ?? []).map((b) => String(b).trim().toLowerCase());
    for (const scope of notification.selectedScopes ?? []) {
      let page = 1;
      let result;
      do {
        result = await this.sdms.listStudents({
          college: scope.collegeName,
          course: scope.courseName,
          batch: scope.batch,
          page,
          limit: 200,
        });
        for (const student of result.items) {
          if (excluded.includes(String(student.batch ?? '').trim().toLowerCase())) continue;
          const roll = String(student.pinNo || student.admissionNumber || '').trim();
          if (roll) byRoll.set(roll.toLowerCase(), student);
        }
        page += 1;
      } while (page <= result.totalPages);
    }
    const records = await this.feeRecordRepo.find({ where: { revaluationNotificationId: notificationId } });
    const recordByRoll = new Map(records.map((record) => [record.studentRollNumber.toLowerCase(), record]));
    return [...byRoll.values()].sort((a, b) => a.studentName.localeCompare(b.studentName)).map((student) => {
      const roll = String(student.pinNo || student.admissionNumber || '').trim();
      const feeRecord = recordByRoll.get(roll.toLowerCase());
      return {
        id: student.id,
        name: student.studentName,
        rollNumber: roll,
        admissionNumber: student.admissionNumber,
        college: student.college,
        course: student.course,
        branch: student.branch,
        batch: student.batch,
        section: student.section,
        currentYear: student.currentYear,
        currentSemester: student.currentSemester,
        studentStatus: student.studentStatus,
        feeRecordId: feeRecord?.id ?? null,
        feeStatus: feeRecord?.status ?? 'not_applied',
        feeAmount: feeRecord?.totalAmount ?? null,
      };
    });
  }
}

module.exports = { RevaluationService };
