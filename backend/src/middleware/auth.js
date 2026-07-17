'use strict';

const jwt = require('jsonwebtoken');
const { config } = require('../config');
const { AppError } = require('../common/errors');

function createAuthMiddleware(services) {
  return async (req, _res, next) => {
    try {
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) {
        throw AppError.unauthorized();
      }

      const token = header.slice(7);
      const payload = jwt.verify(token, config.jwt.secret);

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

module.exports = { createAuthMiddleware };
