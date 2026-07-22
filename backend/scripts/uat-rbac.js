'use strict';

/**
 * UAT for EMS User Management / RBAC.
 * Uses throwaway SQLite + in-memory MongoDB — never touches live RDS/HRMS.
 * Usage: node scripts/uat-rbac.js
 */

process.env.SIMULATE_USE_SQLITE = 'true';
process.env.SIMULATE_SQLITE_PATH = `./data/uat-rbac-${Date.now()}.sqlite`;
process.env.JWT_SECRET = 'uat-rbac-secret';
process.env.EMS_BOOTSTRAP_SUPERADMIN_EMAIL = 'ravi@pydahsoft.in';

const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const results = [];
function record(step, ok, detail) {
  results.push({ step, ok });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${step}${detail ? ` — ${detail}` : ''}`);
}

async function expectReject(step, promise, messagePart) {
  try {
    await promise;
    record(step, false, 'expected rejection but succeeded');
  } catch (err) {
    const ok =
      !messagePart ||
      String(err.message).toLowerCase().includes(messagePart.toLowerCase());
    record(step, ok, `error="${err.message}"`);
  }
}

async function run() {
  const mongod = await MongoMemoryServer.create();
  process.env.HRMS_MONGODB_URI = mongod.getUri();

  const {
    connectHrmsMongo,
    HrmsUserModel,
    HrmsEmployeeModel,
    disconnectHrmsMongo,
  } = require('../src/auth/hrms-user.model');
  const { createExamPortalDataSource } = require('../src/database/data-source');
  const { createServices } = require('../src/database/container');
  const { hasPrivilege } = require('../src/auth/permissions');

  await connectHrmsMongo();
  const dataSource = createExamPortalDataSource();
  await dataSource.initialize();
  const services = createServices(dataSource);

  try {
    await services.users.ensureSystemRole();

    const passwordHash = await bcrypt.hash('Pass@123', 10);
    const ravi = await HrmsUserModel.create({
      email: 'ravi@pydahsoft.in',
      password: passwordHash,
      name: 'Ravi Bootstrap',
      role: 'employee',
      roles: [],
      isActive: true,
    });
    const hrmsSuper = await HrmsUserModel.create({
      email: 'hrms-super@example.com',
      password: passwordHash,
      name: 'HRMS Super',
      role: 'super_admin',
      roles: ['super_admin'],
      isActive: true,
    });
    const alice = await HrmsUserModel.create({
      email: 'alice@example.com',
      password: passwordHash,
      name: 'Alice Staff',
      role: 'employee',
      roles: ['employee'],
      isActive: true,
    });
    const bob = await HrmsUserModel.create({
      email: 'bob@example.com',
      password: passwordHash,
      name: 'Bob Unprovisioned',
      role: 'super_admin',
      roles: ['super_admin'],
      isActive: true,
    });
    const employeeOnly = await HrmsEmployeeModel.create({
      emp_no: '2144',
      employee_name: 'Employee Only',
      email: 'employee2144@example.com',
      plain_password: 'Emp@123',
      is_active: true,
    });
    const overlappingEmployee = await HrmsEmployeeModel.create({
      emp_no: '3001',
      employee_name: 'Overlapping Identity',
      email: 'overlap@example.com',
      plain_password: 'Overlap@123',
      is_active: true,
    });
    await HrmsUserModel.create({
      email: 'overlap@example.com',
      password: passwordHash,
      name: 'Overlapping Identity',
      employeeId: '3001',
      employeeRef: overlappingEmployee._id,
      role: 'employee',
      isActive: true,
    });

    // 1) Ravi bootstrap — unrestricted without EMS row
    const raviLogin = await services.auth.login({
      username: 'ravi@pydahsoft.in',
      password: 'Pass@123',
    });
    record(
      'Ravi bootstrap login succeeds with Super Admin',
      raviLogin.user.isSuperAdmin === true &&
        raviLogin.user.privileges?.includes('*'),
      `role=${raviLogin.user.role}`,
    );

    // 2) Unprovisioned HRMS super_admin denied
    await expectReject(
      'Unprovisioned HRMS Super Admin denied EMS login',
      services.auth.login({
        username: 'bob@example.com',
        password: 'Pass@123',
      }),
      'do not have an EMS role',
    );

    // 3) Create Examination Cell role with limited privileges
    const examCell = await services.users.createRole(
      {
        name: 'Examination Cell',
        description: 'Exams only',
        privileges: [
          'dashboard:view',
          'exams:read',
          'exams:write',
          'exams:submit',
          'regulations:read',
        ],
      },
      {
        email: 'ravi@pydahsoft.in',
        hrmsUserId: ravi._id.toString(),
        isSuperAdmin: true,
      },
    );
    record(
      'Create Examination Cell role',
      examCell.id > 0 && examCell.privileges.includes('exams:write'),
    );

    // 4) Provision Alice into Examination Cell
    const aliceUser = await services.users.createUser(
      {
        hrmsUserId: alice._id.toString(),
        roleId: examCell.id,
      },
      {
        email: 'ravi@pydahsoft.in',
        hrmsUserId: ravi._id.toString(),
        isSuperAdmin: true,
      },
    );
    record(
      'Provision Alice from HRMS into Examination Cell',
      aliceUser.email === 'alice@example.com' &&
        aliceUser.role?.name === 'Examination Cell' &&
        aliceUser.privileges.includes('exams:write'),
    );

    const aliceLogin = await services.auth.login({
      username: 'alice@example.com',
      password: 'Pass@123',
    });
    record(
      'Alice login returns Examination Cell privileges',
      aliceLogin.user.emsRoleName === 'Examination Cell' &&
        hasPrivilege(aliceLogin.user.privileges, 'exams:write') &&
        !hasPrivilege(aliceLogin.user.privileges, 'fees:collect'),
      `privs=${aliceLogin.user.privileges?.join(',')}`,
    );

    // 5) Middleware-style privilege check via requirePrivilege semantics
    record(
      'Alice lacks fees:collect',
      !hasPrivilege(aliceLogin.user.privileges, 'fees:collect'),
    );
    record(
      'Alice has exams:read',
      hasPrivilege(aliceLogin.user.privileges, 'exams:read'),
    );

    // 6) Role template changes do NOT rewrite existing user privileges
    await services.users.updateRole(
      examCell.id,
      { privileges: ['dashboard:view', 'exams:read'] },
      {
        email: 'ravi@pydahsoft.in',
        hrmsUserId: ravi._id.toString(),
        isSuperAdmin: true,
      },
    );
    const accessAfterRoleEdit = await services.auth.validateStaffAccess(
      alice._id.toString(),
    );
    record(
      'Role privilege edit does not change existing user privileges',
      accessAfterRoleEdit &&
        hasPrivilege(accessAfterRoleEdit.privileges, 'exams:write') &&
        hasPrivilege(accessAfterRoleEdit.privileges, 'exams:read'),
    );

    // 6b) Editing the user privileges does take effect immediately
    await services.users.updateUser(
      aliceUser.id,
      { privileges: ['dashboard:view', 'exams:read'] },
      {
        email: 'ravi@pydahsoft.in',
        hrmsUserId: ravi._id.toString(),
        isSuperAdmin: true,
      },
    );
    const accessAfterUserEdit = await services.auth.validateStaffAccess(
      alice._id.toString(),
    );
    record(
      'User privilege edit takes effect on revalidate (exams:write removed)',
      accessAfterUserEdit &&
        hasPrivilege(accessAfterUserEdit.privileges, 'exams:read') &&
        !hasPrivilege(accessAfterUserEdit.privileges, 'exams:write'),
    );

    // 7) Deactivate Alice → login denied
    await services.users.updateUser(
      aliceUser.id,
      { isActive: false },
      {
        email: 'ravi@pydahsoft.in',
        hrmsUserId: ravi._id.toString(),
        isSuperAdmin: true,
      },
    );
    await expectReject(
      'Deactivated EMS user cannot login',
      services.auth.login({
        username: 'alice@example.com',
        password: 'Pass@123',
      }),
      'do not have an EMS role',
    );

    // Re-activate for further tests
    await services.users.updateUser(
      aliceUser.id,
      { isActive: true },
      {
        email: 'ravi@pydahsoft.in',
        hrmsUserId: ravi._id.toString(),
        isSuperAdmin: true,
      },
    );

    // 8) Non-super cannot assign Super Admin role
    const systemRole = await services.users.ensureSystemRole();
    await expectReject(
      'Non-super Alice cannot assign Super Admin role',
      services.users.createUser(
        {
          hrmsUserId: hrmsSuper._id.toString(),
          roleId: systemRole.id,
        },
        {
          email: 'alice@example.com',
          hrmsUserId: alice._id.toString(),
          isSuperAdmin: false,
          privileges: aliceLogin.user.privileges,
        },
      ),
      'Only Super Admin',
    );

    // 9) Ravi can assign Super Admin only to HRMS Super Admin
    await expectReject(
      'Cannot assign Super Admin to non-HRMS-super Alice',
      services.users.updateUser(
        aliceUser.id,
        { roleId: systemRole.id },
        {
          email: 'ravi@pydahsoft.in',
          hrmsUserId: ravi._id.toString(),
          isSuperAdmin: true,
        },
      ),
      'HRMS Super Admin',
    );

    const superUser = await services.users.createUser(
      {
        hrmsUserId: hrmsSuper._id.toString(),
        roleId: systemRole.id,
      },
      {
        email: 'ravi@pydahsoft.in',
        hrmsUserId: ravi._id.toString(),
        isSuperAdmin: true,
      },
    );
    record(
      'Ravi provisions HRMS Super Admin as EMS Super Admin',
      superUser.role?.isSystemSuperAdmin === true,
    );

    const superLogin = await services.auth.login({
      username: 'hrms-super@example.com',
      password: 'Pass@123',
    });
    record(
      'Provisioned EMS Super Admin login is unrestricted',
      superLogin.user.isSuperAdmin === true,
    );

    // 10) HRMS search returns safe fields, no password
    const search = await services.users.searchHrmsUsers({ q: 'alice' });
    record(
      'HRMS search returns Alice without password field',
      search.items.some((i) => i.email === 'alice@example.com') &&
        !Object.prototype.hasOwnProperty.call(search.items[0] || {}, 'password'),
    );

    const employeeSearch = await services.users.searchHrmsUsers({ q: '2144' });
    const employeeCandidate = employeeSearch.items.find(
      (item) =>
        item.source === 'employee' && item.employeeNumber === '2144',
    );
    record(
      'Employee-number search includes employees collection',
      employeeCandidate?.id === employeeOnly._id.toString(),
    );
    const overlapSearch = await services.users.searchHrmsUsers({ q: '3001' });
    const overlapMatches = overlapSearch.items.filter(
      (item) => item.employeeNumber === '3001',
    );
    record(
      'Overlapping employee/user records are deduplicated to login user',
      overlapMatches.length === 1 && overlapMatches[0].source === 'user',
    );
    const employeeEmsUser = await services.users.createUser(
      {
        hrmsUserId: employeeOnly._id.toString(),
        hrmsSource: 'employee',
        roleId: examCell.id,
        privileges: ['dashboard:view', 'exams:read', 'fees:collect'],
      },
      {
        email: 'ravi@pydahsoft.in',
        hrmsUserId: ravi._id.toString(),
        isSuperAdmin: true,
      },
    );
    record(
      'Employee-only HRMS identity can be provisioned with user privileges',
      employeeEmsUser.hrmsSource === 'employee' &&
        employeeEmsUser.privileges.includes('fees:collect') &&
        employeeEmsUser.privileges.includes('exams:read'),
    );
    const employeeLogin = await services.auth.login({
      username: '2144',
      password: 'Emp@123',
    });
    record(
      'Employee number login uses user-level privileges only',
      hasPrivilege(employeeLogin.user.privileges, 'exams:read') &&
        hasPrivilege(employeeLogin.user.privileges, 'fees:collect') &&
        !hasPrivilege(employeeLogin.user.privileges, 'exams:write'),
    );

    // 11) Cannot provision bootstrap email
    await expectReject(
      'Cannot provision ravi@pydahsoft.in as EMS user row',
      services.users.createUser(
        {
          hrmsUserId: ravi._id.toString(),
          roleId: examCell.id,
        },
        {
          email: 'ravi@pydahsoft.in',
          hrmsUserId: ravi._id.toString(),
          isSuperAdmin: true,
        },
      ),
      'unrestricted EMS access',
    );

    // 12) Self-lockout prevention
    await expectReject(
      'Super Admin cannot deactivate themselves',
      services.users.updateUser(
        superUser.id,
        { isActive: false },
        {
          email: 'hrms-super@example.com',
          hrmsUserId: hrmsSuper._id.toString(),
          isSuperAdmin: true,
        },
      ),
      'cannot deactivate your own',
    );

    // 13) Wrong password still fails for Ravi
    await expectReject(
      'Wrong password rejected for bootstrap Super Admin',
      services.auth.login({
        username: 'ravi@pydahsoft.in',
        password: 'wrong',
      }),
      'Invalid credentials',
    );

    // 14) Audit log has entries
    const audits = await services.users.listAuditLogs({ limit: 50 });
    record(
      'Audit log records role/user actions',
      audits.total >= 3,
      `total=${audits.total}`,
    );

    // 15) System role cannot be edited/deleted
    await expectReject(
      'System Super Admin role cannot be edited',
      services.users.updateRole(
        systemRole.id,
        { name: 'Hacked' },
        {
          email: 'ravi@pydahsoft.in',
          hrmsUserId: ravi._id.toString(),
          isSuperAdmin: true,
        },
      ),
      'cannot be edited',
    );
  } catch (err) {
    record('Unexpected error', false, err.message);
    console.error(err);
  }

  await dataSource.destroy();
  await disconnectHrmsMongo();
  await mongod.stop();

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log('\n========== RBAC UAT REPORT ==========');
  console.log(`Passed: ${passed} / ${results.length}`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
