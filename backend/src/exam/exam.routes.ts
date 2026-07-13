import { Router } from 'express';
import { asyncHandler } from '../common/asyncHandler';
import type { Services } from '../database/container';
import { ExamStatus } from './schemas/exam.enums';

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

  router.post('/:id/generate-fees', asyncHandler(async (req, res) => {
    res.json(await services.exam.generateFees(parseId(req.params.id), req.body));
  }));

  return router;
}

export function createFeesRoutes(services: Services) {
  const router = Router();

  router.get('/records', asyncHandler(async (req, res) => {
    res.json(
      await services.exam.listFeeRecords(
        req.query.examId ? parseInt(String(req.query.examId), 10) : undefined,
        req.query.rollNumber as string | undefined,
      ),
    );
  }));

  router.get('/payments', asyncHandler(async (req, res) => {
    res.json(
      await services.exam.listPayments(
        req.query.feeRecordId
          ? parseInt(String(req.query.feeRecordId), 10)
          : undefined,
      ),
    );
  }));

  router.post('/pay-offline', asyncHandler(async (req, res) => {
    res.json(await services.exam.payOffline(req.body));
  }));

  router.get('/records/:id', asyncHandler(async (req, res) => {
    res.json(await services.exam.getFeeRecord(parseId(req.params.id)));
  }));

  router.post('/records/:id/pay-online', asyncHandler(async (req, res) => {
    res.json(
      await services.exam.payOnline(parseId(req.params.id), req.body),
    );
  }));

  return router;
}
