'use strict';

const { EntitySchema } = require('typeorm');

const SdmsCollege = new EntitySchema({
  name: 'SdmsCollege',
  tableName: 'colleges',
  columns: {
    id: { type: 'int', primary: true, generated: true },
    name: { type: 'varchar', length: 255 },
    code: { type: 'varchar', length: 50, nullable: true },
    isActive: { type: 'boolean', name: 'is_active', default: true },
  },
  relations: {
    courses: {
      type: 'one-to-many',
      target: 'SdmsCourse',
      inverseSide: 'college',
    },
  },
});

module.exports = { SdmsCollege };
