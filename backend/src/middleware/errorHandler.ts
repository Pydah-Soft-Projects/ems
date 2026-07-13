import { Request, Response, NextFunction } from 'express';
import { AppError } from '../common/errors';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
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
