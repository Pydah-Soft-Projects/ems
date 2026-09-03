'use strict';

const { EntitySchema } = require('typeorm');
const { SubjectType, SubjectStatus } = require('./subject.enums');

const Subject = new EntitySchema({
  name: 'Subject',
  tableName: 'subjects',
  uniques: [{ columns: ['regulationId', 'code'] }],
  columns: {
    id: { type: 'int', primary: true, generated: true },
    regulationId: { type: 'int' },
    collegeId: { type: 'int', nullable: true },
    collegeName: { type: 'varchar', length: 255, nullable: true },
    courseId: { type: 'int', nullable: true },
    courseName: { type: 'varchar', length: 255, nullable: true },
    branchId: { type: 'int', nullable: true },
    branchName: { type: 'varchar', length: 255, nullable: true },
    code: { type: 'varchar', length: 50 },
    name: { type: 'varchar', length: 200 },
    yearOfStudy: { type: 'int', default: 1 },
    semester: { type: 'int', nullable: true },
    type: { type: 'varchar', length: 50, default: SubjectType.THEORY },
    credits: { type: 'decimal', precision: 4, scale: 1, default: 0 },
    internalMarks: { type: 'int', default: 0 },
    externalMarks: { type: 'int', default: 0 },
    totalMarks: { type: 'int', default: 0 },
    status: { type: 'varchar', length: 20, default: SubjectStatus.ACTIVE },
    createdAt: { type: 'datetime', createDate: true },
    updatedAt: { type: 'datetime', updateDate: true },
  },
  relations: {
    regulation: {
      type: 'many-to-one',
      target: 'Regulation',
      inverseSide: 'subjects',
      joinColumn: { name: 'regulationId' },
      onDelete: 'CASCADE',
    },
  },
});

module.exports = { Subject };
