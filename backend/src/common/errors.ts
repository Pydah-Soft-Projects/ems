export class AppError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }

  static badRequest(message: string) {
    return new AppError(400, message);
  }

  static unauthorized(message = 'Unauthorized') {
    return new AppError(401, message);
  }

  static forbidden(message = 'Forbidden') {
    return new AppError(403, message);
  }

  static notFound(message: string) {
    return new AppError(404, message);
  }

  static serviceUnavailable(message: string) {
    return new AppError(503, message);
  }
}
