'use strict';

const { EntitySchema } = require('typeorm');
const { dateTransformer } = require('../../common/date-transformer');

const SdmsAcademicYear = new EntitySchema({
  name: 'SdmsAcademicYear',
  tableName: 'academic_years',
  columns: {
    id: { type: 'int', primary: true, generated: true },
    yearLabel: { type: 'varchar', length: 20, name: 'year_label' },
    startDate: { type: 'date', name: 'start_date', nullable: true, transformer: dateTransformer },
    endDate: { type: 'date', name: 'end_date', nullable: true, transformer: dateTransformer },
    isActive: { type: 'boolean', name: 'is_active', default: true },
  },
});

module.exports = { SdmsAcademicYear };
