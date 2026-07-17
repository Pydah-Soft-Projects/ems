'use strict';

const mongoose = require('mongoose');
const { config } = require('../config');

const hrmsUserSchema = new mongoose.Schema(
  {
    email: { type: String, lowercase: true, trim: true },
    password: { type: String, select: false },
    role: String,
    roles: [String],
    name: String,
    isActive: Boolean,
    status: String,
  },
  { collection: config.hrms.usersCollection, strict: false },
);

const HrmsUserModel =
  mongoose.models.HrmsUser || mongoose.model('HrmsUser', hrmsUserSchema);

async function connectHrmsMongo() {
  if (!config.hrms.mongodbUri) {
    throw new Error('HRMS_MONGODB_URI is not configured');
  }
  await mongoose.connect(config.hrms.mongodbUri, {
    serverSelectionTimeoutMS: 5000,
  });
  return mongoose.connection;
}

async function disconnectHrmsMongo() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

function isHrmsConnected() {
  return mongoose.connection.readyState === 1;
}

module.exports = {
  HrmsUserModel,
  connectHrmsMongo,
  disconnectHrmsMongo,
  isHrmsConnected,
};
