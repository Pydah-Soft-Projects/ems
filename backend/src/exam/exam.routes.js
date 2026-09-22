'use strict';

const { Router } = require('express');
const { asyncHandler } = require('../common/asyncHandler');
const { FeeStatus } = require('./schemas/exam.enums');
const { requireStaff, requirePrivilege } = require('../middleware/auth');

function parseId(value) {
  return parseInt(value, 10);
}

function createExamRoutes(services) {
  const router = Router();
  router.use(requireStaff);

  router.post(
    '/sync-events',
    requirePrivilege('exams:write', 'exams:read'),
    asyncHandler(async (req, res) => {
      const result = await services.exam.syncEventsForPublishedExams(req.user);
      res.json({ success: true, ...result });
    }),
  );

  router.get(
    '/reports/application-summary',
    requirePrivilege('exams:read', 'fees:read'),
    asyncHandler(async (req, res) => {
      const report = await services.exam.getExamApplicationReport(req.query);
      res.json(report);
    }),
  );

  router.post(
    '/',
    requirePrivilege('exams:write'),
    asyncHandler(async (req, res) => {
      res.status(201).json(await services.exam.create(req.body));
    }),
  );
  router.get(
    '/',
    requirePrivilege('exams:read', 'fees:read', 'fees:collect'),
    asyncHandler(async (req, res) => {
      const status = req.query.status;
      res.json(await services.exam.findAll(status));
    }),
  );
  router.get(
    '/:id',
    requirePrivilege('exams:read'),
    asyncHandler(async (req, res) => {
      res.json(await services.exam.findOne(parseId(req.params.id)));
    }),
  );
  router.patch(
    '/:id',
    requirePrivilege('exams:edit'),
    asyncHandler(async (req, res) => {
      res.json(await services.exam.update(parseId(req.params.id), req.body, req.user));
    }),
  );
  router.post(
    '/:id/submit',
    requirePrivilege('exams:submit'),
    asyncHandler(async (req, res) => {
      res.json(await services.exam.submitForApproval(parseId(req.params.id)));
    }),
  );
  router.post(
    '/:id/approve',
    requirePrivilege('exams:approve'),
    asyncHandler(async (req, res) => {
      res.json(
        await services.exam.approve(parseId(req.params.id), req.user.username),
      );
    }),
  );
  router.post(
    '/:id/reject',
    requirePrivilege('exams:approve'),
    asyncHandler(async (req, res) => {
      res.json(await services.exam.reject(parseId(req.params.id), req.body));
    }),
  );
  router.post(
    '/:id/publish',
    requirePrivilege('exams:publish'),
    asyncHandler(async (req, res) => {
      res.json(await services.exam.publish(parseId(req.params.id), req.body, req.user));
    }),
  );
  router.post(
    '/:id/release-hall-tickets',
    requirePrivilege('exams:hall_tickets'),
    asyncHandler(async (req, res) => {
      res.json(await services.exam.releaseHallTickets(parseId(req.params.id)));
    }),
  );
  router.get(
    '/:id/hall-tickets',
    requirePrivilege(
      'exams:hall_tickets',
      'exams:duplicate_hall_tickets:raise',
      'exams:duplicate_hall_tickets:print',
    ),
    asyncHandler(async (req, res) => {
      res.json(
        await services.exam.listHallTicketsForExam(parseId(req.params.id)),
      );
    }),
  );
  router.get(
    '/:id/hall-tickets/:applicationId',
    requirePrivilege('exams:hall_tickets'),
    asyncHandler(async (req, res) => {
      res.json(
        await services.exam.getHallTicketForExam(
          parseId(req.params.id),
          parseId(req.params.applicationId),
        ),
      );
    }),
  );
  router.get(
    '/:id/eligible-students',
    requirePrivilege('exams:read', 'exams:publish', 'fees:read', 'fees:collect'),
    asyncHandler(async (req, res) => {
      res.json(
        await services.exam.listEligibleStudents(parseId(req.params.id)),
      );
    }),
  );
  router.get(
    '/:id/analytics',
    requirePrivilege('exams:analytics'),
    asyncHandler(async (req, res) => {
      res.json(await services.exam.getExamAnalytics(parseId(req.params.id)));
    }),
  );
  router.post(
    '/:id/generate-fees',
    requirePrivilege('fees:collect'),
    asyncHandler(async (req, res) => {
      res.json(
        await services.exam.generateFees(parseId(req.params.id), req.body),
      );
    }),
  );
  router.post(
    '/:id/results',
    requirePrivilege('exams:results'),
    asyncHandler(async (req, res) => {
      const uploadedBy =
        req.user?.fullName?.trim() || req.user?.username?.trim() || null;
      const result = await services.results.uploadResults(
        parseId(req.params.id),
        req.body,
        uploadedBy,
      );
      res.status(result.success ? 201 : 200).json(result);
    }),
  );
  router.get(
    '/:id/results',
    requirePrivilege('exams:results'),
    asyncHandler(async (req, res) => {
      res.json(await services.results.getExamResults(parseId(req.params.id)));
    }),
  );
  return router;
}

