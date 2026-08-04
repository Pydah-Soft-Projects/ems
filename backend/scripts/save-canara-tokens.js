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

const { createExamPortalDataSource } = require('../src/database/data-source');
const { CanaraSettingsService } = require('../src/settings/canara-settings.service');
const { CanaraPaymentSettings } = require('../src/settings/canara-payment-settings.entity');

function parseJsonInput(raw) {
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse JSON input: ${err.message}`);
  }
}

function normalizeTokenPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Token payload must be a JSON object');
  }

  const accessToken = payload.access_token || payload.accessToken || null;
  const refreshToken = payload.refresh_token || payload.refreshToken || null;
  const expiresIn = payload.expires_in || payload.expiresIn || null;

  if (!accessToken) {
    throw new Error('Token payload missing access_token');
  }
  if (!refreshToken) {
    throw new Error('Token payload missing refresh_token');
  }
  if (expiresIn == null) {
    throw new Error('Token payload missing expires_in');
  }

  const expiresInSeconds = Number(expiresIn);
  if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
    throw new Error('expires_in must be a positive number');
  }

  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

  return {
    accessToken,
    refreshToken,
    expiresAt,
    raw: payload,
  };
}

async function main() {
  const arg = process.argv[2] || '-';
  let raw;

  if (arg === '-' || !arg) {
    raw = await new Promise((resolve, reject) => {
      let data = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (chunk) => {
        data += chunk;
      });
      process.stdin.on('end', () => resolve(data));
      process.stdin.on('error', reject);
    });
    if (!raw.trim()) {
      throw new Error('No JSON input received on stdin');
    }
  } else {
    const filePath = path.resolve(process.cwd(), arg);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    raw = fs.readFileSync(filePath, 'utf8');
  }

  const payload = parseJsonInput(raw);
  const tokens = normalizeTokenPayload(payload);

  const dataSource = createExamPortalDataSource();
  await dataSource.initialize();
  const canaraRepo = dataSource.getRepository('CanaraPaymentSettings');
  const canaraSettings = new CanaraSettingsService(canaraRepo, null);

  const result = await canaraSettings.saveTokens({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
  });

  console.log('Saved Canara tokens successfully.');
  console.log('expiresAt:', result.tokenExpiresAt);
  await dataSource.destroy();
}

main().catch((err) => {
  console.error('Failed to save Canara tokens:', err.message);
  process.exit(1);
});
