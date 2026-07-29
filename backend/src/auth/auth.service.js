'use strict';

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { config } = require('../config');
const { AppError } = require('../common/errors');
const {
  HrmsUserModel,
  HrmsEmployeeModel,
  isHrmsConnected,
} = require('./hrms-user.model');
const { operationLogger } = require('../common/logger');
const {
  ALL_PRIVILEGE_KEYS,
  SYSTEM_SUPER_ADMIN_ROLE_NAME,
} = require('./permissions');

const BOOTSTRAP_SUPER_ADMIN_EMAIL = (
  config.ems?.bootstrapSuperAdminEmail || 'ravi@pydahsoft.in'
).toLowerCase();
const log = operationLogger('authentication');

class AuthService {
  constructor(sdms, usersService) {
    this.sdms = sdms;
    this.users = usersService;
  }

  isUserActive(user) {
    if (user.isActive === false) return false;
    if (user.is_active === false) return false;
    if (user.status?.toLowerCase() === 'inactive') return false;
    return true;
  }

  normalizeEmail(email) {
    return String(email ?? '')
      .trim()
      .toLowerCase();
  }

  isBootstrapEmail(email) {
    return this.normalizeEmail(email) === BOOTSTRAP_SUPER_ADMIN_EMAIL;
  }

  buildStaffPayload(access) {
    const username = access.email || access.employeeNumber || access.hrmsUserId;
    return {
      sub: access.hrmsUserId,
      username,
      email: access.email || null,
      employeeNumber: access.employeeNumber || null,
      fullName: access.fullName,
      role: access.isSuperAdmin ? 'super_admin' : 'staff',
      emsRoleId: access.roleId,
      emsRoleName: access.roleName,
      privileges: access.privileges,
      isSuperAdmin: access.isSuperAdmin,
      hrmsUserId: access.hrmsUserId,
      hrmsSource: access.hrmsSource || 'user',
      emsUserId: access.emsUserId,
    };
  }

  /**
   * Resolve EMS access for an authenticated HRMS user.
   * Ravi bypasses EMS provisioning with unrestricted privileges.
   * Everyone else needs an active EMS user + active role.
   */
  async resolveStaffAccess(hrmsUser, hrmsSource = 'user') {
    if (!hrmsUser || !this.isUserActive(hrmsUser)) {
      return null;
    }
    const email = this.normalizeEmail(hrmsUser.email) || null;
    const hrmsUserId = hrmsUser._id.toString();
    const employeeNumber =
      String(hrmsUser.emp_no ?? hrmsUser.employeeId ?? '').trim() || null;
    const fullName =
      hrmsUser.name || hrmsUser.employee_name || email || employeeNumber || 'Staff';

    if (this.isBootstrapEmail(email)) {
      if (this.users) {
        await this.users.ensureSystemRole();
      }
      return {
        hrmsUserId,
        hrmsSource,
        email,
        employeeNumber,
        fullName,
        roleId: null,
        roleName: SYSTEM_SUPER_ADMIN_ROLE_NAME,
        privileges: ['*', ...ALL_PRIVILEGE_KEYS],
        isSuperAdmin: true,
        emsUserId: null,
        bootstrap: true,
      };
    }

    if (!this.users) return null;
    const emsUser = await this.users.findUserByHrmsId(hrmsUserId, hrmsSource);
    if (!emsUser || emsUser.isActive === false) return null;
    const role = emsUser.role;
    if (!role || role.isActive === false) return null;

    const isSuperAdmin = !!role.isSystemSuperAdmin;
    // Authorization is user-level. Role privileges are only a create/edit template.
    const userPrivileges = Array.isArray(emsUser.privileges)
      ? emsUser.privileges
      : [];
    const privileges = isSuperAdmin
      ? ['*', ...ALL_PRIVILEGE_KEYS]
      : userPrivileges.length > 0
        ? [...userPrivileges]
        : Array.isArray(role.privileges)
          ? [...role.privileges]
          : [];

    return {
      hrmsUserId,
      hrmsSource,
      email: emsUser.email || email || null,
      employeeNumber: emsUser.employeeNumber || employeeNumber,
      fullName: emsUser.fullName || fullName,
      roleId: role.id,
      roleName: role.name,
      privileges,
      isSuperAdmin,
      emsUserId: emsUser.id,
      bootstrap: false,
    };
  }

