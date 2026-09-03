'use strict';

const { Router } = require('express');
const { asyncHandler } = require('../common/asyncHandler');
const { requireStaff, requirePrivilege } = require('../middleware/auth');

function parseId(value) {
  return parseInt(value, 10);
}

function createSubjectsRoutes(services) {
  const router = Router();
  router.use(requireStaff);

  router.get(
    '/types',
    requirePrivilege('subjects:read'),
    asyncHandler(async (req, res) => {
      const activeOnly = String(req.query.activeOnly ?? '') === 'true';
      res.json(
        activeOnly
          ? await services.subjects.findActiveSubjectTypes()
          : await services.subjects.findAllSubjectTypes(),
      );
    }),
  );
  router.post(
    '/types',
    requirePrivilege('subjects:write'),
    asyncHandler(async (req, res) => {
      res.status(201).json(await services.subjects.createSubjectType(req.body));
    }),
  );
  router.patch(
    '/types/:id',
    requirePrivilege('subjects:write'),
    asyncHandler(async (req, res) => {
      res.json(
        await services.subjects.updateSubjectType(parseId(req.params.id), req.body),
      );
    }),
  );
  router.get(
    '/types/:id/usage',
    requirePrivilege('subjects:read'),
    asyncHandler(async (req, res) => {
      res.json(await services.subjects.findSubjectTypeUsage(parseId(req.params.id)));
    }),
  );
  router.post(
    '/types/:id/reassign',
    requirePrivilege('subjects:write'),
    asyncHandler(async (req, res) => {
      res.json(
        await services.subjects.reassignSubjectType(parseId(req.params.id), req.body),
      );
    }),
  );
  router.delete(
    '/types/:id',
    requirePrivilege('subjects:delete'),
    asyncHandler(async (req, res) => {
      await services.subjects.removeSubjectType(parseId(req.params.id));
      res.status(204).send();
    }),
  );

  router.post(
    '/',
    requirePrivilege('subjects:write'),
    asyncHandler(async (req, res) => {
      res.status(201).json(await services.subjects.create(req.body));
    }),
  );
  router.get(
    '/',
    requirePrivilege('subjects:read'),
    asyncHandler(async (req, res) => {
      const regulationId = req.query.regulationId
        ? parseInt(String(req.query.regulationId), 10)
        : undefined;
      res.json(await services.subjects.findAll(regulationId));
    }),
  );
  router.get(
    '/:id',
    requirePrivilege('subjects:read'),
    asyncHandler(async (req, res) => {
      res.json(await services.subjects.findOne(parseId(req.params.id)));
    }),
  );
  router.patch(
    '/:id',
    requirePrivilege('subjects:write'),
    asyncHandler(async (req, res) => {
      res.json(await services.subjects.update(parseId(req.params.id), req.body));
    }),
  );
  router.delete(
    '/:id',
    requirePrivilege('subjects:delete'),
    asyncHandler(async (req, res) => {
      await services.subjects.remove(parseId(req.params.id));
      res.status(204).send();
    }),
  );
  return router;
}

function createSubjectMappingRoutes(services) {
  const router = Router();
  router.use(requireStaff);

  router.post(
    '/',
    requirePrivilege('mappings:write'),
    asyncHandler(async (req, res) => {
      res.status(201).json(await services.subjects.createMapping(req.body));
    }),
  );
  router.put(
    '/scope',
    requirePrivilege('mappings:write'),
    asyncHandler(async (req, res) => {
      res.json(await services.subjects.replaceScopeMapping(req.body));
    }),
  );
  router.get(
    '/',
    requirePrivilege('mappings:read'),
    asyncHandler(async (req, res) => {
      res.json(
        await services.subjects.findAllMappings({
          regulationId: req.query.regulationId
            ? parseInt(String(req.query.regulationId), 10)
            : undefined,
          course: req.query.course,
          branch: req.query.branch,
          batch: req.query.batch,
          yearOfStudy: req.query.yearOfStudy
            ? parseInt(String(req.query.yearOfStudy), 10)
            : undefined,
          semester: req.query.semester
            ? parseInt(String(req.query.semester), 10)
            : undefined,
        }),
      );
    }),
  );
  router.get(
    '/:id',
    requirePrivilege('mappings:read'),
    asyncHandler(async (req, res) => {
      res.json(await services.subjects.findMapping(parseId(req.params.id)));
    }),
  );
  router.patch(
    '/:id',
    requirePrivilege('mappings:write'),
    asyncHandler(async (req, res) => {
      res.json(
        await services.subjects.updateMapping(parseId(req.params.id), req.body),
      );
    }),
  );
  router.delete(
    '/:id',
    requirePrivilege('mappings:delete'),
    asyncHandler(async (req, res) => {
      await services.subjects.removeMapping(parseId(req.params.id));
      res.status(204).send();
    }),
  );
  return router;
}

module.exports = { createSubjectsRoutes, createSubjectMappingRoutes };
