export default () => ({
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  apiPrefix: process.env.API_PREFIX || 'api',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',

  jwt: {
    secret: process.env.JWT_SECRET || 'change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  },

  /** HRMS MongoDB — Super Admin authentication only */
  hrms: {
    mongodbUri: process.env.HRMS_MONGODB_URI || '',
    usersCollection: process.env.HRMS_USERS_COLLECTION || 'users',
    /** Role value stored on HRMS user document for Super Admin */
    superAdminRole:
      process.env.HRMS_SUPER_ADMIN_ROLE || 'super_admin',
  },

  /**
   * Exam Portal MySQL — EMS primary database
   * (regulations, subjects, exams, fees, payments)
   */
  examPortalDb: {
    host:
      process.env.EXAM_PORTAL_DB_HOST ||
      'student-database.cfu0qmo26gh3.ap-south-1.rds.amazonaws.com',
    port: parseInt(process.env.EXAM_PORTAL_DB_PORT || '3306', 10),
    user: process.env.EXAM_PORTAL_DB_USER || 'admin',
    password: process.env.EXAM_PORTAL_DB_PASSWORD || '',
    name: process.env.EXAM_PORTAL_DB_NAME || 'examination_portal',
    ssl: (process.env.EXAM_PORTAL_DB_SSL || 'true') === 'true',
    synchronize: (process.env.EXAM_PORTAL_DB_SYNCHRONIZE || 'true') === 'true',
  },

  /**
   * Student MySQL — existing student master database on same RDS cluster
   * (read-only; used later for SDMS / student data integration)
   */
  studentDb: {
    host:
      process.env.STUDENT_DB_HOST ||
      'student-database.cfu0qmo26gh3.ap-south-1.rds.amazonaws.com',
    port: parseInt(process.env.STUDENT_DB_PORT || '3306', 10),
    user: process.env.STUDENT_DB_USER || 'admin',
    password: process.env.STUDENT_DB_PASSWORD || '',
    name: process.env.STUDENT_DB_NAME || 'student_database',
    ssl: (process.env.STUDENT_DB_SSL || 'true') === 'true',
  },

  /** Local simulation only — set SIMULATE_USE_SQLITE=true in simulate script */
  simulate: {
    useSqlite: process.env.SIMULATE_USE_SQLITE === 'true',
    sqlitePath: process.env.SIMULATE_SQLITE_PATH || './data/simulate.sqlite',
  },
});
