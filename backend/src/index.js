'use strict';

require('dotenv').config();

const killPort = require('kill-port');
const { setTimeout: delay } = require('node:timers/promises');
const { createExamPortalDataSource } = require('./database/data-source');
const { createStudentDataSource } = require('./database/student-data-source');
const {
  connectHrmsMongo,
  disconnectHrmsMongo,
  isHrmsConnected,
} = require('./auth/hrms-user.model');
const {
  connectFeeManagementMongo,
  disconnectFeeManagementMongo,
  isFeeManagementConnected,
} = require('./fee-management/connection');
const { createServices } = require('./database/container');
const { createApp } = require('./app');
const { config } = require('./config');
const { logger } = require('./common/logger');

let server = null;
let examPortalDataSource = null;
let studentDataSource = null;
let shuttingDown = false;

async function freeDevPort(port) {
  if (process.env.NODE_ENV === 'production') return;
  try {
    await killPort(port, 'tcp');
  } catch {
    // Port already free
  }
  await delay(400);
}

async function cleanupConnections() {
  if (studentDataSource?.isInitialized) {
    await studentDataSource.destroy().catch(() => undefined);
  }
  if (examPortalDataSource?.isInitialized) {
    await examPortalDataSource.destroy().catch(() => undefined);
  }
  await disconnectHrmsMongo().catch(() => undefined);
  await disconnectFeeManagementMongo().catch(() => undefined);
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ event: 'application.shutdown', signal }, 'Shutting down gracefully');
  if (server) {
    server.close(() => {
      void cleanupConnections().finally(() => process.exit(0));
    });
  } else {
    void cleanupConnections().finally(() => process.exit(0));
  }
  setTimeout(() => process.exit(0), 1500).unref();
}

function registerShutdownHandlers() {
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGUSR2', () => shutdown('SIGUSR2'));
}

function listen(app, port) {
  return new Promise((resolve, reject) => {
    const instance = app.listen(port, () => resolve(instance));
    instance.on('error', reject);
  });
}

async function listenWithRetry(app, port, maxAttempts = 15) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await listen(app, port);
    } catch (err) {
      lastError = err;
      if (err.code !== 'EADDRINUSE' || attempt === maxAttempts) {
        throw err;
      }
      const waitMs = 400 * attempt;
      logger.warn(
        { event: 'server.port_busy', port, waitMs, attempt, maxAttempts },
        'Port busy; retrying',
      );
      await delay(waitMs);
    }
  }
  throw lastError || new Error(`Failed to bind port ${port}`);
}

async function connectOptionalHrms() {
  if (!config.hrms.mongodbUri) {
    logger.warn(
      { event: 'dependency.hrms.not_configured' },
      'HRMS MongoDB URI not set; staff login unavailable',
    );
    return;
  }
  try {
    await connectHrmsMongo();
    logger.info({ event: 'dependency.hrms.connected' }, 'HRMS MongoDB connected');
  } catch (err) {
    logger.warn(
      { event: 'dependency.hrms.unavailable', err },
      'HRMS MongoDB unavailable; staff login disabled',
    );
  }
}

async function connectOptionalFeeManagement() {
  if (!config.feeManagement.mongodbUri) {
    logger.warn(
      { event: 'dependency.fee_management.not_configured' },
      'Fee Management MongoDB URI not set; fee posting disabled',
    );
    return;
  }
  try {
    await connectFeeManagementMongo();
    logger.info(
      { event: 'dependency.fee_management.connected' },
      'Fee Management MongoDB connected',
    );
  } catch (err) {
    logger.warn(
      { event: 'dependency.fee_management.unavailable', err },
      'Fee Management MongoDB unavailable; fee posting disabled',
    );
  }
}

async function bootstrap() {
  registerShutdownHandlers();

  examPortalDataSource = createExamPortalDataSource();
  await examPortalDataSource.initialize();
  logger.info(
    { event: 'dependency.exam_database.connected' },
    'Exam portal database connected',
  );

  if (!config.simulate.useSqlite) {
    const {
      ensurePaymentGatewaySelfOnlineColumns,
    } = require('./settings/ensure-self-online-columns');
    await ensurePaymentGatewaySelfOnlineColumns(examPortalDataSource, logger);
    const {
      ensureCanaraPaymentSettingsTable,
      ensureCanaraOauthAuditTable,
    } = require('./settings/ensure-canara-table');
    await ensureCanaraPaymentSettingsTable(examPortalDataSource, logger);
    await ensureCanaraOauthAuditTable(examPortalDataSource, logger);
    const {
      ensureLateFeeSlabDateColumns,
    } = require('./exam/ensure-late-fee-slab-dates');
    await ensureLateFeeSlabDateColumns(examPortalDataSource, logger);
  }

  studentDataSource = createStudentDataSource();
  await studentDataSource.initialize();
  logger.info(
    {
      event: 'dependency.student_database.connected',
      database: config.studentDb.name,
      readOnly: true,
    },
    'Student database connected',
  );

  await connectOptionalHrms();
  await connectOptionalFeeManagement();

  const services = createServices(examPortalDataSource, studentDataSource);
  const app = createApp(services);

  await freeDevPort(config.port);

  try {
    server = await listenWithRetry(app, config.port);
  } catch (err) {
    if (err.code === 'EADDRINUSE') {
      logger.error(
        { event: 'server.port_bind_failed', port: config.port, err },
        'Port is still in use after retries',
      );
    }
    throw err;
  }

  const base = `http://localhost:${config.port}/${config.apiPrefix}`;
  logger.info(
    { event: 'application.started', baseUrl: base, port: config.port },
    'EMS backend started',
  );
  if (!isHrmsConnected()) {
    logger.warn(
      { event: 'application.degraded', dependency: 'hrms' },
      'Staff login requires HRMS MongoDB',
    );
  }
  if (config.feeManagement.mongodbUri && !isFeeManagementConnected()) {
    logger.warn(
      { event: 'application.degraded', dependency: 'fee_management' },
      'Exam fee posting requires Fee Management MongoDB',
    );
  }
}

process.on('unhandledRejection', (reason) => {
  logger.fatal(
    { event: 'process.unhandled_rejection', err: reason },
    'Unhandled promise rejection',
  );
});

process.on('uncaughtException', (err) => {
  logger.fatal(
    { event: 'process.uncaught_exception', err },
    'Uncaught exception',
  );
  void cleanupConnections().finally(() => process.exit(1));
});

bootstrap().catch(async (err) => {
  logger.fatal({ event: 'application.start_failed', err }, 'Failed to start server');
  await cleanupConnections();
  process.exit(1);
});
