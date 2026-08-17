'use strict';

const { EntitySchema } = require('typeorm');
const { RegulationStatus } = require('./regulation-status.enum');

/**
 * Date transformer to handle timezone issues.
 * Converts DATE columns from MySQL to/from YYYY-MM-DD strings to prevent
 * timezone-based date shifts between local and hosted environments.
 */
const dateTransformer = {
  to: (value) => {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (value instanceof Date) {
      const year = value.getUTCFullYear();
      const month = String(value.getUTCMonth() + 1).padStart(2, '0');
      const day = String(value.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return value;
  },
  from: (value) => {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (value instanceof Date) {
      const year = value.getUTCFullYear();
      const month = String(value.getUTCMonth() + 1).padStart(2, '0');
      const day = String(value.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return value;
  },
};

const Regulation = new EntitySchema({
  name: 'Regulation',
  tableName: 'regulations',
  uniques: [{ columns: ['code'] }],
  columns: {
    id: { type: 'int', primary: true, generated: true },
    code: { type: 'varchar', length: 50 },
    name: { type: 'varchar', length: 200 },
    description: { type: 'text', nullable: true },
    effectiveDate: { type: 'date', nullable: true, transformer: dateTransformer },
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