function createResultsRoutes(services) {
  const router = Router();
  router.use(requireStaff);
  router.get(
    '/roll/:rollNumber',
    requirePrivilege('exams:results'),
    asyncHandler(async (req, res) => {
      res.json(
        await services.results.getStudentResultsByRoll(
          decodeURIComponent(req.params.rollNumber),
        ),
      );
    }),
  );
  return router;
}

function createFeesRoutes(services) {
  const router = Router();
  // Razorpay status/order/verify can be used by students too via student routes;
  // staff fee desk routes require staff + privileges.

  /** Single readiness endpoint for fee desk / student pay UI */
  router.get(
    '/payment-methods/status',
    asyncHandler(async (_req, res) => {
      res.json(await services.settings.getPaymentMethodsStatus());
    }),
  );

  router.get(
    '/razorpay/status',
    asyncHandler(async (_req, res) => {
      res.json(await services.settings.getRazorpayStatus());
    }),
  );
  router.post(
    '/razorpay/order',
    asyncHandler(async (req, res) => {
      const feeRecordId = parseInt(String(req.body.feeRecordId), 10);
      if (!feeRecordId) {
        res.status(400).json({ message: 'feeRecordId is required' });
        return;
      }
      res.status(201).json(
        await services.exam.createRazorpayOrder(feeRecordId, {
          paymentMethod: req.body.paymentMethod,
          actor: {
            role: req.user?.role,
            pinNo: req.user?.pinNo,
            username: req.user?.username,
            fullName: req.user?.fullName,
          },
        }),
      );
    }),
  );
  router.post(
    '/razorpay/verify',
    asyncHandler(async (req, res) => {
      res.json(
        await services.exam.verifyRazorpayPayment({
          razorpayOrderId: String(req.body.razorpayOrderId ?? ''),
          razorpayPaymentId: String(req.body.razorpayPaymentId ?? ''),
          razorpaySignature: String(req.body.razorpaySignature ?? ''),
          paymentId: req.body.paymentId
            ? parseInt(String(req.body.paymentId), 10)
            : undefined,
        }),
      );
    }),
  );
  router.get(
    '/payments/:id/status',
    asyncHandler(async (req, res) => {
      res.json(await services.exam.getPaymentStatus(parseId(req.params.id)));
    }),
  );
  router.get(
    '/records/:id',
    asyncHandler(async (req, res) => {
      // Students may fetch their own fee record via student portal; staff need fees:read
      if (req.user?.role === 'student') {
        const record = await services.exam.getFeeRecord(parseId(req.params.id));
        const roll = record.studentRollNumber?.toLowerCase() ?? '';
        if (roll !== String(req.user.pinNo ?? '').toLowerCase()) {
          res.status(403).json({ message: 'Forbidden' });
          return;
        }
        res.json(record);
        return;
      }
      if (!req.user?.isSuperAdmin) {
        const { hasPrivilege } = require('../auth/permissions');
        if (!hasPrivilege(req.user?.privileges, 'fees:read')) {
          res.status(403).json({ message: 'Missing privilege: fees:read' });
          return;
        }
      }
      res.json(await services.exam.getFeeRecord(parseId(req.params.id)));
    }),
  );
  router.post(
    '/records/:id/pay-online',
    asyncHandler(async (req, res) => {
      res.status(201).json(
        await services.exam.createRazorpayOrder(parseId(req.params.id), {
          paymentMethod: req.body.paymentMethod,
          actor: {
            role: req.user?.role,
            pinNo: req.user?.pinNo,
            username: req.user?.username,
            fullName: req.user?.fullName,
          },
        }),
      );
    }),
  );

  router.get(
    '/duplicate-hall-ticket-fee',
    requireStaff,
    requirePrivilege(
      'exams:duplicate_hall_tickets:raise',
      'exams:duplicate_hall_tickets:print',
      'fees:read',
      'fees:collect',
      'exams:hall_tickets',
    ),
    asyncHandler(async (req, res) => {
      const statusRaw = req.query.status;
      const status =
        statusRaw === FeeStatus.PENDING || statusRaw === FeeStatus.PAID
          ? statusRaw
          : undefined;
      const examIdRaw = req.query.examId
        ? parseInt(String(req.query.examId), 10)
        : undefined;
      res.json(
        await services.exam.listDuplicateHallTicketFeeRecords({
          examId: Number.isFinite(examIdRaw) ? examIdRaw : undefined,
          rollNumber: req.query.rollNumber,
          status,
        }),
      );
    }),
  );

  router.post(
    '/duplicate-hall-ticket-fee',
    requireStaff,
    requirePrivilege(
      'exams:duplicate_hall_tickets:raise',
      'fees:collect',
      'exams:hall_tickets',
    ),
    asyncHandler(async (req, res) => {
      const examId = parseInt(String(req.body.examId ?? ''), 10);
      const rollNumber = String(req.body.rollNumber ?? '').trim();
      if (!examId || !rollNumber) {
        res.status(400).json({ message: 'examId and rollNumber are required' });
        return;
      }
      res.status(201).json(
        await services.exam.createDuplicateHallTicketFeeRecord(
          examId,
          rollNumber,
          req.body.studentName,
        ),
      );
    }),
  );

  router.get(
    '/records',
    requireStaff,
    requirePrivilege('fees:read'),
    asyncHandler(async (req, res) => {
      const statusRaw = req.query.status;
      const status =
        statusRaw === FeeStatus.PENDING || statusRaw === FeeStatus.PAID
          ? statusRaw
          : undefined;
      const page = req.query.page ? parseInt(String(req.query.page), 10) : undefined;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
      res.json(
        await services.exam.listFeeRecords(
          req.query.examId
            ? parseInt(String(req.query.examId), 10)
            : undefined,
          req.query.rollNumber,
          status,
          page,
          limit,
          req.query.feeType ? String(req.query.feeType) : undefined,
          req.query.revaluationNotificationId ? parseInt(String(req.query.revaluationNotificationId), 10) : undefined,
        ),
      );
    }),
  );
  router.get(
    '/collection',
    requireStaff,
    requirePrivilege('fees:collect'),
    asyncHandler(async (req, res) => {
      const rollNumber = String(req.query.rollNumber ?? '').trim();
      if (!rollNumber) {
        res.status(400).json({ message: 'rollNumber query parameter is required' });
        return;
      }
      res.json(await services.exam.lookupForCollection(rollNumber));
    }),
  );
  router.get(
    '/students/:studentId/exams',
    requireStaff,
    requirePrivilege('fees:apply'),
    asyncHandler(async (req, res) => {
      res.json(
        await services.exam.listPublishedExamsForStudent(
          parseId(req.params.studentId),
        ),
      );
    }),
  );
  router.get(
    '/students/:studentId/exams/:examId',
    requireStaff,
    requirePrivilege('fees:apply'),
    asyncHandler(async (req, res) => {
      res.json(
        await services.exam.getPublishedExamForStudent(
          parseId(req.params.examId),
          parseId(req.params.studentId),
        ),
      );
    }),
  );
  router.post(
    '/students/:studentId/exams/:examId/apply',
    requireStaff,
    requirePrivilege('fees:apply'),
    asyncHandler(async (req, res) => {
      res.status(201).json(
        await services.exam.createStudentApplication(
          parseId(req.params.examId),
          parseId(req.params.studentId),
          {
            examType: req.body?.examType,
            selectedSubjectIds: req.body?.selectedSubjectIds,
            declarationAccepted: req.body?.declarationAccepted === true,
            consentAccepted: req.body?.consentAccepted === true,
            overrideDues: req.body?.overrideDues === true,
          },
          {
            overrideDues: req.body?.overrideDues === true,
            actor: {
              isSuperAdmin: Boolean(req.user?.isSuperAdmin),
              privileges: req.user?.privileges ?? [],
              username: req.user?.username,
            },
          },
        ),
      );
    }),
  );
  router.get(
    '/payments',
    requireStaff,
    requirePrivilege('fees:read'),
    asyncHandler(async (req, res) => {
      if (req.query.rollNumber) {
        res.json(await services.exam.listPaymentsByRoll(String(req.query.rollNumber)));
        return;
      }
      res.json(
        await services.exam.listPayments(
          req.query.feeRecordId
            ? parseInt(String(req.query.feeRecordId), 10)
            : undefined,
        ),
      );
    }),
  );
  router.get(
    '/payments/:id',
    requireStaff,
    requirePrivilege('fees:read'),
    asyncHandler(async (req, res) => {
      const payment = await services.exam.getPayment(parseId(req.params.id));
      res.json(services.exam.withVerificationMeta(payment));
    }),
  );
  router.post(
    '/pay-offline',
    requireStaff,
    requirePrivilege('fees:collect'),
    asyncHandler(async (req, res) => {
      const staffName =
        req.user?.fullName?.trim() ||
        req.user?.username?.trim() ||
        req.body.collectedBy;
      res.json(
        await services.exam.payOffline({
          ...req.body,
          collectedBy: staffName,
          collectorUsername: req.user?.username ?? undefined,
        }),
      );
    }),
  );

  // —— Self Online (college UPI + statement reconcile) ——
  const multer = require('multer');
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },
  });

  router.get(
    '/self-online/status',
    asyncHandler(async (_req, res) => {
      res.json(await services.settings.getSelfOnlineStatus());
    }),
  );

  router.post(
    '/self-online/order',
    asyncHandler(async (req, res) => {
      const feeRecordId = parseInt(String(req.body.feeRecordId), 10);
      if (!feeRecordId) {
        res.status(400).json({ message: 'feeRecordId is required' });
        return;
      }
      res.status(201).json(
        await services.selfOnline.createOrder(feeRecordId, {
          actor: {
            role: req.user?.role,
            pinNo: req.user?.pinNo,
            username: req.user?.username,
            fullName: req.user?.fullName,
          },
        }),
      );
    }),
  );

  router.post(
    '/self-online/:paymentId/claim',
    asyncHandler(async (req, res) => {
      res.json(
        await services.selfOnline.claimPaid(parseId(req.params.paymentId), {
          utr: req.body.utr,
        }, {
          actor: {
            role: req.user?.role,
            pinNo: req.user?.pinNo,
            username: req.user?.username,
            fullName: req.user?.fullName,
          },
        }),
      );
    }),
  );

  router.get(
    '/self-online/pending',
    requireStaff,
    requirePrivilege('fees:read'),
    asyncHandler(async (_req, res) => {
      res.json(await services.selfOnline.listPending());
    }),
  );

  router.get(
    '/self-online/suggestions',
    requireStaff,
    requirePrivilege('fees:read'),
    asyncHandler(async (_req, res) => {
      res.json(await services.selfOnline.listSuggestedMatches());
    }),
  );

  router.get(
    '/self-online/statements',
    requireStaff,
    requirePrivilege('fees:read'),
    asyncHandler(async (_req, res) => {
      res.json(await services.selfOnline.listStatements());
    }),
  );

  router.get(
    '/self-online/statement-txns',
    requireStaff,
    requirePrivilege('fees:read'),
    asyncHandler(async (req, res) => {
      res.json(
        await services.selfOnline.listStatementTxns({
          statementId: req.query.statementId
            ? parseInt(String(req.query.statementId), 10)
            : undefined,
          matchStatus: req.query.matchStatus
            ? String(req.query.matchStatus)
            : undefined,
        }),
      );
    }),
  );

  router.post(
    '/self-online/statements',
    requireStaff,
    requirePrivilege('fees:reconcile'),
    upload.single('file'),
    asyncHandler(async (req, res) => {
      if (!req.file) {
        res.status(400).json({ message: 'Statement file is required (PDF preferred)' });
        return;
      }
      res.status(201).json(
        await services.selfOnline.uploadStatement({
          buffer: req.file.buffer,
          fileName: req.file.originalname,
          mimeType: req.file.mimetype,
          uploadedBy: req.user?.fullName || req.user?.username,
          uploadedByUsername: req.user?.username,
          notes: req.body?.notes,
        }),
      );
    }),
  );

  router.post(
    '/self-online/verify',
    requireStaff,
    requirePrivilege('fees:reconcile'),
    asyncHandler(async (req, res) => {
      const paymentId = parseInt(String(req.body.paymentId), 10);
      const merchantTxnId = parseInt(String(req.body.merchantTxnId), 10);
      if (!paymentId || !merchantTxnId) {
        res.status(400).json({
          message: 'paymentId and merchantTxnId are required',
        });
        return;
      }
      res.json(
        await services.selfOnline.verifyMatch({
          paymentId,
          merchantTxnId,
          actor: {
            username: req.user?.username,
            fullName: req.user?.fullName,
          },
        }),
      );
    }),
  );

  router.post(
    '/self-online/manual-verify',
    requireStaff,
    requirePrivilege('fees:reconcile'),
    asyncHandler(async (req, res) => {
      const paymentId = parseInt(String(req.body.paymentId), 10);
      if (!paymentId) {
        res.status(400).json({ message: 'paymentId is required' });
        return;
      }
      res.json(
        await services.selfOnline.manualVerifyByUtr({
          paymentId,
          utr: req.body.utr,
          bankLine: req.body.bankLine,
          actor: {
            username: req.user?.username,
            fullName: req.user?.fullName,
          },
        }),
      );
    }),
  );

  router.post(
    '/self-online/reject-suggestion',
    requireStaff,
    requirePrivilege('fees:reconcile'),
    asyncHandler(async (req, res) => {
      const merchantTxnId = parseInt(String(req.body.merchantTxnId), 10);
      if (!merchantTxnId) {
        res.status(400).json({ message: 'merchantTxnId is required' });
        return;
      }
      res.json(await services.selfOnline.rejectSuggestion(merchantTxnId));
    }),
  );

  router.post(
    '/self-online/auto-match-all',
    requireStaff,
    requirePrivilege('fees:reconcile'),
    asyncHandler(async (_req, res) => {
      res.json(await services.selfOnline.runAutoMatchAll());
    }),
  );

  // ── Canara Bank Dynamic QR ─────────────────────────────────
  router.get(
    '/canara/status',
    asyncHandler(async (_req, res) => {
      res.json(await services.canaraSettings.getStatus());
    }),
  );

  router.post(
    '/canara/oauth/start',
    requireStaff,
    requirePrivilege('settings:payments'),
    asyncHandler(async (req, res) => {
      res.json(
        await services.canaraQr.startOauth({
          state: req.body?.state,
        }),
      );
    }),
  );

  router.post(
    '/canara/order',
    asyncHandler(async (req, res) => {
      const feeRecordId = parseInt(String(req.body.feeRecordId), 10);
      if (!feeRecordId) {
        res.status(400).json({ message: 'feeRecordId is required' });
        return;
      }
      res.status(201).json(
        await services.canaraQr.createOrder(feeRecordId, {
          actor: {
            role: req.user?.role,
            pinNo: req.user?.pinNo,
            username: req.user?.username,
            fullName: req.user?.fullName,
          },
        }),
      );
    }),
  );

  router.post(
    '/canara/:paymentId/status',
    asyncHandler(async (req, res) => {
      res.json(
        await services.canaraQr.checkStatus(parseId(req.params.paymentId), {
          actor: {
            role: req.user?.role,
            pinNo: req.user?.pinNo,
            username: req.user?.username,
            fullName: req.user?.fullName,
          },
          simulatePaid: Boolean(req.body?.simulatePaid),
        }),
      );
    }),
  );

  router.post(
    '/canara/:paymentId/simulate-callback',
    requireStaff,
    requirePrivilege('fees:reconcile'),
    asyncHandler(async (req, res) => {
      res.json(
        await services.canaraQr.simulateCallback(parseId(req.params.paymentId), {
          force: Boolean(req.body?.force),
        }),
      );
    }),
  );

  return router;
}

module.exports = { createExamRoutes, createFeesRoutes, createResultsRoutes };
