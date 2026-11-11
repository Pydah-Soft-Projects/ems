'use strict';

const { EntitySchema } = require('typeorm');

const RegulationMarksAuditLog = new EntitySchema({
  name: 'RegulationMarksAuditLog',
  tableName: 'regulation_marks_audit_logs',
  indices: [
    {
      name: 'IDX_reg_marks_audit_code',
      columns: ['regulationCode'],
    },
    {
      name: 'IDX_reg_marks_audit_reg_id',
      columns: ['regulationId'],
    },
    {
      name: 'IDX_reg_marks_audit_created',
      columns: ['createdAt'],
    },
  ],
  columns: {
    id: { type: 'int', primary: true, generated: true },
    regulationId: { type: 'int', nullable: true }, // null for GLOBAL_DEFAULT
    regulationCode: { type: 'varchar', length: 50, nullable: true },
    regulationName: { type: 'varchar', length: 200, nullable: true },
    action: { type: 'varchar', length: 50 }, // CREATED, UPDATED, RESET_TO_DEFAULT
    changedByEmail: { type: 'varchar', length: 180, nullable: true },
    changedByName: { type: 'varchar', length: 180, nullable: true },
    changedByRole: { type: 'varchar', length: 80, nullable: true },
    fromState: { type: 'simple-json', nullable: true },
    toState: { type: 'simple-json', nullable: true },
    changes: { type: 'simple-json', nullable: true }, // Array of { field, label, from, to }
    remarks: { type: 'text', nullable: true },
    createdAt: { type: 'datetime', createDate: true },
  },
});

module.exports = { RegulationMarksAuditLog };

