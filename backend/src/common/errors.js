'use strict';

class AppError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }

  static badRequest(message) {
    return new AppError(400, message);
  }

  static unauthorized(message = 'Unauthorized') {
    return new AppError(401, message);
  }

  static forbidden(message = 'Forbidden') {
    return new AppError(403, message);
  }

  static notFound(message) {
    return new AppError(404, message);
  }

  static serviceUnavailable(message) {
    return new AppError(503, message);
  }
}

module.exports = { AppError };
