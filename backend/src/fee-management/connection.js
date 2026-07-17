'use strict';

const mongoose = require('mongoose');
const { config } = require('../config');

/** @type {import('mongoose').Connection | null} */
let feeMgmtConnection = null;

async function connectFeeManagementMongo() {
  if (!config.feeManagement.mongodbUri) {
    throw new Error('FEE_MANAGEMENT_MONGODB_URI is not configured');
  }
  if (feeMgmtConnection && feeMgmtConnection.readyState === 1) {
    return feeMgmtConnection;
  }
  feeMgmtConnection = await mongoose.createConnection(
    config.feeManagement.mongodbUri,
    {
      serverSelectionTimeoutMS: 8000,
    },
  ).asPromise();
  return feeMgmtConnection;
}

async function disconnectFeeManagementMongo() {
  if (feeMgmtConnection) {
    await feeMgmtConnection.close().catch(() => undefined);
    feeMgmtConnection = null;
  }
}

function getFeeManagementConnection() {
  return feeMgmtConnection;
}

function isFeeManagementConnected() {
  return feeMgmtConnection?.readyState === 1;
}

module.exports = {
  connectFeeManagementMongo,
  disconnectFeeManagementMongo,
  getFeeManagementConnection,
  isFeeManagementConnected,
};
