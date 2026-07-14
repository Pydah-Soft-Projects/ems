export interface AuthUser {
  sub: string;
  username: string;
  role: 'super_admin' | 'student';
  /** Present for student JWT */
  pinNo?: string;
  studentId?: number;
  fullName?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
