'use strict';

const { Router } = require('express');
const { asyncHandler } = require('../common/asyncHandler');
const { requireStaff, requirePrivilege } = require('../middleware/auth');
const { AppError } = require('../common/errors');

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

  router.get(
    '/canara/vpas',
    requirePrivilege('settings:payments'),
    asyncHandler(async (_req, res) => {
      res.json(await services.canaraVpas.listVpas());
    }),
  );

  router.post(
    '/canara/vpas',
    requirePrivilege('settings:payments'),
    asyncHandler(async (req, res) => {
      const payload = req.body ?? {};
      const sid = String(payload.sid || '').trim();
      if (!sid) {
        throw AppError.badRequest('sid is required');
      }
      const settings = await services.canaraSettings.getConfig({ requireLive: false });
      const created = await services.canaraVpas.createVpa({
        sid,
        name: payload.name || null,
        mobileNumber: payload.mobileNumber || null,
        additionalNumber: payload.additionalNumber || null,
        usedFor: payload.usedFor || null,
        status: 'PENDING',
      });
      const vpa = await services.canaraVpas.markInquiryResult(created.id, {
        status: 'PENDING',
        responseStatus: 'PENDING',
        responseMessage: 'VPA creation pending',
      });
      res.status(201).json({
        created: vpa,
        settings,
      });
    }),
  );

  router.post(
    '/canara/vpas/:id/activate',
    requirePrivilege('settings:payments'),
    asyncHandler(async (req, res) => {
      const id = parseInt(String(req.params.id), 10);
      res.json(await services.canaraVpas.setActiveVpa(id));
    }),
  );

  router.post(
    '/canara/vpas/:id/enquire',
    requirePrivilege('settings:payments'),
    asyncHandler(async (req, res) => {
      const id = parseInt(String(req.params.id), 10);
      res.json(await services.canaraVpas.inquireVpa(id));
    }),
  );

  router.delete(
    '/canara/vpas/:id',
    requirePrivilege('settings:payments'),
    asyncHandler(async (req, res) => {
      const id = parseInt(String(req.params.id), 10);
      res.json(await services.canaraVpas.deleteVpa(id));
    }),
  );

  return router;
}

module.exports = { createSettingsRoutes };
