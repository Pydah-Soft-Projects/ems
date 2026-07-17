'use strict';

const { AppError } = require('../common/errors');

function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
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

  console.error(err);
  return res.status(500).json({
    statusCode: 500,
    message: 'Internal server error',
    error: 'Internal Server Error',
  });
}

module.exports = { errorHandler };
