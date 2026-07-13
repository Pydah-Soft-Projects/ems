import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { config } from '../config';
import { AppError } from '../common/errors';
import { HrmsUserModel } from './hrms-user.model';

export class AuthService {
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
    const payload = {
      sub: userId,
      username: user.email || email,
      role: 'super_admin' as const,
    };

    const accessToken = jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'],
    });

    return {
      accessToken,
      user: {
        id: userId,
        username: payload.username,
        fullName: user.name || user.email || 'Super Admin',
        role: 'super_admin' as const,
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
