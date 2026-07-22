'use strict';

const { Router } = require('express');
const { asyncHandler } = require('../common/asyncHandler');
const { requireStaff, requirePrivilege } = require('../middleware/auth');

function createSettingsRoutes(services) {
  const router = Router();
  router.use(requireStaff);

  router.get(
    '/payments',
    requirePrivilege('settings:payments'),
    asyncHandler(async (_req, res) => {
      res.json(await services.settings.getPaymentSettingsPublic());
    }),
  );

  router.put(
    '/payments',
    requirePrivilege('settings:payments'),
    asyncHandler(async (req, res) => {
      res.json(await services.settings.updatePaymentSettings(req.body ?? {}));
    }),
  );

  return router;
}

module.exports = { createSettingsRoutes };
