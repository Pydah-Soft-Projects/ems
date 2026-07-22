'use strict';

const { AppError } = require('../common/errors');

function errorHandler(err, req, res, _next) {
  const context = {
    event: 'http.request.error',
    requestId: req.id,
    method: req.method,
    path: req.path,
    statusCode: err instanceof AppError ? err.statusCode : 500,
    actor: req.user
      ? {
          userId:
            req.user.emsUserId ||
            req.user.studentId ||
            req.user.hrmsUserId ||
            req.user.sub,
          email: req.user.email || req.user.username,
          role: req.user.emsRoleName || req.user.role,
        }
      : undefined,
  };

  if (err instanceof AppError) {
    const log = err.statusCode >= 500 ? req.log?.error : req.log?.warn;
    log?.call(req.log, { ...context, err }, err.message);
    return res.status(err.statusCode).json({
      statusCode: err.statusCode,
      message: err.message,
      error:
        err.statusCode === 400
          ? 'Bad Request'
          : err.statusCode === 401
            ? 'Unauthorized'
            : err.statusCode === 404
              ? 'Not Found'
              : 'Error',
    });
  }

  req.log?.error({ ...context, err }, 'Unhandled request error');
  return res.status(500).json({
    statusCode: 500,
    message: 'Internal server error',
    error: 'Internal Server Error',
  });
}

module.exports = { errorHandler };
