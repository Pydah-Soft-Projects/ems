'use strict';

const crypto = require('node:crypto');
const { CompactEncrypt, compactDecrypt, importJWK } = require('jose');

function readCanaraKeysFromEnv() {
  const privateKeyPem = (
    process.env.CANARA_PRIVATE_KEY_PEM ||
    process.env.CANARA_PRIVATE_KEY ||
    ''
  ).trim();

  const publicCertPem = (
    process.env.CANARA_PUBLIC_CERT_PEM ||
    process.env.CANARA_PUBLIC_CERT ||
    ''
  ).trim();

  const symmetricKey = (
    process.env.CANARA_SYMMETRIC_KEY ||
    process.env.CANARA_KEY ||
    ''
  ).trim();

  return { privateKeyPem, publicCertPem, symmetricKey };
}

function decodeSymmetricKeyBytes(raw) {
  const s = String(raw || '').trim();
  if (!s) {
    throw new Error('CANARA_SYMMETRIC_KEY missing');
  }
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
  const { privateKeyPem, publicCertPem, symmetricKey } = readCanaraKeysFromEnv();

  if (!privateKeyPem || !publicCertPem || !symmetricKey) {
    console.log('Missing Canara key material in env. Expected:');
    console.log('  CANARA_PRIVATE_KEY_PEM');
    console.log('  CANARA_PUBLIC_CERT_PEM');
    console.log('  CANARA_SYMMETRIC_KEY');
    console.log('');
    console.log('If the values are already in the DB-backed Canara settings, load them into env before running this validator.');
    return;
  }

  const payload = {
    mid: 'AGRLOG0001',
    channel: 'api',
    account_number: '2400201001060',
    mobile_number: '9010462357',
    terminalId: '',
    name: 'Ravi Buraga',
    bank_name: 'Canara Bank',
    mcc: '5411',
    ifsc_code: 'CNRB0000000',
    sid: 'AGRLOG0011',
    additionalNo: '',
    checksum: '',
  };

  const plain = JSON.stringify(payload);

  const privateKey = crypto.createPrivateKey(privateKeyPem);
  const publicKey = crypto.createPublicKey(publicCertPem);

  const sig = crypto
    .createSign('RSA-SHA256')
    .update(plain)
    .sign(privateKey, 'base64');

  const verify = crypto
    .createVerify('RSA-SHA256')
    .update(plain)
    .verify(publicKey, sig, 'base64');

  const key = await importOctKey(symmetricKey, 'A256KW');
  const encrypted = await new CompactEncrypt(new TextEncoder().encode(plain))
    .setProtectedHeader({ alg: 'A256KW', enc: 'A128CBC-HS256' })
    .encrypt(key);

  console.log('=== Canara key validation ===');
  console.log('Private key loaded:', !!privateKey);
  console.log('Public cert loaded:', !!publicKey);
  console.log('Symmetric key length bytes:', decodeSymmetricKeyBytes(symmetricKey).length);
  console.log('Signature verification:', verify);
  console.log('x-signature:', sig);
  console.log('Encrypted payload:');
  console.log(encrypted);

  const { plaintext } = await compactDecrypt(encrypted, key);
  console.log('Decrypted payload:');
  console.log(new TextDecoder().decode(plaintext));
}

main().catch((err) => {
  console.error('Key validation failed');
  console.error(err.message || err);
  process.exitCode = 1;
});
