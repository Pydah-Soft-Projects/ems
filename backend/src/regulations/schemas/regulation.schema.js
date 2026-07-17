'use strict';

const { EntitySchema } = require('typeorm');
const { RegulationStatus } = require('./regulation-status.enum');

const Regulation = new EntitySchema({
  name: 'Regulation',
  tableName: 'regulations',
  uniques: [{ columns: ['code'] }],
  columns: {
    id: { type: 'int', primary: true, generated: true },
    code: { type: 'varchar', length: 50 },
    name: { type: 'varchar', length: 200 },
    description: { type: 'text', nullable: true },
    effectiveDate: { type: 'date', nullable: true },
    status: {
      type: 'varchar',
      length: 20,
      default: RegulationStatus.ACTIVE,
    },
    createdAt: { type: 'datetime', createDate: true },
    updatedAt: { type: 'datetime', updateDate: true },
  },
  relations: {
    subjects: {
      type: 'one-to-many',
      target: 'Subject',
      inverseSide: 'regulation',
    },
    scopes: {
      type: 'one-to-many',
      target: 'RegulationScope',
      inverseSide: 'regulation',
      cascade: true,
      eager: false,
    },
  },
});

module.exports = { Regulation };
