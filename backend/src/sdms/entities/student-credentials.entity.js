'use strict';

const { EntitySchema } = require('typeorm');

const SdmsStudentCredentials = new EntitySchema({
  name: 'SdmsStudentCredentials',
  tableName: 'student_credentials',
  columns: {
    id: { type: 'int', primary: true, generated: true },
    studentId: { type: 'int', name: 'student_id', unique: true },
    admissionNumber: {
      type: 'varchar',
      length: 100,
      name: 'admission_number',
      nullable: true,
    },
    username: { type: 'varchar', length: 100 },
    passwordHash: { type: 'varchar', length: 255, name: 'password_hash' },
    createdAt: { type: 'datetime', name: 'created_at', nullable: true },
    updatedAt: { type: 'datetime', name: 'updated_at', nullable: true },
    lastLogin: { type: 'datetime', name: 'last_login', nullable: true },
    loginCount: { type: 'int', name: 'login_count', default: 0 },
  },
});

module.exports = { SdmsStudentCredentials };
