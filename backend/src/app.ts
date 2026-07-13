import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import { createAuthMiddleware } from './middleware/auth';
import { asyncHandler } from './common/asyncHandler';
import type { Services } from './database/container';
import { createRegulationsRoutes } from './regulations/regulations.routes';
import {
  createSubjectsRoutes,
  createSubjectMappingRoutes,
} from './subjects/subjects.routes';
import { createExamRoutes, createFeesRoutes } from './exam/exam.routes';
import { createSdmsRoutes } from './sdms/sdms.routes';

export function createApp(services: Services) {
  const app = express();
  const auth = createAuthMiddleware(services);
  const api = express.Router();

  app.use(helmet());
  app.use(compression());
  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  // Public login
  api.post(
    '/auth/login',
    asyncHandler(async (req, res) => {
      const result = await services.auth.login(req.body);
      res.json(result);
    }),
  );

  // Protected routes
  api.use(auth);
  api.get('/auth/me', (req, res) => res.json(req.user));
  api.use('/regulations', createRegulationsRoutes(services));
  api.use('/subjects', createSubjectsRoutes(services));
  api.use('/subject-mappings', createSubjectMappingRoutes(services));
  api.use('/exams', createExamRoutes(services));
  api.use('/fees', createFeesRoutes(services));
  api.use('/sdms', createSdmsRoutes(services));

  app.use(`/${config.apiPrefix}`, api);
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.use(errorHandler);

  return app;
}
