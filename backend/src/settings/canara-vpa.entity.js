'use strict';

const { EntitySchema } = require('typeorm');

const CanaraVPA = new EntitySchema({
  name: 'CanaraVPA',
  tableName: 'canara_vpas',
  columns: {
    id: { type: 'int', primary: true, generated: true },
    sid: { type: 'varchar', length: 50, nullable: true },
    upiId: { type: 'varchar', length: 150, nullable: true },
    batchId: { type: 'varchar', length: 120, nullable: true },
    mobileNumber: { type: 'varchar', length: 20, nullable: true },
    additionalNumber: { type: 'varchar', length: 20, nullable: true },
    usedFor: { type: 'varchar', length: 120, nullable: true },
    status: { type: 'varchar', length: 30, default: 'PENDING' },
    responseStatus: { type: 'varchar', length: 30, nullable: true },
    responseCode: { type: 'varchar', length: 50, nullable: true },
    responseMessage: { type: 'text', nullable: true },
    merchantName: { type: 'varchar', length: 150, nullable: true },
    qrString: { type: 'text', nullable: true },
    suggestedVPA: { type: 'varchar', length: 150, nullable: true },
    errorCode: { type: 'varchar', length: 50, nullable: true },
    errorDescription: { type: 'text', nullable: true },
    isActive: { type: 'boolean', default: false },
    createdAt: { type: 'datetime', createDate: true },
    updatedAt: { type: 'datetime', updateDate: true },
  },
});

module.exports = { CanaraVPA };