'use strict';

const { Router } = require('express');
const multer = require('multer');
const { asyncHandler } = require('../common/asyncHandler');
const { requireStaff, requirePrivilege } = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

function parseId(value) {
  return parseInt(value, 10);
}

function createMarksRoutes(services) {
  const router = Router();
  router.use(requireStaff);

  /** Get available exam and revaluation notifications for marks uploading */
  router.get(
    '/notifications',
    requirePrivilege('exams:read', 'exams:results', 'revaluations:read'),
    asyncHandler(async (req, res) => {
      res.json(await services.marks.getNotifications());
    }),
  );

  /** Get enrolled students and paper subjects for a selected notification */
  router.get(
    '/notification-details/:type/:id',
    requirePrivilege('exams:read', 'exams:results'),
    asyncHandler(async (req, res) => {
      const type = req.params.type;
      const id = parseId(req.params.id);
      res.json(await services.marks.getNotificationDetails(type, id));
    }),
  );

  /** Get consolidated student-wise results report */
  router.get(
    '/consolidated-results',
    requirePrivilege('exams:read', 'exams:results'),
    asyncHandler(async (req, res) => {
      const { examId, revaluationId, rollNumber, search } = req.query;
      res.json(
        await services.marks.getConsolidatedResults({
          examId: examId ? parseId(examId) : undefined,
          revaluationId: revaluationId ? parseId(revaluationId) : undefined,
          rollNumber: rollNumber ? String(rollNumber).trim() : undefined,
          search: search ? String(search).trim() : undefined,
        }),
      );
    }),
  );

  /** Parse uploaded Excel or PDF file into structured JSON rows */
  router.post(
    '/parse',
    requirePrivilege('exams:results', 'exams:write'),
    upload.single('file'),
    asyncHandler(async (req, res) => {
      let buffer = req.file?.buffer;
      let fileName = req.file?.originalname;
      let mimeType = req.file?.mimetype;

      const textContent = req.body?.textContent;
      const notificationId = req.body?.notificationId ? parseId(req.body.notificationId) : undefined;
      const notificationType = req.body?.notificationType;
      const branch = req.body?.branch;
      const subjectCode = req.body?.subjectCode;
      const activeTab = req.body?.activeTab;
      const courseCategory = req.body?.courseCategory;

      if (!buffer && !textContent) {
        throw AppError.badRequest('No file uploaded or file content is empty.');
      }

      const result = await services.marks.parseDocument({
        buffer,
        fileName,
        mimeType,
        textContent,
        notificationId,
        notificationType,
        branch,
        subjectCode,
        activeTab,
        courseCategory,
      });

      res.json(result);
    }),
  );

  /** Upload marks for a specific category and notification */
  router.post(
    '/upload/:category/:notificationId',
    requirePrivilege('exams:results', 'exams:write'),
    asyncHandler(async (req, res) => {
      const category = req.params.category;
      const notificationId = parseId(req.params.notificationId);
      const uploadedBy =
        req.user?.fullName?.trim() || req.user?.username?.trim() || 'Staff Desk';

      const result = await services.marks.uploadMarks(
        category,
        notificationId,
        req.body,
        uploadedBy,
      );

      res.status(result.success ? 201 : 200).json(result);
    }),
  );

  /** Get previously uploaded marks history */
  router.get(
    '/history/:category/:notificationId',
    requirePrivilege('exams:read', 'exams:results'),
    asyncHandler(async (req, res) => {
      const category = req.params.category;
      const notificationId = parseId(req.params.notificationId);

      const data = await services.marks.getUploadedMarks(category, notificationId);
      res.json(data);
    }),
  );

  return router;
}

module.exports = { createMarksRoutes };
