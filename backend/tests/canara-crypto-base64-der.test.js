'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { signPayload, publicCertHeaderValue } = require('../src/exam/canara/canara-crypto');

test('signPayload accepts raw base64 DER private key and publicCertHeaderValue keeps raw base64 certificate', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

  const privateKeyDer = privateKey.export({ format: 'der', type: 'pkcs8' });
  const publicCertDer = publicKey.export({ format: 'der', type: 'spki' });

  const signature = signPayload('hello canara', Buffer.from(privateKeyDer).toString('base64'));
  assert.equal(typeof signature, 'string');
  assert.ok(signature.length > 0);

  const certBase64 = Buffer.from(publicCertDer).toString('base64');
  const headerValue = publicCertHeaderValue(certBase64);
  assert.equal(headerValue, certBase64.replace(/\s+/g, ''));
});
