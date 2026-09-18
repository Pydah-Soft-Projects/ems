'use strict';

const { EntitySchema } = require('typeorm');

const FeeHead = new EntitySchema({
  name: 'FeeHead',
  tableName: 'fee_heads',
  uniques: [{ columns: ['code'] }],
  columns: {
    id: { type: 'int', primary: true, generated: true },
    name: { type: 'varchar', length: 200 },
    code: { type: 'varchar', length: 50 },
    description: { type: 'text', nullable: true },
    type: {
      type: 'varchar',
      length: 50,
      default: 'GLOBAL', // 'GLOBAL' or 'REGULATION_SPECIFIC'
    },
    defaultAmount: {
      type: 'decimal',
      precision: 10,
      scale: 2,
      default: 0,
      transformer: {
        to: (val) => val,
        from: (val) => (val != null ? parseFloat(val) : 0),
      },
    },
    regulationAmounts: {
      type: 'json',
      nullable: true,
    },
    isMandatory: {
      type: 'boolean',
      default: false,
    },
    isActive: {
      type: 'boolean',
      default: true,
    },
    createdAt: { type: 'datetime', createDate: true },
    updatedAt: { type: 'datetime', updateDate: true },
  },
});

module.exports = { FeeHead };
