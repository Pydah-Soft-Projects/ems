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
    const emsUser =
      (await this.users.findUserByHrmsId(hrmsUserId, hrmsSource)) ||
      (await this.users.findUserByHrmsIdAnySource?.(hrmsUserId)) ||
      (await this.users.findUserByHrmsIdentity?.(email, employeeNumber));
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
    let user = await HrmsUserModel.findOne({
      $or: [
        { email },
        { employeeId: identity },
        { emp_no: identity },
        { username: identity },
      ],
    })
      .select('+password +plain_password')
      .exec();

    // Employee-only HRMS records are valid EMS identities too. A users
    // collection account wins when both collections represent the same person.
    if (!user) {
      user = await HrmsEmployeeModel.findOne({
        $or: [{ email }, { emp_no: identity }],
      })
        .select('+password +plain_password')
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

    const candidatePasswords = [
      user.password,
      user.plain_password,
    ].filter((p) => typeof p === 'string' && p.trim().length > 0);

    if (candidatePasswords.length === 0) {
      log.warn(
        { event: 'auth.staff.failed', email, reason: 'no_password_set' },
        'Staff login failed',
      );
      throw AppError.unauthorized('Invalid credentials');
    }

    let valid = false;
    for (const stored of candidatePasswords) {
      const isMatch = String(stored).startsWith('$2')
        ? await bcrypt.compare(dto.password, String(stored))
        : String(dto.password) === String(stored);
      if (isMatch) {
        valid = true;
        break;
      }
    }

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

  /**
   * Single Sign-On (SSO) login via CRM Authentication Gateway.
   * 1. Verifies the encrypted SSO token with CRM backend (/auth/verify-token).
   * 2. Checks token validity and expiration.
   * 3. Resolves user identity as Student (via SDMS) or Staff (via HRMS + EMS roles).
   * 4. Issues an EMS JWT session token.
   *
   * @param {Object} dto - { encryptedToken: string, ssoToken?: string, token?: string }
   * @returns {Promise<{ accessToken: string, user: Object }>}
   */
  async loginWithSsoToken(dto) {
    const encryptedToken = String(
      dto?.encryptedToken ?? dto?.token ?? dto?.ssoToken ?? '',
    ).trim();

    if (!encryptedToken) {
      throw AppError.badRequest('Encrypted SSO token is required');
    }

    const base = (
      config.crm?.backendUrl || 'https://crm.pydah.edu.in'
    ).replace(/\/$/, '');
    let crmVerifyUrl = base.endsWith('/auth/verify-token')
      ? base
      : `${base}/auth/verify-token`;

    let verifyResult;
    try {
      let response = await fetch(crmVerifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encryptedToken }),
        signal: AbortSignal.timeout(10000),
      });

      // If 404 and base URL didn't include /api, fallback to /api/auth/verify-token
      if (response.status === 404 && !base.includes('/api')) {
        const altUrl = `${base}/api/auth/verify-token`;
        const altResponse = await fetch(altUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ encryptedToken }),
          signal: AbortSignal.timeout(10000),
        }).catch(() => null);

        if (altResponse && altResponse.status !== 404) {
          response = altResponse;
          crmVerifyUrl = altUrl;
        }
      }

      const bodyText = await response.text();
      try {
        verifyResult = JSON.parse(bodyText);
      } catch {
        log.error(
          { event: 'auth.sso.invalid_json', status: response.status, body: bodyText },
          'CRM verify-token returned invalid JSON',
        );
        throw AppError.badGateway(
          `CRM gateway returned invalid response (Status: ${response.status})`,
        );
      }
    } catch (err) {
      if (err.isAppError || (typeof err === 'object' && err !== null && 'status' in err)) {
        throw err;
      }
      const cause = err?.cause;
      const causeDetails = cause
        ? ` (${cause.code || cause.message || String(cause)})`
        : '';
      const msg =
        err instanceof Error ? err.message : 'Failed to connect to CRM gateway';
      log.error(
        { event: 'auth.sso.fetch_failed', url: crmVerifyUrl, error: msg, cause },
        'CRM verify-token request failed',
      );
      throw AppError.badGateway(
        `CRM verify-token connection failed: ${msg}${causeDetails} [Target: ${crmVerifyUrl}]`,
      );
    }

    if (!verifyResult || !verifyResult.success || !verifyResult.valid) {
      const msg = verifyResult?.message || 'Invalid or expired SSO token';
      log.warn({ event: 'auth.sso.rejected', message: msg }, 'CRM rejected SSO token');
      throw AppError.unauthorized(msg);
    }

    const data = verifyResult.data || {};
    if (data.expiresAt) {
      const expiry = new Date(data.expiresAt).getTime();
      if (!Number.isNaN(expiry) && Date.now() >= expiry) {
        throw AppError.unauthorized('SSO token has expired');
      }
    }

    const email = this.normalizeEmail(
      data.email ||
        (String(data.username || '').includes('@') ? data.username : ''),
    );
    const employeeId = String(data.employeeId ?? data.emp_no ?? '').trim();
    const username = String(data.username ?? data.userId ?? '').trim();
    const pinNoCandidate = String(
      data.pinNo ?? data.rollNumber ?? data.pin ?? '',
    ).trim();

    // ─────────────────────────────────────────────────────────────
    // 1. Check if user is a Student
    // ─────────────────────────────────────────────────────────────
    const isStudentHint =
      data.role === 'student' ||
      data.databaseSource === 'student_credentials' ||
      data.databaseSource === 'student_database' ||
      data.portalId === 'student-portal' ||
      Boolean(pinNoCandidate);

    if (isStudentHint && this.sdms) {
      const candidatePin = pinNoCandidate || username;
      let match = candidatePin
        ? await this.sdms.findStudentCredentials(candidatePin)
        : null;

      if (!match && data.userId && !Number.isNaN(Number(data.userId))) {
        const studentById = await this.sdms.getStudent(Number(data.userId));
        if (studentById) {
          match = {
            student: studentById,
            credentials: {
              username: studentById.pinNo || String(studentById.id),
            },
          };
        }
      }

      if (match && match.student) {
        const student = match.student;
        const resolvedPin =
          student.pinNo ?? match.credentials?.username ?? candidatePin;
        const mobile = this.sdms.resolveStudentContact(student);

        const payload = {
          sub: `student:${student.id}`,
          username: resolvedPin,
          role: 'student',
          pinNo: resolvedPin,
          studentId: student.id,
          fullName: student.studentName,
        };

        const accessToken = jwt.sign(payload, config.jwt.secret, {
          expiresIn: config.jwt.expiresIn,
        });

        log.info(
          {
            event: 'auth.sso.student.succeeded',
            studentId: student.id,
            pin: resolvedPin,
          },
          'Student SSO login succeeded',
        );

        return {
          accessToken,
          user: {
            id: String(student.id),
            username: resolvedPin,
            fullName: student.studentName,
            role: 'student',
            pinNo: resolvedPin,
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
    }

    // ─────────────────────────────────────────────────────────────
    // 2. Check if user is Bootstrap Super Admin
    // ─────────────────────────────────────────────────────────────
    if (email && this.isBootstrapEmail(email)) {
      if (this.users) {
        await this.users.ensureSystemRole();
      }
      const access = {
        hrmsUserId: String(data.userId || data.hrmsUserId || 'bootstrap-admin'),
        hrmsSource: 'user',
        email,
        employeeNumber: employeeId || null,
        fullName: data.name || data.fullName || 'EMS Super Administrator',
        roleId: null,
        roleName: SYSTEM_SUPER_ADMIN_ROLE_NAME,
        privileges: ['*', ...ALL_PRIVILEGE_KEYS],
        isSuperAdmin: true,
        emsUserId: null,
        bootstrap: true,
      };

      const payload = this.buildStaffPayload(access);
      const accessToken = jwt.sign(payload, config.jwt.secret, {
        expiresIn: config.jwt.expiresIn,
      });

      log.info(
        { event: 'auth.sso.bootstrap_admin.succeeded', email },
        'Bootstrap super admin SSO login succeeded',
      );

      return {
        accessToken,
        user: {
          id: access.hrmsUserId,
          username: access.email,
          email: access.email,
          employeeNumber: access.employeeNumber,
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

    // ─────────────────────────────────────────────────────────────
    // 3. Resolve Staff via HRMS MongoDB
    // ─────────────────────────────────────────────────────────────
    let hrmsUser = null;
    let hrmsSource = 'user';

    if (isHrmsConnected()) {
      const orConditions = [];
      if (data.hrmsUserId && /^[0-9a-fA-F]{24}$/.test(String(data.hrmsUserId))) {
        orConditions.push({ _id: data.hrmsUserId });
      }
      if (data.userId && /^[0-9a-fA-F]{24}$/.test(String(data.userId))) {
        orConditions.push({ _id: data.userId });
      }
      if (email) {
        orConditions.push({ email });
      }
      if (employeeId) {
        orConditions.push({ employeeId });
        orConditions.push({ emp_no: employeeId });
      }
      if (username) {
        orConditions.push({ username });
        orConditions.push({ employeeId: username });
        orConditions.push({ emp_no: username });
      }

      if (orConditions.length > 0) {
        hrmsUser = await HrmsUserModel.findOne({ $or: orConditions }).exec();
        if (!hrmsUser) {
          hrmsUser = await HrmsEmployeeModel.findOne({ $or: orConditions }).exec();
          if (hrmsUser) hrmsSource = 'employee';
        }
      }
    }

    if (hrmsUser) {
      const access = await this.resolveStaffAccess(hrmsUser, hrmsSource);
      if (!access) {
        log.warn(
          {
            event: 'auth.sso.staff.denied',
            email,
            hrmsUserId: hrmsUser._id.toString(),
            reason: 'no_ems_role_assigned',
          },
          'Staff SSO login denied: No EMS role assigned',
        );
        throw AppError.forbidden(
          'Your account is verified via CRM, but you do not have an active EMS role assigned. Contact an EMS Super Admin to grant you access.',
        );
      }

      const payload = this.buildStaffPayload(access);
      const accessToken = jwt.sign(payload, config.jwt.secret, {
        expiresIn: config.jwt.expiresIn,
      });

      log.info(
        {
          event: 'auth.sso.staff.succeeded',
          email: access.email,
          hrmsUserId: access.hrmsUserId,
          role: access.roleName,
        },
        'Staff SSO login succeeded via HRMS',
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

    // ─────────────────────────────────────────────────────────────
    // 4. Check EMS Users table directly (if HRMS is offline or record unlinked)
    // ─────────────────────────────────────────────────────────────
    if (this.users) {
      const emsUser =
        (await this.users.findUserByHrmsIdentity(email, employeeId)) ||
        (email ? await this.users.findUserByEmail(email) : null);

      if (
        emsUser &&
        emsUser.isActive !== false &&
        emsUser.role &&
        emsUser.role.isActive !== false
      ) {
        const isSuperAdmin = Boolean(emsUser.role.isSystemSuperAdmin);
        const privileges = isSuperAdmin
          ? ['*', ...ALL_PRIVILEGE_KEYS]
          : Array.isArray(emsUser.privileges) && emsUser.privileges.length > 0
            ? [...emsUser.privileges]
            : Array.isArray(emsUser.role.privileges)
              ? [...emsUser.role.privileges]
              : [];

        const access = {
          hrmsUserId: emsUser.hrmsUserId || String(emsUser.id),
          hrmsSource: emsUser.hrmsSource || 'user',
          email: emsUser.email || email,
          employeeNumber: emsUser.employeeNumber || employeeId,
          fullName: emsUser.fullName,
          roleId: emsUser.role.id,
          roleName: emsUser.role.name,
          privileges,
          isSuperAdmin,
          emsUserId: emsUser.id,
          bootstrap: false,
        };

        const payload = this.buildStaffPayload(access);
        const accessToken = jwt.sign(payload, config.jwt.secret, {
          expiresIn: config.jwt.expiresIn,
        });

        return {
          accessToken,
          user: {
            id: String(emsUser.id),
            username:
              access.email || access.employeeNumber || String(emsUser.id),
            email: access.email,
            employeeNumber: access.employeeNumber,
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
    }

    // ─────────────────────────────────────────────────────────────
    // 5. Fallback Student check by username or userId
    // ─────────────────────────────────────────────────────────────
    if (this.sdms && username) {
      const match = await this.sdms.findStudentCredentials(username);
      if (match && match.student) {
        const student = match.student;
        const resolvedPin =
          student.pinNo ?? match.credentials?.username ?? username;
        const mobile = this.sdms.resolveStudentContact(student);

        const payload = {
          sub: `student:${student.id}`,
          username: resolvedPin,
          role: 'student',
          pinNo: resolvedPin,
          studentId: student.id,
          fullName: student.studentName,
        };

        const accessToken = jwt.sign(payload, config.jwt.secret, {
          expiresIn: config.jwt.expiresIn,
        });

        return {
          accessToken,
          user: {
            id: String(student.id),
            username: resolvedPin,
            fullName: student.studentName,
            role: 'student',
            pinNo: resolvedPin,
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
    }

    log.warn(
      {
        event: 'auth.sso.unmatched',
        data: { email, employeeId, username, role: data.role },
      },
      'SSO user could not be mapped to any EMS student or staff account',
    );
    throw AppError.unauthorized(
      'Your account was verified by CRM, but could not be mapped to an Examination Management System user.',
    );
  }
}

module.exports = { AuthService };
