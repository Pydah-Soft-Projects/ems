'use strict';

const { Router } = require('express');
const { asyncHandler } = require('../common/asyncHandler');
const { requireStaff, requirePrivilege } = require('../middleware/auth');

function parseId(value) {
  return parseInt(value, 10);
}

function parseOptionalInt(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = parseInt(String(value), 10);
  return Number.isNaN(n) ? undefined : n;
}

function parseBool(value, defaultValue = true) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return String(value).toLowerCase() !== 'false';
}

function createSdmsRoutes(services) {
  const router = Router();
  router.use(requireStaff);
  const sdms = services.sdms;

  router.get(
    '/status',
    requirePrivilege('organization:read', 'students:read'),
    asyncHandler(async (_req, res) => {
      res.json(await sdms.getStatus());
    }),
  );
  router.get(
    '/colleges',
    requirePrivilege('organization:read'),
    asyncHandler(async (req, res) => {
      let colleges = await sdms.listColleges(parseBool(req.query.activeOnly));
      if (
        !req.user?.isSuperAdmin &&
        Array.isArray(req.user?.collegeIds) &&
        req.user.collegeIds.length > 0 &&
        req.query.unscoped !== 'true'
      ) {
        const allowed = new Set(req.user.collegeIds.map(Number));
        colleges = colleges.filter((c) => allowed.has(Number(c.id)));
      }
      res.json(colleges);
    }),
  );
  router.get(
    '/colleges/:id',
    requirePrivilege('organization:read'),
    asyncHandler(async (req, res) => {
      const collegeId = parseId(req.params.id);
      if (
        !req.user?.isSuperAdmin &&
        Array.isArray(req.user?.collegeIds) &&
        req.user.collegeIds.length > 0
      ) {
        const allowed = new Set(req.user.collegeIds.map(Number));
        if (!allowed.has(collegeId)) {
          return res.status(403).json({ message: 'Access denied to this college' });
        }
      }
      res.json(await sdms.getCollege(collegeId));
    }),
  );
  router.get(
    '/colleges/:id/courses',
    requirePrivilege('organization:read'),
    asyncHandler(async (req, res) => {
      const collegeId = parseId(req.params.id);
      if (
        !req.user?.isSuperAdmin &&
        Array.isArray(req.user?.collegeIds) &&
        req.user.collegeIds.length > 0
      ) {
        const allowed = new Set(req.user.collegeIds.map(Number));
        if (!allowed.has(collegeId)) {
          return res.json([]);
        }
      }
      let courses = await sdms.listCourses(
        collegeId,
        parseBool(req.query.activeOnly),
      );
      if (
        !req.user?.isSuperAdmin &&
        Array.isArray(req.user?.courseIds) &&
        req.user.courseIds.length > 0
      ) {
        const allowedCourses = new Set(req.user.courseIds.map(Number));
        courses = courses.filter((c) => allowedCourses.has(Number(c.id)));
      }
      res.json(courses);
    }),
  );
  router.get(
    '/courses/:id',
    requirePrivilege('organization:read'),
    asyncHandler(async (req, res) => {
      res.json(await sdms.getCourse(parseId(req.params.id)));
    }),
  );
  router.get(
    '/courses/:id/branches',
    requirePrivilege('organization:read'),
    asyncHandler(async (req, res) => {
      const courseId = parseId(req.params.id);
      if (
        !req.user?.isSuperAdmin &&
        Array.isArray(req.user?.courseIds) &&
        req.user.courseIds.length > 0
      ) {
        const allowedCourses = new Set(req.user.courseIds.map(Number));
        if (!allowedCourses.has(courseId)) {
          return res.json([]);
        }
      }
      let branches = await sdms.listBranches(
        courseId,
        parseBool(req.query.activeOnly),
      );
      if (
        !req.user?.isSuperAdmin &&
        Array.isArray(req.user?.branchIds) &&
        req.user.branchIds.length > 0
      ) {
        const allowedBranches = new Set(req.user.branchIds.map(Number));
        branches = branches.filter((b) => allowedBranches.has(Number(b.id)));
      }
      res.json(branches);
    }),
  );
  router.get(
    '/branches/:id',
    requirePrivilege('organization:read'),
    asyncHandler(async (req, res) => {
      res.json(await sdms.getBranch(parseId(req.params.id)));
    }),
  );
  router.get(
    '/branches/:id/academic-years',
    requirePrivilege('organization:read'),
    asyncHandler(async (req, res) => {
      res.json(await sdms.listBranchAcademicYears(parseId(req.params.id)));
    }),
  );
  router.get(
    '/branches/:id/year-semesters',
    requirePrivilege('organization:read'),
    asyncHandler(async (req, res) => {
      res.json(await sdms.getBranchYearSemesters(parseId(req.params.id)));
    }),
  );
  router.get(
    '/branches/:id/sections',
    requirePrivilege('organization:read'),
    asyncHandler(async (req, res) => {
      res.json(
        await sdms.listBranchSections(parseId(req.params.id), req.query.batch),
      );
    }),
  );
  router.get(
    '/academic-years',
    requirePrivilege('organization:read'),
    asyncHandler(async (req, res) => {
      res.json(await sdms.listAcademicYears(parseBool(req.query.activeOnly)));
    }),
  );
  router.get(
    '/batches',
    requirePrivilege('organization:read'),
    asyncHandler(async (req, res) => {
      res.json(
        await sdms.listBatches({
          collegeId: parseOptionalInt(req.query.collegeId),
          courseId: parseOptionalInt(req.query.courseId),
          branchId: parseOptionalInt(req.query.branchId),
        }),
      );
    }),
  );
  router.get(
    '/semesters',
    requirePrivilege('organization:read'),
    asyncHandler(async (req, res) => {
      res.json(
        await sdms.listSemesters({
          collegeId: parseOptionalInt(req.query.collegeId),
          courseId: parseOptionalInt(req.query.courseId),
          academicYearId: parseOptionalInt(req.query.academicYearId),
          batch: req.query.batch,
          yearOfStudy: parseOptionalInt(req.query.yearOfStudy),
        }),
      );
    }),
  );
  router.get(
    '/student-sections',
    requirePrivilege('organization:read', 'students:read'),
    asyncHandler(async (req, res) => {
      res.json(
        await sdms.listStudentSections({
          branchId: parseOptionalInt(req.query.branchId),
          batch: req.query.batch,
          sectionName: req.query.sectionName,
        }),
      );
    }),
  );
  router.get(
    '/students',
    requirePrivilege('students:read'),
    asyncHandler(async (req, res) => {
      const user = req.user;
      let targetCollege = req.query.college;
      let targetColleges = undefined;
      let targetCourse = req.query.course;
      let targetCourses = undefined;
      let targetBranch = req.query.branch;
      let targetBranches = undefined;

      if (!user?.isSuperAdmin) {
        if (Array.isArray(user?.collegeNames) && user.collegeNames.length > 0) {
          if (targetCollege) {
            if (!user.collegeNames.includes(targetCollege)) {
              return res.json({ items: [], total: 0, page: 1, limit: 50, totalPages: 0 });
            }
          } else {
            targetColleges = user.collegeNames;
          }
        }
        if (Array.isArray(user?.courseNames) && user.courseNames.length > 0) {
          if (targetCourse) {
            if (!user.courseNames.includes(targetCourse)) {
              return res.json({ items: [], total: 0, page: 1, limit: 50, totalPages: 0 });
            }
          } else {
            targetCourses = user.courseNames;
          }
        }
        if (Array.isArray(user?.branchNames) && user.branchNames.length > 0) {
          if (targetBranch) {
            if (!user.branchNames.includes(targetBranch)) {
              return res.json({ items: [], total: 0, page: 1, limit: 50, totalPages: 0 });
            }
          } else {
            targetBranches = user.branchNames;
          }
        }
      }

      res.json(
        await sdms.listStudents({
          college: targetCollege,
          colleges: targetColleges,
          course: targetCourse,
          courses: targetCourses,
          branch: targetBranch,
          branches: targetBranches,
          batch: req.query.batch,
          currentYear: parseOptionalInt(req.query.currentYear),
          currentSemester: parseOptionalInt(req.query.currentSemester),
          section: req.query.section,
          admissionNumber: req.query.admissionNumber,
          pinNo: req.query.pinNo,
          search: req.query.search,
          page: parseOptionalInt(req.query.page),
          limit: parseOptionalInt(req.query.limit),
        }),
      );
    }),
  );
  router.get(
    '/students/:id',
    requirePrivilege('students:read'),
    asyncHandler(async (req, res) => {
      res.json(await sdms.getStudent(parseId(req.params.id)));
    }),
  );
  router.get(
    '/events',
    requirePrivilege('exams:read'),
    asyncHandler(async (req, res) => {
      res.json(
        await sdms.listEvents({
          from: req.query.from,
          to: req.query.to,
          targetCollege: req.query.targetCollege,
          targetCourse: req.query.targetCourse,
          targetBranch: req.query.targetBranch,
          targetBatch: req.query.targetBatch,
          targetYear: req.query.targetYear,
          targetSemester: req.query.targetSemester,
        }),
      );
    }),
  );
  router.post(
    '/events/sync',
    requirePrivilege('exams:write', 'exams:read'),
    asyncHandler(async (req, res) => {
      if (services.exam && typeof services.exam.syncEventsForPublishedExams === 'function') {
        const result = await services.exam.syncEventsForPublishedExams(req.user);
        res.json({ success: true, ...result });
      } else {
        res.json({ success: false, message: 'Exam service unavailable' });
      }
    }),
  );
  return router;
}

module.exports = { createSdmsRoutes };
