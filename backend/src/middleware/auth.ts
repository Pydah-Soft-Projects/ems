import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AppError } from '../common/errors';
import { AuthUser } from '../common/types';
import type { Services } from '../database/container';

export function createAuthMiddleware(services: Services) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) {
        throw AppError.unauthorized();
      }

      const token = header.slice(7);
      const payload = jwt.verify(token, config.jwt.secret) as AuthUser;

      if (payload.role === 'student') {
        if (!payload.pinNo || !payload.studentId) {
          throw AppError.unauthorized();
        }
        req.user = payload;
        return next();
      }

      const user = await services.auth.validateUser(payload.sub);
      if (!user) throw AppError.unauthorized();

      req.user = payload;
      next();
    } catch (err) {
      if (err instanceof AppError) return next(err);
      next(AppError.unauthorized('Invalid or expired token'));
    }
  };
}
