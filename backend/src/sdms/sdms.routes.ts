import { Router } from 'express';
import { asyncHandler } from '../common/asyncHandler';
import type { Services } from '../database/container';

function parseId(value: string) {
  return parseInt(value, 10);
}

function parseOptionalInt(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = parseInt(String(value), 10);
  return Number.isNaN(n) ? undefined : n;
}

function parseBool(value: unknown, defaultValue = true) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return String(value).toLowerCase() !== 'false';
}

export function createSdmsRoutes(services: Services) {
  const router = Router();
  const sdms = services.sdms;

  router.get(
    '/status',
    asyncHandler(async (_req, res) => {
      res.json(await sdms.getStatus());
    }),
  );

  router.get(
    '/colleges',
    asyncHandler(async (req, res) => {
      res.json(await sdms.listColleges(parseBool(req.query.activeOnly)));
    }),
  );

  router.get(
    '/colleges/:id',
    asyncHandler(async (req, res) => {
      res.json(await sdms.getCollege(parseId(req.params.id)));
    }),
  );

  router.get(
    '/colleges/:id/courses',
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
    asyncHandler(async (req, res) => {
      res.json(await sdms.getCourse(parseId(req.params.id)));
    }),
  );

  router.get(
    '/courses/:id/branches',
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
    asyncHandler(async (req, res) => {
      res.json(await sdms.getBranch(parseId(req.params.id)));
    }),
  );

  router.get(
    '/branches/:id/academic-years',
    asyncHandler(async (req, res) => {
      res.json(await sdms.listBranchAcademicYears(parseId(req.params.id)));
    }),
  );

  router.get(
    '/branches/:id/year-semesters',
    asyncHandler(async (req, res) => {
      res.json(await sdms.getBranchYearSemesters(parseId(req.params.id)));
    }),
  );

  router.get(
    '/branches/:id/sections',
    asyncHandler(async (req, res) => {
      res.json(
        await sdms.listBranchSections(
          parseId(req.params.id),
          req.query.batch as string | undefined,
        ),
      );
    }),
  );

  router.get(
    '/academic-years',
    asyncHandler(async (req, res) => {
      res.json(await sdms.listAcademicYears(parseBool(req.query.activeOnly)));
    }),
  );

  router.get(
    '/batches',
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
    asyncHandler(async (req, res) => {
      res.json(
        await sdms.listSemesters({
          collegeId: parseOptionalInt(req.query.collegeId),
          courseId: parseOptionalInt(req.query.courseId),
          academicYearId: parseOptionalInt(req.query.academicYearId),
          batch: req.query.batch as string | undefined,
          yearOfStudy: parseOptionalInt(req.query.yearOfStudy),
        }),
      );
    }),
  );

  router.get(
    '/student-sections',
    asyncHandler(async (req, res) => {
      res.json(
        await sdms.listStudentSections({
          branchId: parseOptionalInt(req.query.branchId),
          batch: req.query.batch as string | undefined,
          sectionName: req.query.sectionName as string | undefined,
        }),
      );
    }),
  );

  router.get(
    '/students',
    asyncHandler(async (req, res) => {
      res.json(
        await sdms.listStudents({
          college: req.query.college as string | undefined,
          course: req.query.course as string | undefined,
          branch: req.query.branch as string | undefined,
          batch: req.query.batch as string | undefined,
          currentYear: parseOptionalInt(req.query.currentYear),
          currentSemester: parseOptionalInt(req.query.currentSemester),
          section: req.query.section as string | undefined,
          admissionNumber: req.query.admissionNumber as string | undefined,
          pinNo: req.query.pinNo as string | undefined,
          search: req.query.search as string | undefined,
          page: parseOptionalInt(req.query.page),
          limit: parseOptionalInt(req.query.limit),
        }),
      );
    }),
  );

  router.get(
    '/students/:id',
    asyncHandler(async (req, res) => {
      res.json(await sdms.getStudent(parseId(req.params.id)));
    }),
  );

  return router;
}
