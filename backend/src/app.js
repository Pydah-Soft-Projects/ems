'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { config } = require('./config');
const { errorHandler } = require('./middleware/errorHandler');
const { createAuthMiddleware } = require('./middleware/auth');
const { requestLogger } = require('./common/logger');
const { asyncHandler } = require('./common/asyncHandler');
const { AppError } = require('./common/errors');
const { createRegulationsRoutes } = require('./regulations/regulations.routes');
const {
  createSubjectsRoutes,
  createSubjectMappingRoutes,
} = require('./subjects/subjects.routes');
const {
  createExamRoutes,
  createFeesRoutes,
  createResultsRoutes,
} = require('./exam/exam.routes');
const { createSdmsRoutes } = require('./sdms/sdms.routes');
const { createSettingsRoutes } = require('./settings/settings.routes');
const {
  createProfessionalsRoutes,
  createRemunerationRoutes,
} = require('./remuneration/remuneration.routes');
const { createUsersRoutes } = require('./auth/users.routes');

function createApp(services) {
  const app = express();
  const auth = createAuthMiddleware(services);
  const api = express.Router();

  app.use(requestLogger);
  app.use(helmet());
  app.use(compression());
  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
    }),
  );

  app.post(
    `/${config.apiPrefix}/fees/razorpay/webhook`,
    express.raw({ type: '*/*' }),
    asyncHandler(async (req, res) => {
      const raw = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(
            typeof req.body === 'string' ? req.body : JSON.stringify(req.body),
          );
      const signature = req.headers['x-razorpay-signature'];
      res.json(
        await services.exam.handleRazorpayWebhook(
          raw,
          typeof signature === 'string' ? signature : undefined,
        ),
      );
    }),
  );

  // Canara Dynamic QR payment callback (bank → EMS). Must stay public (no JWT).
  app.post(
    `/${config.apiPrefix}/fees/canara/qr-callback`,
    express.json({ limit: '1mb' }),
    asyncHandler(async (req, res) => {
      const result = await services.canaraQr.handleQrCallback(req.body);
      // Bank expects HTTP 200 and acknowledgment
      res.status(200).json({
        status: '200_OK',
        ...result,
      });
    }),
  );

  // Canara OAuth redirect (browser → EMS after bank login). Public GET.
  app.get(
    `/${config.apiPrefix}/fees/canara/oauth/callback`,
    asyncHandler(async (req, res) => {
      const code = String(req.query.code || '');
      const state = String(req.query.state || '');
      const result = await services.canaraQr.handleOauthCallback({
        code,
        state,
      });
      res
        .status(200)
        .type('html')
        .send(
          `<!doctype html><html><body style="font-family:sans-serif;padding:2rem">
           <h1>Canara OAuth connected</h1>
           <p>${result.message}</p>
           <p>You can close this window and return to EMS Settings.</p>
           </body></html>`,
        );
    }),
  );

  app.use(express.json({ limit: '1mb' }));

  api.post(
    '/auth/login',
    asyncHandler(async (req, res) => {
      res.json(await services.auth.login(req.body));
    }),
  );

  api.post(
    '/auth/student/login',
    asyncHandler(async (req, res) => {
      res.json(await services.auth.studentLogin(req.body));
    }),
  );

  api.get(
    '/fees/verify/:receiptNumber',
    asyncHandler(async (req, res) => {
      const tokenRaw = req.query.v;
      const token =
        typeof tokenRaw === 'string' && tokenRaw.trim()
          ? tokenRaw.trim()
          : undefined;
      res.json(
        await services.exam.verifyReceipt(
          decodeURIComponent(req.params.receiptNumber),
          token,
        ),
      );
    }),
  );

  api.use(auth);

  api.get(
    '/auth/me',
    asyncHandler(async (req, res) => {
      if (req.user?.role === 'student') {
        res.json({
          id: String(req.user.studentId),
          username: req.user.username,
          fullName: req.user.fullName ?? req.user.username,
          role: 'student',
          pinNo: req.user.pinNo,
          studentId: req.user.studentId,
        });
        return;
      }
      res.json({
        id: req.user.emsUserId
          ? String(req.user.emsUserId)
          : req.user.hrmsUserId,
        username: req.user.username,
        email: req.user.email || req.user.username,
        employeeNumber: req.user.employeeNumber ?? null,
        fullName: req.user.fullName,
        role: req.user.role,
        emsRoleId: req.user.emsRoleId ?? null,
        emsRoleName: req.user.emsRoleName ?? null,
        privileges: req.user.privileges ?? [],
        isSuperAdmin: !!req.user.isSuperAdmin,
        hrmsUserId: req.user.hrmsUserId,
        emsUserId: req.user.emsUserId ?? null,
      });
    }),
  );

  api.get(
    '/student/fees',
    asyncHandler(async (req, res) => {
      if (req.user?.role !== 'student' || !req.user.pinNo) {
        throw AppError.unauthorized('Student access only');
      }
      res.json(await services.exam.listFeeRecords(undefined, req.user.pinNo));
    }),
  );

  api.get(
    '/student/exams',
    asyncHandler(async (req, res) => {
      if (req.user?.role !== 'student' || !req.user.studentId) {
        throw AppError.unauthorized('Student access only');
      }
      res.json(await services.exam.listPublishedExamsForStudent(req.user.studentId));
    }),
  );

  api.get(
    '/student/exams/:id',
    asyncHandler(async (req, res) => {
      if (req.user?.role !== 'student' || !req.user.studentId) {
        throw AppError.unauthorized('Student access only');
      }
      res.json(
        await services.exam.getPublishedExamForStudent(
          parseInt(String(req.params.id), 10),
          req.user.studentId,
        ),
      );
    }),
  );

  api.post(
    '/student/exams/:id/applications',
    asyncHandler(async (req, res) => {
      if (req.user?.role !== 'student' || !req.user.studentId) {
        throw AppError.unauthorized('Student access only');
      }
      res.status(201).json(
        await services.exam.createStudentApplication(
          parseInt(String(req.params.id), 10),
          req.user.studentId,
          req.body,
        ),
      );
    }),
  );

  api.get(
    '/student/results',
    asyncHandler(async (req, res) => {
      if (req.user?.role !== 'student' || !req.user.studentId) {
        throw AppError.unauthorized('Student access only');
      }
      res.json(await services.results.getStudentResults(req.user.studentId));
    }),
  );

  api.get(
    '/student/hall-tickets',
    asyncHandler(async (req, res) => {
      if (req.user?.role !== 'student' || !req.user.studentId) {
        throw AppError.unauthorized('Student access only');
      }
      res.json(await services.exam.listHallTicketsForStudent(req.user.studentId));
    }),
  );

  api.get(
    '/student/hall-tickets/:applicationId',
    asyncHandler(async (req, res) => {
      if (req.user?.role !== 'student' || !req.user.studentId) {
        throw AppError.unauthorized('Student access only');
      }
      res.json(
        await services.exam.getHallTicketForStudent(
          parseInt(String(req.params.applicationId), 10),
          req.user.studentId,
        ),
      );
    }),
  );

  api.post(
    '/student/fees/:id/pay',
    asyncHandler(async (req, res) => {
      if (req.user?.role !== 'student' || !req.user.pinNo) {
        throw AppError.unauthorized('Student access only');
      }
      const feeId = parseInt(String(req.params.id), 10);
      res.status(201).json(
        await services.exam.createRazorpayOrder(feeId, {
          paymentMethod: req.body.paymentMethod ?? 'upi',
          actor: {
            role: 'student',
            pinNo: req.user.pinNo,
            username: req.user.username,
            fullName: req.user.fullName,
          },
        }),
      );
    }),
  );

  api.get(
    '/student/payments/:id',
    asyncHandler(async (req, res) => {
      if (req.user?.role !== 'student' || !req.user.pinNo) {
        throw AppError.unauthorized('Student access only');
      }
      const payment = await services.exam.getPayment(
        parseInt(String(req.params.id), 10),
      );
      const roll = payment.feeRecord?.studentRollNumber?.toLowerCase() ?? '';
      if (roll !== req.user.pinNo.toLowerCase()) {
        throw AppError.forbidden('Receipt not found for your account');
      }
      res.json(services.exam.withVerificationMeta(payment));
    }),
  );

  api.use('/regulations', createRegulationsRoutes(services));
  api.use('/subjects', createSubjectsRoutes(services));
  api.use('/subject-mappings', createSubjectMappingRoutes(services));
  api.use('/exams', createExamRoutes(services));
  api.use('/fees', createFeesRoutes(services));
  api.use('/results', createResultsRoutes(services));
  api.use('/sdms', createSdmsRoutes(services));
  api.use('/settings', createSettingsRoutes(services));
  api.use('/professionals', createProfessionalsRoutes(services));
  api.use('/remuneration', createRemunerationRoutes(services));
  api.use('/user-management', createUsersRoutes(services));

  app.use(`/${config.apiPrefix}`, api);
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
