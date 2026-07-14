import { Router } from 'express';
import { asyncHandler } from '../common/asyncHandler';
import type { Services } from '../database/container';
import { ExamStatus, FeeStatus } from './schemas/exam.enums';

function parseId(value: string) {
  return parseInt(value, 10);
}

export function createExamRoutes(services: Services) {
  const router = Router();

  router.post('/', asyncHandler(async (req, res) => {
    res.status(201).json(await services.exam.create(req.body));
  }));

  router.get('/', asyncHandler(async (req, res) => {
    const status = req.query.status as ExamStatus | undefined;
    res.json(await services.exam.findAll(status));
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    res.json(await services.exam.findOne(parseId(req.params.id)));
  }));

  router.patch('/:id', asyncHandler(async (req, res) => {
    res.json(await services.exam.update(parseId(req.params.id), req.body));
  }));

  router.post('/:id/submit', asyncHandler(async (req, res) => {
    res.json(await services.exam.submitForApproval(parseId(req.params.id)));
  }));

  router.post('/:id/approve', asyncHandler(async (req, res) => {
    res.json(
      await services.exam.approve(parseId(req.params.id), req.user!.username),
    );
  }));

  router.post('/:id/reject', asyncHandler(async (req, res) => {
    res.json(await services.exam.reject(parseId(req.params.id), req.body));
  }));

  router.post('/:id/publish', asyncHandler(async (req, res) => {
    res.json(await services.exam.publish(parseId(req.params.id), req.body));
  }));

  router.post('/:id/release-hall-tickets', asyncHandler(async (req, res) => {
    res.json(await services.exam.releaseHallTickets(parseId(req.params.id)));
  }));

  router.get('/:id/hall-tickets', asyncHandler(async (req, res) => {
    res.json(await services.exam.listHallTicketsForExam(parseId(req.params.id)));
  }));

  router.get(
    '/:id/hall-tickets/:applicationId',
    asyncHandler(async (req, res) => {
      res.json(
        await services.exam.getHallTicketForExam(
          parseId(req.params.id),
          parseId(req.params.applicationId),
        ),
      );
    }),
  );

  router.get('/:id/eligible-students', asyncHandler(async (req, res) => {
    res.json(await services.exam.listEligibleStudents(parseId(req.params.id)));
  }));

  router.get('/:id/analytics', asyncHandler(async (req, res) => {
    res.json(await services.exam.getExamAnalytics(parseId(req.params.id)));
  }));

  router.post('/:id/generate-fees', asyncHandler(async (req, res) => {
    res.json(await services.exam.generateFees(parseId(req.params.id), req.body));
  }));

  return router;
}

export function createFeesRoutes(services: Services) {
  const router = Router();

  router.get('/records', asyncHandler(async (req, res) => {
    const statusRaw = req.query.status as string | undefined;
    const status =
      statusRaw === FeeStatus.PENDING || statusRaw === FeeStatus.PAID
        ? statusRaw
        : undefined;
    res.json(
      await services.exam.listFeeRecords(
        req.query.examId ? parseInt(String(req.query.examId), 10) : undefined,
        req.query.rollNumber as string | undefined,
        status,
      ),
    );
  }));

  /** Fee collection desk — search by roll / PIN */
  router.get('/collection', asyncHandler(async (req, res) => {
    const rollNumber = String(req.query.rollNumber ?? '').trim();
    if (!rollNumber) {
      res.status(400).json({ message: 'rollNumber query parameter is required' });
      return;
    }
    res.json(await services.exam.lookupForCollection(rollNumber));
  }));

  router.get('/payments', asyncHandler(async (req, res) => {
    if (req.query.rollNumber) {
      res.json(
        await services.exam.listPaymentsByRoll(String(req.query.rollNumber)),
      );
      return;
    }
    res.json(
      await services.exam.listPayments(
        req.query.feeRecordId
          ? parseInt(String(req.query.feeRecordId), 10)
          : undefined,
      ),
    );
  }));

  router.get('/payments/:id', asyncHandler(async (req, res) => {
    const payment = await services.exam.getPayment(parseId(req.params.id));
    res.json(services.exam.withVerificationMeta(payment));
  }));

  router.post('/payments/:id/void', asyncHandler(async (req, res) => {
    if (req.user?.role === 'student') {
      res.status(403).json({ message: 'Staff only' });
      return;
    }
    res.json(
      await services.exam.voidPayment(parseId(req.params.id), {
        reason: req.body?.reason,
        voidedBy: req.user?.fullName || req.user?.username,
        voidedByUsername: req.user?.username,
      }),
    );
  }));

  router.post('/pay-offline', asyncHandler(async (req, res) => {
    if (req.user?.role === 'student') {
      res.status(403).json({ message: 'Staff only' });
      return;
    }
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
  }));

  router.get('/razorpay/status', asyncHandler(async (_req, res) => {
    res.json(await services.settings.getRazorpayStatus());
  }));

  router.post('/razorpay/order', asyncHandler(async (req, res) => {
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
  }));

  router.post('/razorpay/verify', asyncHandler(async (req, res) => {
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
  }));

  router.get('/payments/:id/status', asyncHandler(async (req, res) => {
    res.json(await services.exam.getPaymentStatus(parseId(req.params.id)));
  }));

  router.get('/records/:id', asyncHandler(async (req, res) => {
    res.json(await services.exam.getFeeRecord(parseId(req.params.id)));
  }));

  router.post('/records/:id/mark-unpaid', asyncHandler(async (req, res) => {
    if (req.user?.role === 'student') {
      res.status(403).json({ message: 'Staff only' });
      return;
    }
    res.json(
      await services.exam.markFeeUnpaid(parseId(req.params.id), {
        reason: req.body?.reason,
        voidedBy: req.user?.fullName || req.user?.username,
        voidedByUsername: req.user?.username,
      }),
    );
  }));

  router.post('/records/:id/pay-online', asyncHandler(async (req, res) => {
    // Rewired: creates Razorpay order instead of simulated instant pay
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
  }));

  return router;
}
