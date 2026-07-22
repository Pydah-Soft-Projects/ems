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
      res.json(await sdms.listColleges(parseBool(req.query.activeOnly)));
    }),
  );
  router.get(
    '/colleges/:id',
    requirePrivilege('organization:read'),
    asyncHandler(async (req, res) => {
      res.json(await sdms.getCollege(parseId(req.params.id)));
    }),
  );
  router.get(
    '/colleges/:id/courses',
    requirePrivilege('organization:read'),
    asyncHandler(async (req, res) => {
      res.json(
        await sdms.listCourses(
          parseId(req.params.id),
          parseBool(req.query.activeOnly),
        ),
      );
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
      res.json(
        await sdms.listBranches(
          parseId(req.params.id),
          parseBool(req.query.activeOnly),
        ),
      );
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
      res.json(
        await sdms.listStudents({
          college: req.query.college,
          course: req.query.course,
          branch: req.query.branch,
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
  return router;
}

module.exports = { createSdmsRoutes };
