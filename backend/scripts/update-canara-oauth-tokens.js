'use strict';

const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

const envPath = path.resolve(__dirname, '../.env');
if (!fs.existsSync(envPath)) {
  throw new Error(`Missing environment file: ${envPath}`);
}
dotenv.config({ path: envPath, override: true });
if (!process.env.EXAM_PORTAL_DB_PASSWORD) {
  throw new Error('EXAM_PORTAL_DB_PASSWORD is not set in backend/.env or environment.');
}

const crypto = require('node:crypto');
const { createExamPortalDataSource } = require('../src/database/data-source');
const { CanaraSettingsService } = require('../src/settings/canara-settings.service');

function parseJsonInput(raw) {
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse JSON input: ${err.message}`);
  }
}

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function parsePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Token payload must be a JSON object');
  }

  const accessToken = payload.access_token || payload.accessToken || null;
  const refreshToken = payload.refresh_token || payload.refreshToken || null;
  const expiresIn = payload.expires_in || payload.expiresIn || null;
  const refreshTokenExpiresIn =
    payload.refresh_token_expires_in || payload.refreshTokenExpiresIn || null;

  if (!accessToken) throw new Error('Missing access_token');
  if (!refreshToken) throw new Error('Missing refresh_token');
  if (expiresIn == null) throw new Error('Missing expires_in');

  const expiresSeconds = Number(expiresIn);
  if (!Number.isFinite(expiresSeconds) || expiresSeconds <= 0) {
    throw new Error('expires_in must be a positive number');
  }

  const expiresAt = new Date(Date.now() + expiresSeconds * 1000);
  const refreshTokenExpiresAt =
    refreshTokenExpiresIn != null && Number.isFinite(Number(refreshTokenExpiresIn))
      ? new Date(Date.now() + Number(refreshTokenExpiresIn) * 1000)
      : null;

  return {
    accessToken,
    refreshToken,
    expiresAt,
    refreshTokenExpiresAt,
    accessTokenHash: hashValue(accessToken),
    refreshTokenHash: hashValue(refreshToken),
  };
}

async function readInput(arg) {
  if (!arg || arg === '-') {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const raw = chunks.join('').trim();
    if (!raw) {
      throw new Error('No JSON input provided on stdin');
    }
    return raw;
  }

  const file = path.resolve(process.cwd(), arg);
  if (!fs.existsSync(file)) {
    throw new Error(`Cannot read file: ${file}`);
  }

  return fs.readFileSync(file, 'utf8');
}

async function main() {
  const [arg1, arg2] = process.argv.slice(2);

  if (!arg1) {
    throw new Error('Usage: node scripts/update-canara-oauth-tokens.js <json-file|-> <audit-id>');
  }
  if (!arg2) {
    throw new Error('Missing audit id. Usage: node scripts/update-canara-oauth-tokens.js <json-file|-> <audit-id>');
  }

  const raw = await readInput(arg1);
  const payload = parseJsonInput(raw);
  const tokenData = parsePayload(payload);
  const auditId = Number(arg2);
  if (!Number.isFinite(auditId) || auditId <= 0) {
    throw new Error('Invalid audit id. Must be a positive integer.');
  }

  const dataSource = createExamPortalDataSource();
  await dataSource.initialize();

  const canaraRepo = dataSource.getRepository('CanaraPaymentSettings');
  const oauthAuditRepo = dataSource.getRepository('CanaraOauthAudit');
  const canaraSettings = new CanaraSettingsService(canaraRepo, oauthAuditRepo);

  const tokenSaveResult = await canaraSettings.saveTokens({
    accessToken: tokenData.accessToken,
    refreshToken: tokenData.refreshToken,
    expiresAt: tokenData.expiresAt,
  });

  const row = await oauthAuditRepo.findOneBy({ id: auditId });
  if (!row) {
    throw new Error(`No oauth callback audit row found for id ${auditId}`);
  }

  await oauthAuditRepo.update({ id: auditId }, {
    codeExchangeCompletedAt: new Date(),
    tokenResponseStatus: 'success',
    accessTokenHash: tokenData.accessTokenHash,
    refreshTokenHash: tokenData.refreshTokenHash,
    tokenExpiresAt: tokenData.expiresAt,
    updatedAt: new Date(),
  });

  console.log('Updated Canara OAuth audit row and saved tokens.');
  console.log(`auditId: ${auditId}`);
  console.log(`accessTokenHash: ${tokenData.accessTokenHash}`);
  console.log(`refreshTokenHash: ${tokenData.refreshTokenHash}`);
  console.log(`tokenExpiresAt: ${tokenData.expiresAt.toISOString()}`);
  if (tokenData.refreshTokenExpiresAt) {
    console.log(`refreshTokenExpiresAt: ${tokenData.refreshTokenExpiresAt.toISOString()}`);
    console.log('Note: refreshTokenExpiresAt is not persisted because DB schema has no column for it.');
  }

  await dataSource.destroy();
}

main().catch((err) => {
  console.error('Failed to update Canara OAuth tokens:', err.message || err);
  process.exit(1);
});
