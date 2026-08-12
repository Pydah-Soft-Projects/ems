'use strict';

require('dotenv').config();
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const { CompactEncrypt, compactDecrypt, importJWK } = require('jose');

function normalizePem(value, label) {
  const s = String(value || '').trim();
  if (!s) {
    throw new Error(`Missing ${label}`);
  }

  // Some DB rows may store escaped newlines or a bare base64 blob.
  const cleaned = s
    .replace(/\\n/g, '\n')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (/-----BEGIN [A-Z ]+-----/.test(cleaned)) {
    return cleaned;
  }

  if (/^[A-Za-z0-9+/=\n\r]+$/.test(cleaned) && cleaned.length > 100) {
    const header = label.includes('CERT') ? '-----BEGIN CERTIFICATE-----\n' : '-----BEGIN PRIVATE KEY-----\n';
    const footer = label.includes('CERT') ? '\n-----END CERTIFICATE-----' : '\n-----END PRIVATE KEY-----';
    const lines = cleaned.match(/.{1,64}/g) || [cleaned];
    return `${header}${lines.join('\n')}${footer}`;
  }

  return cleaned;
}

function decodeSymmetricKeyBytes(raw) {
  const s = String(raw || '').trim();
  if (!s) throw new Error('Missing symmetric key');

  if (/^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0) {
    return Buffer.from(s, 'hex');
  }

  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  return Buffer.from(b64 + pad, 'base64');
}

async function importOctKey(rawKey, alg = 'A256KW') {
  const bytes = decodeSymmetricKeyBytes(rawKey);
  if (bytes.length !== 32) {
    throw new Error(`Symmetric key must be 32 bytes for ${alg}, got ${bytes.length}`);
  }

  return importJWK(
    {
      kty: 'oct',
      k: bytes.toString('base64url'),
      alg,
    },
    alg,
  );
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

  if (!db.host || !db.user || !db.password || !db.database) {
    console.log('Missing MySQL config in backend env.');
    return;
  }

  let connection;
  try {
    connection = await mysql.createConnection(db);
    const [rows] = await connection.query(
      'SELECT id, clientId, clientSecret, mid, accountNumber, ifscCode, merchantName, bankName, channel, symmetricKey, privateKeyPem, publicCertPem FROM canara_payment_settings ORDER BY id DESC LIMIT 1',
    );

    const row = rows && rows[0] ? rows[0] : null;
    if (!row) {
      console.log('No row found in canara_payment_settings.');
      return;
    }

    console.log('=== Canara settings row ===');
    console.log(JSON.stringify({
      id: row.id,
      clientId: row.clientId,
      mid: row.mid,
      accountNumber: row.accountNumber,
      bankName: row.bankName,
      channel: row.channel,
      hasSymmetricKey: !!row.symmetricKey,
      hasPrivateKeyPem: !!row.privateKeyPem,
      hasPublicCertPem: !!row.publicCertPem,
    }, null, 2));

    const privateKeyPem = normalizePem(row.privateKeyPem, 'privateKeyPem');
    const publicCertPem = normalizePem(row.publicCertPem, 'publicCertPem');
    const symmetricKey = String(row.symmetricKey || '').trim();

    if (!privateKeyPem || !publicCertPem || !symmetricKey) {
      console.log('DB row exists but one or more required crypto fields are empty.');
      console.log('Missing:');
      if (!privateKeyPem) console.log(' - privateKeyPem');
      if (!publicCertPem) console.log(' - publicCertPem');
      if (!symmetricKey) console.log(' - symmetricKey');
      return;
    }

    console.log('Public certificate preview:', publicCertPem.slice(0, 180));
    console.log('Private key preview:', privateKeyPem.slice(0, 180));
    console.log('Symmetric key preview:', symmetricKey.slice(0, 80));

    const payload = {
      mid: 'AGRLOG0001',
      channel: 'api',
      account_number: '2400201001060',
      mobile_number: '9010462357',
      terminalId: '',
      name: 'Ravi Buraga',
      bank_name: 'Canara Bank',
      mcc: '0001',
      ifsc_code: 'CNRB0000000',
      sid: 'AGRLOG0011',
      additionalNo: '',
      checksum: '',
    };

    const plain = JSON.stringify(payload);
    const privateKey = crypto.createPrivateKey(privateKeyPem);
    const publicKey = crypto.createPublicKey(publicCertPem);

    const signature = crypto
      .createSign('RSA-SHA256')
      .update(plain)
      .sign(privateKey, 'base64');

    const verified = crypto
      .createVerify('RSA-SHA256')
      .update(plain)
      .verify(publicKey, signature, 'base64');

    const key = await importOctKey(symmetricKey, 'A256KW');
    const encrypted = await new CompactEncrypt(new TextEncoder().encode(plain))
      .setProtectedHeader({ alg: 'A256KW', enc: 'A128CBC-HS256' })
      .encrypt(key);

    const { plaintext } = await compactDecrypt(encrypted, key);
    const decrypted = new TextDecoder().decode(plaintext);

    console.log('\n=== Payload validation using DB key material ===');
    console.log('Plaintext payload:');
    console.log(plain);
    console.log('\nRSA-SHA256 signature verification result:', verified);
    console.log('x-signature (base64):');
    console.log(signature);
    console.log('\nEncrypted payload (JWE compact):');
    console.log(encrypted);
    console.log('\nDecrypted payload:');
    console.log(decrypted);

    if (verified && JSON.stringify(JSON.parse(decrypted)) === JSON.stringify(payload)) {
      console.log('\n✅ Key validation passed: the DB private key/public cert and symmetric key match the payload flow.');
    } else {
      console.log('\n⚠️ Validation did not match the payload exactly. Check key material or signing/encryption contract.');
    }
  } catch (err) {
    console.error('Key validation failed with error:');
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
  } finally {
    if (connection) await connection.end();
  }
}

main();
