'use strict';

const { EntitySchema } = require('typeorm');

/** One Excel upload batch of results for an examination. */
const ResultUpload = new EntitySchema({
  name: 'ResultUpload',
  tableName: 'result_uploads',
  columns: {
    id: { type: 'int', primary: true, generated: true },
    examId: { type: 'int' },
    fileName: { type: 'varchar', length: 255, nullable: true },
    uploadedBy: { type: 'varchar', length: 150, nullable: true },
    rowCount: { type: 'int', default: 0 },
    studentCount: { type: 'int', default: 0 },
    createdAt: { type: 'datetime', createDate: true },
  },
  relations: {
    exam: {
      type: 'many-to-one',
      target: 'Exam',
      joinColumn: { name: 'examId' },
      onDelete: 'CASCADE',
    },
  },
});

/**
 * A student's result for one subject in one examination.
 * Re-uploading the same exam updates the row (grade correction); a result
 * for the same subject from a DIFFERENT exam (e.g. supply) is a new row
 * with the next attemptNumber — that is the attempt history.
 */
const SubjectResult = new EntitySchema({
  name: 'SubjectResult',
  tableName: 'subject_results',
  indices: [
    { name: 'IDX_subject_results_roll', columns: ['studentRollNumber'] },
    { name: 'IDX_subject_results_exam', columns: ['examId'] },
    {
      name: 'UQ_subject_result_per_exam',
      columns: ['examId', 'studentRollNumber', 'subjectCode'],
      unique: true,
    },
  ],
  columns: {
    id: { type: 'int', primary: true, generated: true },
    uploadId: { type: 'int', nullable: true },
    examId: { type: 'int' },
    studentRollNumber: { type: 'varchar', length: 50 },
    studentName: { type: 'varchar', length: 150, nullable: true },
    subjectCode: { type: 'varchar', length: 50 },
    subjectName: { type: 'varchar', length: 200 },
    grade: { type: 'varchar', length: 10 },
    /** Numeric grade points recorded by the result sheet, when available. */
    gradePoints: { type: 'decimal', precision: 4, scale: 2, nullable: true },
    passed: { type: 'boolean' },
    credits: { type: 'decimal', precision: 4, scale: 1, default: 0 },
    /** Enrollment type of the student's application on this exam */
    examType: { type: 'varchar', length: 30, nullable: true },
    /** Semester the subject belongs to (from the exam's academic scope) */
    yearOfStudy: { type: 'int' },
    semester: { type: 'int' },
    /** 1 = first attempt; supply attempts increment */
    attemptNumber: { type: 'int', default: 1 },
    createdAt: { type: 'datetime', createDate: true },
    updatedAt: { type: 'datetime', updateDate: true },
  },
  relations: {
    exam: {
      type: 'many-to-one',
      target: 'Exam',
      joinColumn: { name: 'examId' },
      onDelete: 'CASCADE',
    },
    upload: {
      type: 'many-to-one',
      target: 'ResultUpload',
      joinColumn: { name: 'uploadId' },
      onDelete: 'SET NULL',
    },
  },
});

module.exports = { ResultUpload, SubjectResult };
