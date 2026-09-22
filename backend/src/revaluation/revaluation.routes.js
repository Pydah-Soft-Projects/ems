'use strict';

const { Router } = require('express');
const { asyncHandler } = require('../common/asyncHandler');
const { requireStaff, requirePrivilege } = require('../middleware/auth');

function parseId(value) {
  const parsed = parseInt(String(value), 10);
  if (!Number.isInteger(parsed)) throw new Error('Invalid id');
  return parsed;
}

function createRevaluationRoutes(services) {
  const router = Router();
  router.use(requireStaff);

  router.get('/', requirePrivilege('revaluations:read'), asyncHandler(async (_req, res) => {
    res.json(await services.revaluation.list());
  }));
  router.post('/subjects', requirePrivilege('revaluations:read'), asyncHandler(async (req, res) => {
    res.json(await services.revaluation.getMappedSubjects(Number(req.body?.regulationId), req.body?.selectedScopes, req.body?.selectedYearSemesters));
  }));
  router.get('/student/:id', requirePrivilege('revaluations:collect'), asyncHandler(async (req, res) => {
    res.json(await services.revaluation.getStudent(parseId(req.params.id), req.query.identifier));
  }));
  router.get('/:id', requirePrivilege('revaluations:read'), asyncHandler(async (req, res) => {
    res.json(await services.revaluation.get(parseId(req.params.id)));
  }));
  router.get('/:id/applications', requirePrivilege('revaluations:read'), asyncHandler(async (req, res) => {
    res.json(await services.revaluation.listApplications(parseId(req.params.id)));
  }));
  router.get('/:id/students', requirePrivilege('revaluations:collect'), asyncHandler(async (req, res) => {
    res.json(await services.revaluation.listEligibleStudents(parseId(req.params.id)));
  }));
  router.post('/', requirePrivilege('revaluations:write'), asyncHandler(async (req, res) => {
    res.status(201).json(await services.revaluation.save(req.body, req.user));
  }));
  router.patch('/:id', requirePrivilege('revaluations:write'), asyncHandler(async (req, res) => {
    res.json(await services.revaluation.save(req.body, req.user, parseId(req.params.id)));
  }));
  router.post('/:id/applications', requirePrivilege('revaluations:collect'), asyncHandler(async (req, res) => {
    res.status(201).json(await services.revaluation.apply(parseId(req.params.id), req.body));
  }));
  return router;
}

module.exports = { createRevaluationRoutes };
