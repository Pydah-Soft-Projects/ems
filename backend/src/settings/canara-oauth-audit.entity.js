'use strict';

const { EntitySchema } = require('typeorm');

const CanaraOauthAudit = new EntitySchema({
  name: 'CanaraOauthAudit',
  tableName: 'canara_oauth_audit',
  columns: {
    id: { type: 'int', primary: true, generated: true },
    provider: { type: 'varchar', length: 50, default: 'canara' },
    clientId: { type: 'varchar', length: 255, nullable: true },
    redirectUri: { type: 'varchar', length: 500, nullable: true },
    state: { type: 'varchar', length: 255, nullable: true },
    scope: { type: 'varchar', length: 255, nullable: true },
    authorizationCode: { type: 'text', nullable: true },
    callbackReceivedAt: { type: 'datetime', nullable: true },
    stateVerified: { type: 'boolean', default: false },
    codeExchangeStartedAt: { type: 'datetime', nullable: true },
    codeExchangeCompletedAt: { type: 'datetime', nullable: true },
    tokenResponseStatus: { type: 'varchar', length: 50, nullable: true },
    accessTokenHash: { type: 'varchar', length: 255, nullable: true },
    refreshTokenHash: { type: 'varchar', length: 255, nullable: true },
    tokenExpiresAt: { type: 'datetime', nullable: true },
    requestIp: { type: 'varchar', length: 100, nullable: true },
    userAgent: { type: 'text', nullable: true },
    createdAt: { type: 'datetime', createDate: true },
    updatedAt: { type: 'datetime', updateDate: true },
  },
});

module.exports = { CanaraOauthAudit };
