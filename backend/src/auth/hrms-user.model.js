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

const hrmsEmployeeSchema = new mongoose.Schema(
  {
    emp_no: String,
    employee_name: String,
    email: { type: String, lowercase: true, trim: true },
    password: { type: String, select: false },
    plain_password: { type: String, select: false },
    is_active: Boolean,
    role: String,
    roles: [String],
  },
  { collection: 'employees', strict: false },
);

const HrmsUserModel =
  mongoose.models.HrmsUser || mongoose.model('HrmsUser', hrmsUserSchema);
const HrmsEmployeeModel =
  mongoose.models.HrmsEmployee ||
  mongoose.model('HrmsEmployee', hrmsEmployeeSchema);

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
  HrmsEmployeeModel,
  connectHrmsMongo,
  disconnectHrmsMongo,
  isHrmsConnected,
};
