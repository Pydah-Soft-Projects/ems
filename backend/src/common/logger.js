'use strict';

const { randomUUID } = require('node:crypto');
const { Writable } = require('node:stream');
const pino = require('pino');
const { config } = require('../config');

// Suppress noisy experimental warnings (such as Node 22 CJS loading ESM jose)
const originalEmitWarning = process.emitWarning;
process.emitWarning = function (warning, ...args) {
  if (typeof warning === 'string' && (warning.includes('loading ES Module') || warning.includes('ExperimentalWarning'))) {
    return;
  }
  if (warning && typeof warning === 'object' && warning.name === 'ExperimentalWarning') {
    return;
  }
  return originalEmitWarning.call(process, warning, ...args);
};

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

/**
 * Clean, readable console stream for development.
 * Automatically formats JSON logs into concise, human-friendly colorized lines.
 */
function createDevelopmentStream() {
  const levelLabels = {
    10: '\x1b[90mTRACE\x1b[0m',
    20: '\x1b[36mDEBUG\x1b[0m',
    30: '\x1b[32mINFO \x1b[0m',
    40: '\x1b[33mWARN \x1b[0m',
    50: '\x1b[31mERROR\x1b[0m',
    60: '\x1b[41mFATAL\x1b[0m',
  };

  return new Writable({
    write(chunk, _encoding, callback) {
      try {
        const obj = JSON.parse(chunk.toString('utf8'));
        const time = obj.time ? new Date(obj.time).toLocaleTimeString('en-GB') : '';
        const level = levelLabels[obj.level] || '\x1b[32mINFO \x1b[0m';

        // Clean HTTP request logging
        if (obj.event === 'http.request.completed') {
          const method = String(obj.method || '').toUpperCase();
          const path = obj.path || '';
          const status = obj.statusCode || 200;
          const duration = obj.durationMs != null ? `${obj.durationMs}ms` : '';

          let statusColor = '\x1b[32m'; // green 2xx
          if (status >= 500) statusColor = '\x1b[31m'; // red 5xx
          else if (status >= 400) statusColor = '\x1b[33m'; // yellow 4xx
          else if (status >= 300) statusColor = '\x1b[36m'; // cyan 3xx

          const actor = obj.actor?.email
            ? ` \x1b[90m— ${obj.actor.email} [${obj.actor.role || 'user'}]\x1b[0m`
            : '';

          process.stdout.write(
            `\x1b[90m[${time}]\x1b[0m \x1b[1m${method.padEnd(6)}\x1b[0m ${path} ${statusColor}${status}\x1b[0m \x1b[90m(${duration})\x1b[0m${actor}\n`
          );
          callback();
          return;
        }

        // Clean general system and dependency events
        const msg = obj.msg || obj.message || obj.event || '';
        const details = [];
        if (obj.database) details.push(obj.database);
        if (obj.baseUrl) details.push(obj.baseUrl);
        if (obj.signal) details.push(`signal: ${obj.signal}`);
        if (obj.scope) details.push(`[${obj.scope}]`);
        const detailSuffix = details.length ? ` \x1b[90m(${details.join(', ')})\x1b[0m` : '';
        const errorStack = obj.err?.stack ? `\n\x1b[31m${obj.err.stack}\x1b[0m` : '';

        process.stdout.write(
          `\x1b[90m[${time}]\x1b[0m ${level} ${msg}${detailSuffix}${errorStack}\n`
        );
      } catch {
        process.stdout.write(chunk);
      }
      callback();
    },
  });
}

const isProduction = (config.env || process.env.NODE_ENV) === 'production';
const useJsonLogs = process.env.LOG_FORMAT === 'json' || isProduction;

const logStream = useJsonLogs ? process.stdout : createDevelopmentStream();

const logger = pino(
  {
    name: 'ems-backend',
    level: config.logging?.level || 'info',
    base: isProduction
      ? {
          service: 'ems-backend',
          environment: config.env,
        }
      : undefined,
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
  },
  logStream,
);

function requestLogger(req, res, next) {
  // Skip noisy CORS OPTIONS preflights and health check polling in the console
  if (req.method === 'OPTIONS' || req.path === '/health' || req.path.endsWith('/health')) {
    return next();
  }

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
