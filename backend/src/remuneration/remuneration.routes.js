'use strict';

const { Router } = require('express');
const { asyncHandler } = require('../common/asyncHandler');
const { requireStaff, requirePrivilege } = require('../middleware/auth');

function parseId(value) {
  return parseInt(value, 10);
}

function createProfessionalsRoutes(services) {
  const router = Router();
  router.use(requireStaff);

  router.get(
    '/',
    requirePrivilege('professionals:read'),
    asyncHandler(async (req, res) => {
      res.json(
        await services.professionals.findAll({
          search: req.query.search,
          limit: req.query.limit,
        }),
      );
    }),
  );

  router.get(
    '/suggest',
    requirePrivilege('professionals:read', 'remuneration:write'),
    asyncHandler(async (req, res) => {
      res.json(
        await services.professionals.suggest(
          req.query.q || req.query.search,
          req.query.limit ? parseInt(String(req.query.limit), 10) : 10,
        ),
      );
    }),
  );

  router.get(
    '/:id',
    requirePrivilege('professionals:read'),
    asyncHandler(async (req, res) => {
      res.json(await services.professionals.findOne(parseId(req.params.id)));
    }),
  );

  router.post(
    '/',
    requirePrivilege('professionals:write'),
    asyncHandler(async (req, res) => {
      res.status(201).json(await services.professionals.create(req.body));
    }),
  );

  router.patch(
    '/:id',
    requirePrivilege('professionals:write'),
    asyncHandler(async (req, res) => {
      res.json(
        await services.professionals.update(parseId(req.params.id), req.body),
      );
    }),
  );

  router.delete(
    '/:id',
    requirePrivilege('professionals:write'),
    asyncHandler(async (req, res) => {
      await services.professionals.remove(parseId(req.params.id));
      res.status(204).send();
    }),
  );

  return router;
}

function createRemunerationRoutes(services) {
  const router = Router();
  router.use(requireStaff);

  router.get(
    '/meta',
    requirePrivilege('remuneration:read', 'remuneration:write'),
    asyncHandler(async (_req, res) => {
      res.json(services.remuneration.meta());
    }),
  );

  router.post(
    '/simulate',
    requirePrivilege('remuneration:write'),
    asyncHandler(async (req, res) => {
      res.status(201).json(
        await services.remuneration.simulateForPresentExams(req.user),
      );
    }),
  );

  router.get(
    '/exam-subjects/:examId',
    requirePrivilege('remuneration:read', 'remuneration:write'),
    asyncHandler(async (req, res) => {
      res.json(
        await services.remuneration.subjectsForExam(
          parseId(req.params.examId),
          req.query.branch,
        ),
      );
    }),
  );

  router.get(
    '/exam-branches/:examId',
    requirePrivilege('remuneration:read', 'remuneration:write'),
    asyncHandler(async (req, res) => {
      res.json(
        await services.remuneration.branchesForExam(parseId(req.params.examId)),
      );
    }),
  );

  router.get(
    '/',
    requirePrivilege('remuneration:read'),
    asyncHandler(async (req, res) => {
      res.json(
        await services.remuneration.findAll({
          examId: req.query.examId,
          billType: req.query.billType,
          status: req.query.status,
          search: req.query.search,
        }),
      );
    }),
  );

  router.get(
    '/:id',
    requirePrivilege('remuneration:read'),
    asyncHandler(async (req, res) => {
      res.json(await services.remuneration.findOne(parseId(req.params.id)));
    }),
  );

  router.post(
    '/',
    requirePrivilege('remuneration:write'),
    asyncHandler(async (req, res) => {
      res.status(201).json(
        await services.remuneration.create(req.body, req.user),
      );
    }),
  );

  router.patch(
    '/:id',
    requirePrivilege('remuneration:write'),
    asyncHandler(async (req, res) => {
      res.json(
        await services.remuneration.update(
          parseId(req.params.id),
          req.body,
          req.user,
        ),
      );
    }),
  );

  router.post(
    '/:id/status',
    requirePrivilege('remuneration:write'),
    asyncHandler(async (req, res) => {
      res.json(
        await services.remuneration.updateStatus(
          parseId(req.params.id),
          req.body.status,
          req.user,
        ),
      );
    }),
  );

  router.delete(
    '/:id',
    requirePrivilege('remuneration:delete'),
    asyncHandler(async (req, res) => {
      await services.remuneration.remove(parseId(req.params.id));
      res.status(204).send();
    }),
  );

  return router;
}

module.exports = {
  createProfessionalsRoutes,
  createRemunerationRoutes,
};
