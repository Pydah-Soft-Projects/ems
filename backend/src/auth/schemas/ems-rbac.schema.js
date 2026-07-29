'use strict';

const { EntitySchema } = require('typeorm');

const EmsRole = new EntitySchema({
  name: 'EmsRole',
  tableName: 'ems_roles',
  columns: {
    id: { type: 'int', primary: true, generated: true },
    name: { type: 'varchar', length: 120, unique: true },
    description: { type: 'varchar', length: 500, nullable: true },
    /** JSON array of privilege keys from the fixed catalog. */
    privileges: { type: 'simple-json' },
    isSystem: { type: 'boolean', default: false },
    isSystemSuperAdmin: { type: 'boolean', default: false },
    isActive: { type: 'boolean', default: true },
    createdByEmail: { type: 'varchar', length: 180, nullable: true },
    updatedByEmail: { type: 'varchar', length: 180, nullable: true },
    createdAt: { type: 'datetime', createDate: true },
    updatedAt: { type: 'datetime', updateDate: true },
  },
  relations: {
    users: {
      type: 'one-to-many',
      target: 'EmsUser',
      inverseSide: 'role',
    },
  },
});

const EmsUser = new EntitySchema({
  name: 'EmsUser',
  tableName: 'ems_users',
  indices: [
    {
      name: 'UQ_ems_users_hrmsUserId',
      columns: ['hrmsSource', 'hrmsUserId'],
      unique: true,
    },
    {
      name: 'UQ_ems_users_email',
      columns: ['email'],
      unique: true,
    },
  ],
  columns: {
    id: { type: 'int', primary: true, generated: true },
    /** HRMS Mongo ObjectId string — primary identity link. */
    hrmsUserId: { type: 'varchar', length: 64 },
    /** Source HRMS collection: users or employees. */
    hrmsSource: { type: 'varchar', length: 20, default: 'user' },
    employeeNumber: { type: 'varchar', length: 60, nullable: true },
    email: { type: 'varchar', length: 180, nullable: true },
    fullName: { type: 'varchar', length: 180, nullable: true },
    roleId: { type: 'int' },
    /**
     * Effective privileges for this user.
     * Role privileges are only a template when creating/editing — runtime
     * authorization uses this user-level list.
     */
    privileges: { type: 'simple-json', nullable: true },
    isActive: { type: 'boolean', default: true },
    createdByEmail: { type: 'varchar', length: 180, nullable: true },
    updatedByEmail: { type: 'varchar', length: 180, nullable: true },
    createdAt: { type: 'datetime', createDate: true },
    updatedAt: { type: 'datetime', updateDate: true },
  },
  relations: {
    role: {
      type: 'many-to-one',
      target: 'EmsRole',
      joinColumn: { name: 'roleId' },
      eager: true,
    },
  },
});

const EmsAuditLog = new EntitySchema({
  name: 'EmsAuditLog',
  tableName: 'ems_audit_logs',
  columns: {
    id: { type: 'int', primary: true, generated: true },
    actorEmail: { type: 'varchar', length: 180, nullable: true },
    actorHrmsUserId: { type: 'varchar', length: 64, nullable: true },
    action: { type: 'varchar', length: 80 },
    targetType: { type: 'varchar', length: 40 },
    targetId: { type: 'varchar', length: 80, nullable: true },
    detail: { type: 'simple-json', nullable: true },
    createdAt: { type: 'datetime', createDate: true },
  },
});

module.exports = { EmsRole, EmsUser, EmsAuditLog };
