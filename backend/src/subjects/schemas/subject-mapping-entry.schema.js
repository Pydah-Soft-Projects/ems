'use strict';

const { EntitySchema } = require('typeorm');

const SubjectMappingEntry = new EntitySchema({
  name: 'SubjectMappingEntry',
  tableName: 'subject_mapping_entries',
  indices: [
    { name: 'IDX_sme_regulationId', columns: ['regulationId'] },
    { name: 'IDX_sme_subjectId', columns: ['subjectId'] },
    {
      name: 'UQ_sme_assignment_scope',
      columns: [
        'regulationId',
        'subjectId',
        'collegeId',
        'courseId',
        'branchId',
        'batch',
        'yearOfStudy',
        'semester',
        'sectionKey',
      ],
      unique: true,
    },
  ],
  columns: {
    id: { type: 'int', primary: true, generated: true },
    regulationId: { type: 'int' },
    subjectId: { type: 'int' },
    collegeId: { type: 'int' },
    collegeName: { type: 'varchar', length: 255 },
    courseId: { type: 'int' },
    courseName: { type: 'varchar', length: 255 },
    branchId: { type: 'int' },
    branchName: { type: 'varchar', length: 255 },
    batch: { type: 'varchar', length: 50 },
    yearOfStudy: { type: 'int' },
    semester: { type: 'int' },
    sectionMode: { type: 'varchar', length: 20, default: 'all' },
    sections: { type: 'simple-json', nullable: true },
    sectionKey: { type: 'varchar', length: 255, default: '*' },
    createdAt: { type: 'datetime', createDate: true },
    updatedAt: { type: 'datetime', updateDate: true },
  },
  relations: {
    regulation: {
      type: 'many-to-one',
      target: 'Regulation',
      joinColumn: { name: 'regulationId' },
      onDelete: 'CASCADE',
    },
    subject: {
      type: 'many-to-one',
      target: 'Subject',
      joinColumn: { name: 'subjectId' },
      onDelete: 'CASCADE',
      eager: true,
    },
  },
});

module.exports = { SubjectMappingEntry };
