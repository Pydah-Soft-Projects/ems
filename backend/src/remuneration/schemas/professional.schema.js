'use strict';

const { EntitySchema } = require('typeorm');

/** External paper setters / evaluators / examiners from other colleges. */
const Professional = new EntitySchema({
  name: 'Professional',
  tableName: 'professionals',
  columns: {
    id: { type: 'int', primary: true, generated: true },
    name: { type: 'varchar', length: 200 },
    designation: { type: 'varchar', length: 150, nullable: true },
    organization: { type: 'text', nullable: true },
    contactNumber: { type: 'varchar', length: 30, nullable: true },
    email: { type: 'varchar', length: 150, nullable: true },
    bankName: { type: 'varchar', length: 150, nullable: true },
    accountHolderName: { type: 'varchar', length: 200, nullable: true },
    accountNumber: { type: 'varchar', length: 50, nullable: true },
    ifscCode: { type: 'varchar', length: 20, nullable: true },
    bankAddress: { type: 'text', nullable: true },
    createdAt: { type: 'datetime', createDate: true },
    updatedAt: { type: 'datetime', updateDate: true },
  },
});

module.exports = { Professional };
