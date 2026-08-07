'use strict';

const { randomUUID } = require('node:crypto');
const pino = require('pino');
const { config } = require('../config');

const SENSITIVE_KEY =
  /password|passcode|token|secret|signature|authorization|cookie|card|cvv|credential|private.?key/i;

function formatStructured(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return trimmed;
    }
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

function sanitize(value, depth = 0) {
  if (value == null || depth > 6) return value;
  if (Buffer.isBuffer(value)) return `[Buffer ${value.length} bytes]`;
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitize(item, depth + 1));
  }
  if (typeof value !== 'object') return value;

  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) {
      output[key] = '[REDACTED]';
      continue;
    }
    output[key] = sanitize(item, depth + 1);
  }
  return output;
}

const logger = pino({
  name: 'ems-backend',
  level: config.logging?.level || 'info',
  base: {
    service: 'ems-backend',
    environment: config.env,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'password',
      '*.password',
      'req.headers.authorization',
      'req.headers.cookie',
      'authorization',
      'cookie',
      'token',
      '*.token',
      'secret',
      '*.secret',
      'signature',
      '*.signature',
    ],
    censor: '[REDACTED]',
  },
  serializers: {
    err: pino.stdSerializers.err,
  },
});

function requestLogger(req, res, next) {
  const requestId =
    String(req.headers['x-request-id'] || '').trim() || randomUUID();
  const startedAt = process.hrtime.bigint();

  req.id = requestId;
  res.setHeader('x-request-id', requestId);
  req.log = logger.child({ requestId });

  res.on('finish', () => {
    const durationMs =
      Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const actor = req.user
      ? {
          userId:
            req.user.emsUserId ||
            req.user.studentId ||
            req.user.hrmsUserId ||
            req.user.sub,
          email: req.user.email || req.user.username,
          role: req.user.emsRoleName || req.user.role,
        }
      : undefined;
    const entry = {
      event: 'http.request.completed',
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      ip: req.ip,
      actor,
      query: sanitize(req.query),
      body:
        ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) &&
        !req.path.includes('/razorpay/webhook')
          ? sanitize(req.body)
          : undefined,
      requestSummary: formatStructured(sanitize(req.body)),
      responseSummary: undefined,
    };

    if (res.locals?.responsePayload) {
      entry.responseSummary = formatStructured(res.locals.responsePayload);
    }

    if (res.statusCode >= 500) {
      req.log.error(entry, 'Request failed');
    } else if (res.statusCode >= 400) {
      req.log.warn(entry, 'Request rejected');
    } else {
      req.log.info(entry, 'Request completed');
    }
  });

  next();
}

function operationLogger(scope) {
  return logger.child({ scope });
}

module.exports = {
  logger,
  sanitize,
  requestLogger,
  operationLogger,
};
