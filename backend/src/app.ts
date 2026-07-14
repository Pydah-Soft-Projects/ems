import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import { createAuthMiddleware } from './middleware/auth';
import { asyncHandler } from './common/asyncHandler';
import { AppError } from './common/errors';
import type { Services } from './database/container';
import { createRegulationsRoutes } from './regulations/regulations.routes';
import {
  createSubjectsRoutes,
  createSubjectMappingRoutes,
} from './subjects/subjects.routes';
import { createExamRoutes, createFeesRoutes } from './exam/exam.routes';
import { createSdmsRoutes } from './sdms/sdms.routes';
import { createSettingsRoutes } from './settings/settings.routes';

export function createApp(services: Services) {
  const app = express();
  const auth = createAuthMiddleware(services);
  const api = express.Router();

  app.use(helmet());
  app.use(compression());
  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
    }),
  );

  // Razorpay webhook needs raw body for signature verification (before JSON parser)
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

  app.use(express.json({ limit: '1mb' }));

  // Public login
  api.post(
    '/auth/login',
    asyncHandler(async (req, res) => {
      const result = await services.auth.login(req.body);
      res.json(result);
    }),
  );

  api.post(
    '/auth/student/login',
    asyncHandler(async (req, res) => {
      const result = await services.auth.studentLogin(req.body);
      res.json(result);
    }),
  );

  /** Public receipt verification (QR scan landing) */
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

  // Protected routes
  api.use(auth);
  api.get('/auth/me', asyncHandler(async (req, res) => {
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
    res.json(req.user);
  }));

  // Student portal — own fees only
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
      res.json(
        await services.exam.listPublishedExamsForStudent(req.user.studentId),
      );
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
    '/student/hall-tickets',
    asyncHandler(async (req, res) => {
      if (req.user?.role !== 'student' || !req.user.studentId) {
        throw AppError.unauthorized('Student access only');
      }
      res.json(
        await services.exam.listHallTicketsForStudent(req.user.studentId),
      );
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
      // Creates Razorpay order (Checkout); verify separately
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
      const roll =
        payment.feeRecord?.studentRollNumber?.toLowerCase() ?? '';
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
  api.use('/sdms', createSdmsRoutes(services));
  api.use('/settings', createSettingsRoutes(services));

  app.use(`/${config.apiPrefix}`, api);
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.use(errorHandler);

  return app;
}
