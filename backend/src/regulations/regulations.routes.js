'use strict';

const { Router } = require('express');
const { asyncHandler } = require('../common/asyncHandler');
const { AppError } = require('../common/errors');
const { requireStaff, requirePrivilege } = require('../middleware/auth');

function parseId(value) {
  const id = parseInt(value, 10);
  if (isNaN(id)) throw new Error('Invalid id');
  return id;
}

function createRegulationsRoutes(services) {
  const router = Router();
  router.use(requireStaff);

  router.post(
    '/',
    requirePrivilege('regulations:write'),
    asyncHandler(async (req, res) => {
      res.status(201).json(await services.regulations.create(req.body, req.user));
    }),
  );

  router.get(
    '/',
    requirePrivilege('regulations:read'),
    asyncHandler(async (req, res) => {
      res.json(await services.regulations.findAll(req.user));
    }),
  );

  router.get(
    '/claimed-batches',
    requirePrivilege('regulations:read'),
    asyncHandler(async (req, res) => {
      const excludeId = req.query.excludeRegulationId
        ? parseInt(String(req.query.excludeRegulationId), 10)
        : undefined;
      res.json(
        await services.regulations.getClaimedBatches(
          excludeId && !isNaN(excludeId) ? excludeId : undefined,
        ),
      );
    }),
  );

  router.get(
    '/:id/detail',
    requirePrivilege('regulations:read'),
    asyncHandler(async (req, res) => {
      res.json(await services.regulations.getDetail(parseId(req.params.id), req.user));
    }),
  );

  router.get(
    '/:id/batch-insight',
    requirePrivilege('regulations:read'),
    asyncHandler(async (req, res) => {
      const batch = req.query.batch;
      const collegeId = parseInt(String(req.query.collegeId), 10);
      const courseId = parseInt(String(req.query.courseId), 10);
      if (!batch || isNaN(collegeId) || isNaN(courseId)) {
        throw AppError.badRequest('collegeId, courseId, and batch are required');
      }
      res.json(
        await services.regulations.getBatchInsight(parseId(req.params.id), {
          collegeId,
          courseId,
          batch,
        }),
      );
    }),
  );

  router.get(
    '/:id',
    requirePrivilege('regulations:read'),
    asyncHandler(async (req, res) => {
      res.json(await services.regulations.findOne(parseId(req.params.id), req.user));
    }),
  );

  router.patch(
    '/:id',
    requirePrivilege('regulations:write'),
    asyncHandler(async (req, res) => {
      res.json(await services.regulations.update(parseId(req.params.id), req.body, req.user));
    }),
  );

  router.delete(
    '/:id',
    requirePrivilege('regulations:delete'),
    asyncHandler(async (req, res) => {
      await services.regulations.remove(parseId(req.params.id));
      res.status(204).send();
    }),
  );

  return router;
}

module.exports = { createRegulationsRoutes };
