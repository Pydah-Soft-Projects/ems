'use strict';

const { Router } = require('express');
const { asyncHandler } = require('../common/asyncHandler');
const { requireStaff, requirePrivilege } = require('../middleware/auth');

function createFeeHeadsRoutes(services) {
  const router = Router();
  router.use(requireStaff);

  router.get(
    '/',
    requirePrivilege('fees:read', 'fees:write', 'fees:collect'),
    asyncHandler(async (req, res) => {
      const heads = await services.feeHeads.findAll({
        search: req.query.search,
        type: req.query.type,
        isActive: req.query.isActive,
      });
      res.json(heads);
    }),
  );

  router.get(
    '/:id',
    requirePrivilege('fees:read', 'fees:write'),
    asyncHandler(async (req, res) => {
      const head = await services.feeHeads.findOne(req.params.id);
      res.json(head);
    }),
  );

  router.post(
    '/',
    requirePrivilege('fees:write', 'fees:read'),
    asyncHandler(async (req, res) => {
      const created = await services.feeHeads.create(req.body);
      res.status(201).json(created);
    }),
  );

  router.patch(
    '/:id',
    requirePrivilege('fees:write', 'fees:read'),
    asyncHandler(async (req, res) => {
      const updated = await services.feeHeads.update(req.params.id, req.body);
      res.json(updated);
    }),
  );

  router.delete(
    '/:id',
    requirePrivilege('fees:write'),
    asyncHandler(async (req, res) => {
      const result = await services.feeHeads.remove(req.params.id);
      res.json(result);
    }),
  );

  router.post(
    '/resolve',
    requirePrivilege('fees:read', 'fees:collect'),
    asyncHandler(async (req, res) => {
      const { headId, regulationCode } = req.body;
      const result = await services.feeHeads.resolveAmount(headId, regulationCode);
      res.json(result);
    }),
  );

  router.post(
    '/apply',
    requirePrivilege('fees:collect', 'fees:write'),
    asyncHandler(async (req, res) => {
      const { feeRecordId, headId, regulationCode, customAmount, studentRollNumber, studentName } = req.body;
      const record = await services.feeHeads.applyFeeHeadToRecord(
        feeRecordId ? parseInt(String(feeRecordId), 10) : null,
        headId,
        regulationCode,
        customAmount,
        studentRollNumber,
        studentName,
      );
      res.json(record);
    }),
  );

  return router;
}

module.exports = { createFeeHeadsRoutes };
