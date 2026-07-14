import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { config } from '../config';
import { AppError } from '../common/errors';
import { HrmsUserModel } from './hrms-user.model';
import type { SdmsService } from '../sdms/sdms.service';

export class AuthService {
  constructor(private readonly sdms?: SdmsService) {}

  private isSuperAdminRole(role?: string): boolean {
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

  private hasSuperAdminAccess(user: {
    role?: string;
    roles?: string[];
  }): boolean {
    return (
      this.isSuperAdminRole(user.role) ||
      (user.roles ?? []).some((role) => this.isSuperAdminRole(role))
    );
  }

  private isUserActive(user: { isActive?: boolean; status?: string }) {
    if (user.isActive === false) return false;
    if (user.status?.toLowerCase() === 'inactive') return false;
    return true;
  }

  async login(dto: { username: string; password: string }) {
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
      role: 'super_admin' as const,
      fullName,
    };

    const accessToken = jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'],
    });

    return {
      accessToken,
      user: {
        id: userId,
        username: payload.username,
        fullName,
        role: 'super_admin' as const,
      },
    };
  }

  /**
   * Student portal login against SDMS student_credentials.
   * Lookup by username / admission / PIN, then bcrypt.compare(password, password_hash).
   */
  async studentLogin(dto: { pinNo: string; password: string }) {
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
      role: 'student' as const,
      pinNo,
      studentId: student.id,
      fullName: student.studentName,
    };

    const accessToken = jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'],
    });

    return {
      accessToken,
      user: {
        id: String(student.id),
        username: pinNo,
        fullName: student.studentName,
        role: 'student' as const,
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

  async validateUser(userId: string) {
    const user = await HrmsUserModel.findById(userId).exec();
    if (!user || !this.isUserActive(user) || !this.hasSuperAdminAccess(user)) {
      return null;
    }
    return user;
  }
}
