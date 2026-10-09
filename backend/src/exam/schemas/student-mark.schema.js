'use strict';

const { EntitySchema } = require('typeorm');

/**
 * Unified record for student marks across Internal, External, Exam Results, and Revaluation.
 */
const StudentMark = new EntitySchema({
  name: 'StudentMark',
  tableName: 'student_marks',
  indices: [
    {
      name: 'IDX_student_marks_lookup',
      columns: ['category', 'examId', 'studentRollNumber', 'subjectCode'],
    },
    {
      name: 'IDX_student_marks_roll',
      columns: ['studentRollNumber'],
    },
    {
      name: 'IDX_student_marks_exam',
      columns: ['examId'],
    },
    {
      name: 'IDX_student_marks_reval',
      columns: ['revaluationId'],
    },
  ],
  columns: {
    id: { type: 'int', primary: true, generated: true },
    category: { type: 'varchar', length: 30 }, // 'INTERNAL', 'EXTERNAL', 'RESULT', 'REVALUATION'
    examId: { type: 'int', nullable: true },
    revaluationId: { type: 'int', nullable: true },
    studentRollNumber: { type: 'varchar', length: 50 },
    studentName: { type: 'varchar', length: 150, nullable: true },
    subjectCode: { type: 'varchar', length: 50 },
    subjectName: { type: 'varchar', length: 200, nullable: true },
    
    // Marks fields
    internalMarks: { type: 'decimal', precision: 5, scale: 2, nullable: true },
    maxInternalMarks: { type: 'decimal', precision: 5, scale: 2, nullable: true },
    externalMarks: { type: 'decimal', precision: 5, scale: 2, nullable: true },
    maxExternalMarks: { type: 'decimal', precision: 5, scale: 2, nullable: true },
    totalMarks: { type: 'decimal', precision: 5, scale: 2, nullable: true },
    maxTotalMarks: { type: 'decimal', precision: 5, scale: 2, nullable: true },
    
    // Result fields
    grade: { type: 'varchar', length: 10, nullable: true },
    gradePoints: { type: 'decimal', precision: 4, scale: 2, nullable: true },
    credits: { type: 'decimal', precision: 4, scale: 1, nullable: true },
    passed: { type: 'boolean', nullable: true },
    isAbsent: { type: 'boolean', default: false },
    
    // Revaluation specific fields
    originalGrade: { type: 'varchar', length: 10, nullable: true },
    updatedGrade: { type: 'varchar', length: 10, nullable: true },
    originalMarks: { type: 'decimal', precision: 5, scale: 2, nullable: true },
    updatedMarks: { type: 'decimal', precision: 5, scale: 2, nullable: true },
    
    // Status & Metadata
    status: { type: 'varchar', length: 50, nullable: true }, // 'PASSED', 'FAILED', 'ABSENT', 'GRADE_CHANGED', 'NO_CHANGE'
    remarks: { type: 'text', nullable: true },
    uploadedBy: { type: 'varchar', length: 150, nullable: true },
    
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
    revaluationNotification: {
      type: 'many-to-one',
      target: 'RevaluationNotification',
      joinColumn: { name: 'revaluationId' },
      onDelete: 'CASCADE',
    },
  },
});

module.exports = { StudentMark };
