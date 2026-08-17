'use strict';

const { EntitySchema } = require('typeorm');
const { dateTransformer } = require('../../common/date-transformer');

/**
 * Student database (SDMS) timeline/events table.
 * Used to show exam application + fee + exam-date windows on admin calendar.
 */
const SdmsEvent = new EntitySchema({
  name: 'SdmsEvent',
  tableName: 'events',
  columns: {
    id: { type: 'int', primary: true, generated: true },
    title: { type: 'varchar', length: 255, nullable: false, name: 'title' },
    description: { type: 'text', nullable: true, name: 'description' },
    eventDate: { type: 'date', nullable: false, name: 'event_date', transformer: dateTransformer },
    endDate: { type: 'date', nullable: true, name: 'end_date', transformer: dateTransformer },
    startTime: { type: 'time', nullable: true, name: 'start_time' },
    endTime: { type: 'time', nullable: true, name: 'end_time' },
    eventType: { type: 'varchar', length: 30, nullable: true, name: 'event_type' },
    createdBy: { type: 'int', nullable: true, name: 'created_by' },
    targetCollege: { type: 'text', nullable: true, name: 'target_college' },
    targetBatch: { type: 'text', nullable: true, name: 'target_batch' },
    targetCourse: { type: 'text', nullable: true, name: 'target_course' },
    targetBranch: { type: 'text', nullable: true, name: 'target_branch' },
    targetYear: { type: 'text', nullable: true, name: 'target_year' },
    targetSemester: { type: 'text', nullable: true, name: 'target_semester' },
    isActive: { type: 'tinyint', nullable: true, name: 'is_active', default: 1 },
    createdAt: { type: 'timestamp', nullable: true, name: 'created_at' },
    updatedAt: { type: 'timestamp', nullable: true, name: 'updated_at' },
  },
});

module.exports = { SdmsEvent };

