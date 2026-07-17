'use strict';

const { EntitySchema } = require('typeorm');

const RegulationScope = new EntitySchema({
  name: 'RegulationScope',
  tableName: 'regulation_scopes',
  uniques: [{ columns: ['regulationId', 'collegeId', 'courseId', 'batch'] }],
  columns: {
    id: { type: 'int', primary: true, generated: true },
    regulationId: { type: 'int' },
    collegeId: { type: 'int' },
    collegeName: { type: 'varchar', length: 255 },
    courseId: { type: 'int' },
    courseName: { type: 'varchar', length: 255 },
    batch: { type: 'varchar', length: 50 },
    createdAt: { type: 'datetime', createDate: true },
  },
  relations: {
    regulation: {
      type: 'many-to-one',
      target: 'Regulation',
      inverseSide: 'scopes',
      joinColumn: { name: 'regulationId' },
      onDelete: 'CASCADE',
    },
  },
});

module.exports = { RegulationScope };
