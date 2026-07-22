'use strict';

const jwt = require('jsonwebtoken');
const { config } = require('../config');
const { AppError } = require('../common/errors');
const { hasPrivilege, hasAnyPrivilege } = require('../auth/permissions');

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

      const access = await services.auth.validateStaffAccess(
        payload.sub,
        payload.hrmsSource || 'user',
      );
      if (!access) throw AppError.unauthorized();

      req.user = {
        ...services.auth.buildStaffPayload(access),
        // Keep original JWT fields that clients may rely on
        iat: payload.iat,
        exp: payload.exp,
      };
      next();
    } catch (err) {
      if (err instanceof AppError) return next(err);
      next(AppError.unauthorized('Invalid or expired token'));
    }
  };
}

function requireStaff(req, _res, next) {
  if (req.user?.role === 'student') {
    req.log?.warn(
      {
        event: 'authorization.denied',
        reason: 'staff_required',
        studentId: req.user.studentId,
      },
      'Staff access denied',
    );
    return next(AppError.forbidden('Staff access only'));
  }
  if (!req.user?.hrmsUserId && req.user?.role !== 'super_admin' && req.user?.role !== 'staff') {
    return next(AppError.forbidden('Staff access only'));
  }
  next();
}

function requirePrivilege(...keys) {
  const required = keys.flat().filter(Boolean);
  return (req, _res, next) => {
    if (req.user?.role === 'student') {
      req.log?.warn(
        {
          event: 'authorization.denied',
          reason: 'staff_required',
          requiredPrivileges: required,
          studentId: req.user.studentId,
        },
        'Privilege check denied',
      );
      return next(AppError.forbidden('Staff access only'));
    }
    if (req.user?.isSuperAdmin) return next();
    if (hasAnyPrivilege(req.user?.privileges, required)) return next();
    req.log?.warn(
      {
        event: 'authorization.denied',
        reason: 'missing_privilege',
        requiredPrivileges: required,
        userId: req.user?.emsUserId || req.user?.hrmsUserId,
        email: req.user?.email || req.user?.username,
        role: req.user?.emsRoleName || req.user?.role,
      },
      'Privilege check denied',
    );
    return next(
      AppError.forbidden(
        required.length === 1
          ? `Missing privilege: ${required[0]}`
          : `Missing one of privileges: ${required.join(', ')}`,
      ),
    );
  };
}

function requireAllPrivileges(...keys) {
  const required = keys.flat().filter(Boolean);
  return (req, _res, next) => {
    if (req.user?.role === 'student') {
      return next(AppError.forbidden('Staff access only'));
    }
    if (req.user?.isSuperAdmin) return next();
    const ok = required.every((k) => hasPrivilege(req.user?.privileges, k));
    if (ok) return next();
    return next(AppError.forbidden(`Missing privileges: ${required.join(', ')}`));
  };
}

module.exports = {
  createAuthMiddleware,
  requireStaff,
  requirePrivilege,
  requireAllPrivileges,
};