  async login(dto) {
    if (!isHrmsConnected()) {
      log.error(
        { event: 'auth.staff.unavailable' },
        'Staff login unavailable because HRMS is disconnected',
      );
      throw AppError.serviceUnavailable(
        'Staff authentication is unavailable (HRMS MongoDB is not connected)',
      );
    }

    const identity = String(dto.username ?? '').trim();
    const email = this.normalizeEmail(identity);
    let hrmsSource = 'user';
    let user = await HrmsUserModel.findOne({ email })
      .select('+password')
      .exec();

    // Employee-only HRMS records are valid EMS identities too. A users
    // collection account wins when both collections represent the same person.
    if (!user) {
      user = await HrmsEmployeeModel.findOne({
        $or: [{ email }, { emp_no: identity }],
      })
        .select('+plain_password')
        .exec();
      hrmsSource = 'employee';
    }

    if (!user || !this.isUserActive(user)) {
      log.warn(
        { event: 'auth.staff.failed', email, reason: 'invalid_or_inactive' },
        'Staff login failed',
      );
      throw AppError.unauthorized('Invalid credentials');
    }
    const storedPassword =
      hrmsSource === 'employee' ? user.plain_password : user.password;
    if (!storedPassword) {
      throw AppError.unauthorized('Invalid credentials');
    }

    const valid = String(storedPassword).startsWith('$2')
      ? await bcrypt.compare(dto.password, storedPassword)
      : String(dto.password) === String(storedPassword);
    if (!valid) {
      log.warn(
        { event: 'auth.staff.failed', email, reason: 'invalid_password' },
        'Staff login failed',
      );
      throw AppError.unauthorized('Invalid credentials');
    }

    const access = await this.resolveStaffAccess(user, hrmsSource);
    if (!access) {
      log.warn(
        {
          event: 'auth.staff.failed',
          email,
          hrmsUserId: user._id.toString(),
          reason: 'ems_role_missing_or_inactive',
        },
        'Staff login denied by EMS authorization',
      );
      throw AppError.unauthorized(
        'You do not have an EMS role assigned. Contact an EMS Super Admin.',
      );
    }

    const payload = this.buildStaffPayload(access);
    const accessToken = jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });
    log.info(
      {
        event: 'auth.staff.succeeded',
        email: access.email,
        hrmsUserId: access.hrmsUserId,
        hrmsSource: access.hrmsSource,
        emsUserId: access.emsUserId,
        role: access.roleName,
        isSuperAdmin: access.isSuperAdmin,
      },
      'Staff login succeeded',
    );

    return {
      accessToken,
      user: {
        id: access.emsUserId ? String(access.emsUserId) : access.hrmsUserId,
        username: access.email || access.employeeNumber || access.hrmsUserId,
        email: access.email || null,
        employeeNumber: access.employeeNumber || null,
        fullName: access.fullName,
        role: payload.role,
        emsRoleId: access.roleId,
        emsRoleName: access.roleName,
        privileges: access.privileges,
        isSuperAdmin: access.isSuperAdmin,
        hrmsUserId: access.hrmsUserId,
        hrmsSource: access.hrmsSource,
        emsUserId: access.emsUserId,
      },
    };
  }

  async studentLogin(dto) {
    if (!this.sdms) {
      throw AppError.serviceUnavailable('Student database not connected');
    }

    const pin = dto.pinNo?.trim();
    const password = dto.password;
    if (!pin || !password) {
      throw AppError.badRequest('PIN and password are required');
    }

    const match = await this.sdms.findStudentCredentials(pin);
    if (!match) {
      log.warn(
        { event: 'auth.student.failed', pin, reason: 'credentials_not_found' },
        'Student login failed',
      );
      throw AppError.unauthorized('Invalid PIN or password');
    }

    const { credentials, student } = match;
    const valid = await bcrypt.compare(password, credentials.passwordHash);
    if (!valid) {
      log.warn(
        { event: 'auth.student.failed', pin, reason: 'invalid_password' },
        'Student login failed',
      );
      throw AppError.unauthorized('Invalid PIN or password');
    }

    const pinNo = student.pinNo ?? credentials.username;
    const mobile = this.sdms.resolveStudentContact(student);
    const payload = {
      sub: `student:${student.id}`,
      username: pinNo,
      role: 'student',
      pinNo,
      studentId: student.id,
      fullName: student.studentName,
    };

    const accessToken = jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });
    log.info(
      {
        event: 'auth.student.succeeded',
        studentId: student.id,
        pin: pinNo,
      },
      'Student login succeeded',
    );

    return {
      accessToken,
      user: {
        id: String(student.id),
        username: pinNo,
        fullName: student.studentName,
        role: 'student',
        pinNo,
        studentId: student.id,
        admissionNumber: student.admissionNumber,
        mobile,
        email: student.email ?? null,
        college: student.college,
        course: student.course,
        branch: student.branch,
        batch: student.batch,
        currentYear: student.currentYear,
        currentSemester: student.currentSemester,
        studentStatus: student.studentStatus,
      },
    };
  }

  /**
   * Re-validate staff on every request: HRMS still active + EMS access still valid.
   */
  async validateStaffAccess(hrmsUserId, hrmsSource = 'user') {
    if (!isHrmsConnected()) return null;
    const user =
      hrmsSource === 'employee'
        ? await HrmsEmployeeModel.findById(hrmsUserId).exec()
        : await HrmsUserModel.findById(hrmsUserId).exec();
    if (!user || !this.isUserActive(user)) return null;
    return this.resolveStaffAccess(user, hrmsSource);
  }

  /** @deprecated kept for older call sites — prefer validateStaffAccess */
  async validateUser(userId) {
    return this.validateStaffAccess(userId);
  }

  toMeResponse(access) {
    const payload = this.buildStaffPayload(access);
    return {
      id: access.emsUserId ? String(access.emsUserId) : access.hrmsUserId,
      username: access.email,
      email: access.email,
      fullName: access.fullName,
      role: payload.role,
      emsRoleId: access.roleId,
      emsRoleName: access.roleName,
      privileges: access.privileges,
      isSuperAdmin: access.isSuperAdmin,
      hrmsUserId: access.hrmsUserId,
      hrmsSource: access.hrmsSource || 'user',
      emsUserId: access.emsUserId,
    };
  }
}

module.exports = { AuthService };
