'use strict';

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { config } = require('../config');
const { AppError } = require('../common/errors');
const { HrmsUserModel, isHrmsConnected } = require('./hrms-user.model');

class AuthService {
  constructor(sdms) {
    this.sdms = sdms;
  }

  isSuperAdminRole(role) {
    if (!role) return false;
    const expected = config.hrms.superAdminRole
      .toLowerCase()
      .replace(/\s+/g, '_');
    const normalized = role.toLowerCase().replace(/\s+/g, '_');
    return (
      normalized === expected ||
      normalized === 'superadmin' ||
      normalized === 'super_admin'
    );
  }

  hasSuperAdminAccess(user) {
    return (
      this.isSuperAdminRole(user.role) ||
      (user.roles ?? []).some((role) => this.isSuperAdminRole(role))
    );
  }

  isUserActive(user) {
    if (user.isActive === false) return false;
    if (user.status?.toLowerCase() === 'inactive') return false;
    return true;
  }

  async login(dto) {
    if (!isHrmsConnected()) {
      throw AppError.serviceUnavailable(
        'Staff authentication is unavailable (HRMS MongoDB is not connected)',
      );
    }

    const email = dto.username.trim().toLowerCase();
    const user = await HrmsUserModel.findOne({ email })
      .select('+password')
      .exec();

    if (!user || !this.isUserActive(user)) {
      throw AppError.unauthorized('Invalid credentials');
    }
    if (!this.hasSuperAdminAccess(user)) {
      throw AppError.unauthorized(
        'Only Super Admin accounts can access the Examination Portal',
      );
    }
    if (!user.password) {
      throw AppError.unauthorized('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw AppError.unauthorized('Invalid credentials');

    const userId = user._id.toString();
    const fullName = user.name || user.email || 'Super Admin';
    const payload = {
      sub: userId,
      username: user.email || email,
      role: 'super_admin',
      fullName,
    };

    const accessToken = jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    return {
      accessToken,
      user: {
        id: userId,
        username: payload.username,
        fullName,
        role: 'super_admin',
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
      throw AppError.unauthorized('Invalid PIN or password');
    }

    const { credentials, student } = match;
    const valid = await bcrypt.compare(password, credentials.passwordHash);
    if (!valid) {
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

  async validateUser(userId) {
    const user = await HrmsUserModel.findById(userId).exec();
    if (!user || !this.isUserActive(user) || !this.hasSuperAdminAccess(user)) {
      return null;
    }
    return user;
  }
}

module.exports = { AuthService };
