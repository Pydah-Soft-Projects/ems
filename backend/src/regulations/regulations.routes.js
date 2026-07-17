'use strict';

const { Router } = require('express');
const { asyncHandler } = require('../common/asyncHandler');
const { AppError } = require('../common/errors');

function parseId(value) {
  const id = parseInt(value, 10);
  if (isNaN(id)) throw new Error('Invalid id');
  return id;
}

function createRegulationsRoutes(services) {
  const router = Router();

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      res.status(201).json(await services.regulations.create(req.body));
    }),
  );

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      res.json(await services.regulations.findAll());
    }),
  );

  router.get(
    '/claimed-batches',
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
    asyncHandler(async (req, res) => {
      res.json(await services.regulations.getDetail(parseId(req.params.id)));
    }),
  );

  router.get(
    '/:id/batch-insight',
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
    asyncHandler(async (req, res) => {
      res.json(await services.regulations.findOne(parseId(req.params.id)));
    }),
  );

  router.patch(
    '/:id',
    asyncHandler(async (req, res) => {
      res.json(await services.regulations.update(parseId(req.params.id), req.body));
    }),
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      await services.regulations.remove(parseId(req.params.id));
      res.status(204).send();
    }),
  );

  return router;
}

module.exports = { createRegulationsRoutes };
