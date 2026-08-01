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

  /** Dedicated Canara settings — table: canara_payment_settings (NOT payment_gateway_settings) */
  router.get(
    '/canara',
    requirePrivilege('settings:payments'),
    asyncHandler(async (_req, res) => {
      res.json(await services.canaraSettings.getCanaraSettingsPublic());
    }),
  );

  router.put(
    '/canara',
    requirePrivilege('settings:payments'),
    asyncHandler(async (req, res) => {
      res.json(
        await services.canaraSettings.updateSettings(req.body ?? {}),
      );
    }),
  );

  return router;
}

module.exports = { createSettingsRoutes };
