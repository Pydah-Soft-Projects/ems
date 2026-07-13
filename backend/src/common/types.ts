export interface AuthUser {
  sub: string;
  username: string;
  role: 'super_admin';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
