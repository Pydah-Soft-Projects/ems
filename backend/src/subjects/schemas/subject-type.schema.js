'use strict';

const { EntitySchema } = require('typeorm');
const { SubjectStatus } = require('./subject.enums');

const SubjectTypeEntity = new EntitySchema({
  name: 'SubjectTypeEntity',
  tableName: 'subject_types',
  uniques: [{ columns: ['code'] }],
  columns: {
    id: { type: 'int', primary: true, generated: true },
    code: { type: 'varchar', length: 50 },
    name: { type: 'varchar', length: 100 },
    status: { type: 'varchar', length: 20, default: SubjectStatus.ACTIVE },
    sortOrder: { type: 'int', default: 0 },
    createdAt: { type: 'datetime', createDate: true },
    updatedAt: { type: 'datetime', updateDate: true },
  },
});

module.exports = { SubjectTypeEntity };
