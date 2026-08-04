'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { CanaraQrService } = require('../src/exam/canara/canara-qr.service');

test('records Canara OAuth callback audit before exchanging the authorization code', async () => {
  let auditPayload = null;
  let completionPayload = null;

  const canaraSettings = {
    getConfig: async () => ({
      clientId: 'client-123',
      oauthRedirectUri: 'https://example.com/callback',
      scope: 'van',
    }),
    getOauthConfig: async () => ({
      clientId: 'client-123',
      clientSecret: 'secret-123',
      oauthRedirectUri: 'https://example.com/callback',
      scope: 'van',
      baseUrl: 'https://api.canarauat.bank.in',
    }),
    saveTokens: async () => ({ ok: true }),
    recordOauthCallbackAudit: async (payload) => {
      auditPayload = payload;
      return { id: 42 };
    },
    finalizeOauthCallbackAudit: async (payload) => {
      completionPayload = payload;
      return { ok: true };
    },
  };

  const service = new CanaraQrService(
    { find: async () => [] },
    { find: async () => [] },
    canaraSettings,
    {},
  );

  service.client = {
    exchangeAuthorizationCode: async ({ code, redirectUri }) => {
      assert.equal(code, 'auth-code-123');
      assert.equal(redirectUri, 'https://example.com/callback');
      return {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: new Date('2035-01-01T00:00:00Z'),
      };
    },
  };

  const result = await service.handleOauthCallback({
    code: 'auth-code-123',
    state: 'state-xyz',
    scope: 'van',
    redirectUri: 'https://example.com/callback',
    requestIp: '127.0.0.1',
    userAgent: 'test-agent',
  });

  assert.equal(result.ok, true);
  assert.ok(auditPayload);
  assert.equal(auditPayload.code, 'auth-code-123');
  assert.equal(auditPayload.state, 'state-xyz');
  assert.equal(auditPayload.scope, 'van');
  assert.equal(auditPayload.redirectUri, 'https://example.com/callback');
  assert.equal(auditPayload.requestIp, '127.0.0.1');
  assert.equal(auditPayload.userAgent, 'test-agent');
  assert.ok(auditPayload.callbackReceivedAt);

  assert.ok(completionPayload);
  assert.equal(completionPayload.auditId, 42);
  assert.equal(completionPayload.accessToken, 'access-token');
  assert.equal(completionPayload.refreshToken, 'refresh-token');
});

test('allows OAuth callback exchange even when no live token is already stored', async () => {
  const canaraSettings = {
    getConfig: async ({ requireLive = false } = {}) => {
      if (requireLive) {
        throw new Error('Canara OAuth not connected. Use Connect Canara OAuth in Settings.');
      }
      return {
        clientId: 'client-123',
        clientSecret: 'secret-123',
        oauthRedirectUri: 'https://example.com/callback',
        scope: 'van',
        baseUrl: 'https://api.canarauat.bank.in',
      };
    },
    getOauthConfig: async () => ({
      clientId: 'client-123',
      clientSecret: 'secret-123',
      oauthRedirectUri: 'https://example.com/callback',
      scope: 'van',
      baseUrl: 'https://api.canarauat.bank.in',
    }),
    recordOauthCallbackAudit: async (payload) => ({ id: 99, payload }),
    finalizeOauthCallbackAudit: async () => ({ ok: true }),
    saveTokens: async () => ({ ok: true }),
  };

  const service = new CanaraQrService(
    { find: async () => [] },
    { find: async () => [] },
    canaraSettings,
    {},
  );

  service.client = {
    exchangeAuthorizationCode: async ({ code, redirectUri }) => ({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresAt: new Date('2035-01-01T00:00:00Z'),
      code,
      redirectUri,
    }),
  };

  const result = await service.handleOauthCallback({
    code: 'fresh-auth-code',
    state: 'abc123',
    scope: 'van',
    redirectUri: 'https://example.com/callback',
  });

  assert.equal(result.ok, true);
  assert.equal(result.auditId, 99);
  assert.equal(result.message, 'Canara OAuth connected successfully');
});
