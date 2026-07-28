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

  router.get(
    '/canara-upi',
    requirePrivilege('settings:payments'),
    asyncHandler(async (_req, res) => {
      res.json(await services.canaraUpiSettings.getPublicActive());
    }),
  );

  router.get(
    '/canara-upi/versions',
    requirePrivilege('settings:payments'),
    asyncHandler(async (req, res) => {
      res.json(
        await services.canaraUpiSettings.listVersionsPublic({
          take: req.query?.take,
        }),
      );
    }),
  );

  router.put(
    '/canara-upi',
    requirePrivilege('settings:payments'),
    asyncHandler(async (req, res) => {
      const userId = req.user?.id ?? req.user?.userId ?? null;
      res.json(
        await services.canaraUpiSettings.saveNewVersion(req.body ?? {}, {
          userId,
        }),
      );
    }),
  );

  return router;
}

module.exports = { createSettingsRoutes };
