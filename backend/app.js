'use strict';

// Vercel entrypoint. Starts listening immediately (so Vercel can detect the
// server) and initializes database connections lazily on the first request.
// Local dev and Render keep using `npm start` -> node src/index.js.

require('dotenv').config();

const express = require('express');
const { createExamPortalDataSource } = require('./src/database/data-source');
const { createStudentDataSource } = require('./src/database/student-data-source');
const { connectHrmsMongo } = require('./src/auth/hrms-user.model');
const { connectFeeManagementMongo } = require('./src/fee-management/connection');
const { createServices } = require('./src/database/container');
const { createApp } = require('./src/app');
const { config } = require('./src/config');

let appPromise = null;

async function buildApp() {
  const examPortalDataSource = createExamPortalDataSource();
  await examPortalDataSource.initialize();
  console.log('Exam portal database connected');

  const studentDataSource = createStudentDataSource();
  await studentDataSource.initialize();
  console.log(`Student database connected (${config.studentDb.name}, read-only)`);

  if (config.hrms.mongodbUri) {
    try {
      await connectHrmsMongo();
      console.log('HRMS MongoDB connected');
    } catch (err) {
      console.warn(`HRMS MongoDB unavailable (${err.message}) — staff login needs Mongo`);
    }
  } else {
    console.warn('HRMS MongoDB URI not set — staff login unavailable until configured');
  }

  if (config.feeManagement.mongodbUri) {
    try {
      await connectFeeManagementMongo();
      console.log('Fee Management MongoDB connected');
    } catch (err) {
      console.warn(
        `Fee Management MongoDB unavailable (${err.message}) — fee posting needs Mongo`,
      );
    }
  }

  const services = createServices(examPortalDataSource, studentDataSource);
  return createApp(services);
}

const server = express();

server.use((req, res, next) => {
  if (!appPromise) {
    appPromise = buildApp().catch((err) => {
      appPromise = null; // allow retry on the next request
      throw err;
    });
  }
  appPromise.then((app) => app(req, res, next)).catch(next);
});

server.listen(config.port, () => {
  console.log(`EMS backend listening on port ${config.port}`);
});

module.exports = server;
