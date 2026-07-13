export interface LoginDto {
  /** HRMS Super Admin email (field name kept as `username` for API compatibility) */
  username: string;
  password: string;
}
