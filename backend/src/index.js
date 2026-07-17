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
  console.log(`\n${signal} received, shutting down gracefully...`);
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
      console.warn(
        `Port ${port} busy, retrying in ${waitMs}ms... (${attempt}/${maxAttempts})`,
      );
      await delay(waitMs);
    }
  }
  throw lastError || new Error(`Failed to bind port ${port}`);
}

async function connectOptionalHrms() {
  if (!config.hrms.mongodbUri) {
    console.warn('HRMS MongoDB URI not set — staff login unavailable until configured');
    return;
  }
  try {
    await connectHrmsMongo();
    console.log('HRMS MongoDB connected');
  } catch (err) {
    console.warn(
      `HRMS MongoDB unavailable (${err.message}) — Express will still start; staff login needs Mongo`,
    );
  }
}

async function connectOptionalFeeManagement() {
  if (!config.feeManagement.mongodbUri) {
    console.warn(
      'FEE_MANAGEMENT_MONGODB_URI not set — exam payments will not post to Fee Management',
    );
    return;
  }
  try {
    await connectFeeManagementMongo();
    console.log('Fee Management MongoDB connected');
  } catch (err) {
    console.warn(
      `Fee Management MongoDB unavailable (${err.message}) — Express will still start; fee posting needs Mongo`,
    );
  }
}

async function bootstrap() {
  registerShutdownHandlers();

  examPortalDataSource = createExamPortalDataSource();
  await examPortalDataSource.initialize();
  console.log('Exam portal database connected');

  studentDataSource = createStudentDataSource();
  await studentDataSource.initialize();
  console.log(`Student database connected (${config.studentDb.name}, read-only)`);

  await connectOptionalHrms();
  await connectOptionalFeeManagement();

  const services = createServices(examPortalDataSource, studentDataSource);
  const app = createApp(services);

  await freeDevPort(config.port);

  try {
    server = await listenWithRetry(app, config.port);
  } catch (err) {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `Port ${config.port} is still in use after retries. Run: npm run predev`,
      );
    }
    throw err;
  }

  const base = `http://localhost:${config.port}/${config.apiPrefix}`;
  console.log(`EMS backend (Express) running on ${base}`);
  if (!isHrmsConnected()) {
    console.log('Note: staff /auth/login requires HRMS MongoDB');
  }
  if (config.feeManagement.mongodbUri && !isFeeManagementConnected()) {
    console.log('Note: exam fee posting requires Fee Management MongoDB');
  }
}

bootstrap().catch(async (err) => {
  console.error('Failed to start server:', err);
  await cleanupConnections();
  process.exit(1);
});
