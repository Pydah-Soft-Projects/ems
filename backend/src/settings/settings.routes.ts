import { Router } from 'express';
import { asyncHandler } from '../common/asyncHandler';
import { AppError } from '../common/errors';
import type { Services } from '../database/container';

export function createSettingsRoutes(services: Services) {
  const router = Router();

  router.use((req, _res, next) => {
    if (req.user?.role === 'student') {
      next(AppError.forbidden('Settings are for staff only'));
      return;
    }
    next();
  });

  router.get(
    '/payments',
    asyncHandler(async (_req, res) => {
      res.json(await services.settings.getPaymentSettingsPublic());
    }),
  );

  router.put(
    '/payments',
    asyncHandler(async (req, res) => {
      res.json(await services.settings.updatePaymentSettings(req.body ?? {}));
    }),
  );

  return router;
}
