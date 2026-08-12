'use strict';

require('dotenv').config();
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const { CompactEncrypt, compactDecrypt, importJWK } = require('jose');

function normalizePublicCertPem(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const cleaned = raw.replace(/\\n/g, '\n').replace(/\r/g, '').trim();
  if (/-----BEGIN CERTIFICATE-----/.test(cleaned)) return cleaned;

  const body = cleaned.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/=]+$/.test(body)) return cleaned;
  const chunks = body.match(/.{1,64}/g) || [body];
  return `-----BEGIN CERTIFICATE-----\n${chunks.join('\n')}\n-----END CERTIFICATE-----\n`;
}

function decodeSymmetricKeyBytes(raw) {
  const s = String(raw || '').trim();
  if (!s) throw new Error('Missing symmetric key');
  if (/^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0) return Buffer.from(s, 'hex');
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  return Buffer.from(b64 + pad, 'base64');
}

async function importOctKey(rawKey, alg = 'A256KW') {
  const bytes = decodeSymmetricKeyBytes(rawKey);
  if (bytes.length !== 32) throw new Error(`Expected 32-byte key, got ${bytes.length}`);
  return importJWK({ kty: 'oct', k: bytes.toString('base64url'), alg }, alg);
}

async function main() {
  const db = {
    host: process.env.EXAM_PORTAL_DB_HOST,
    port: Number(process.env.EXAM_PORTAL_DB_PORT || 3306),
    user: process.env.EXAM_PORTAL_DB_USER,
    password: process.env.EXAM_PORTAL_DB_PASSWORD,
    database: process.env.EXAM_PORTAL_DB_NAME,
    ssl: process.env.EXAM_PORTAL_DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  };

  const conn = await mysql.createConnection(db);
  try {
    const [rows] = await conn.query('SELECT clientId, mid, symmetricKey, privateKeyPem, publicCertPem FROM canara_payment_settings ORDER BY id DESC LIMIT 1');
    const row = rows[0];
    if (!row) {
      console.log('NO_ROW');
      return;
    }

    const payload = {
      mid: row.mid || 'AGRLOG0001',
      channel: 'api',
      account_number: '2400201001060',
      mobile_number: '9010462357',
      name: 'Ravi Buraga',
      ifsc_code: 'CNRB0000000',
      sid: row.clientId || 'AGRLOG0011',
    };

    const privateKeyPem = String(row.privateKeyPem || '').trim();
    const publicCertPem = normalizePublicCertPem(row.publicCertPem);
    const symmetricKey = String(row.symmetricKey || '').trim();

    const json = JSON.stringify(payload);
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(json);
    const signature = sign.sign(privateKeyPem, 'base64');

    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(json);
    const signatureValid = verify.verify(crypto.createPublicKey(publicCertPem), signature, 'base64');

    const key = await importOctKey(symmetricKey, 'A256KW');
    const encrypted = await new CompactEncrypt(new TextEncoder().encode(json))
      .setProtectedHeader({ alg: 'A256KW', enc: 'A128CBC-HS256' })
      .encrypt(key);
    const { plaintext } = await compactDecrypt(encrypted, key);
    const decrypted = JSON.parse(new TextDecoder().decode(plaintext));

    console.log('SIGN_OK=' + signatureValid);
    console.log('PAYLOAD_MATCH=' + (JSON.stringify(decrypted) === JSON.stringify(payload)));
    console.log('ENCRYPTED_HAS_DOTS=' + encrypted.includes('.'));
    console.log('CERT_WRAPPED=' + publicCertPem.startsWith('-----BEGIN CERTIFICATE-----'));
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
