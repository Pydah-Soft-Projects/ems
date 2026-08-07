'use strict';

module.exports = () => ({
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  apiPrefix: process.env.API_PREFIX || 'api',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  jwt: {
    secret: process.env.JWT_SECRET || 'change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
  hrms: {
    mongodbUri: process.env.HRMS_MONGODB_URI || '',
    usersCollection: process.env.HRMS_USERS_COLLECTION || 'users',
    superAdminRole: process.env.HRMS_SUPER_ADMIN_ROLE || 'super_admin',
  },
  ems: {
    bootstrapSuperAdminEmail:
      process.env.EMS_BOOTSTRAP_SUPERADMIN_EMAIL || 'ravi@pydahsoft.in',
  },
  feeManagement: {
    mongodbUri: process.env.FEE_MANAGEMENT_MONGODB_URI || '',
    examFeeHeadCode: process.env.FEE_MANAGEMENT_EXAM_FEE_HEAD_CODE || 'EXM01',
  },
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
  simulate: {
    useSqlite: process.env.SIMULATE_USE_SQLITE === 'true',
    sqlitePath: process.env.SIMULATE_SQLITE_PATH || './data/simulate.sqlite',
  },
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  },
  selfOnline: {
    enabled: (process.env.SELF_ONLINE_ENABLED || '').toLowerCase() === 'true',
    upiId: process.env.SELF_ONLINE_UPI_ID || '',
    merchantName: process.env.SELF_ONLINE_MERCHANT_NAME || '',
    paymentNote: process.env.SELF_ONLINE_PAYMENT_NOTE || '',
    expiryHours: parseInt(process.env.SELF_ONLINE_EXPIRY_HOURS || '0', 10) || 0,
  },
  canara: {
    enabled: (process.env.CANARA_ENABLED || '').toLowerCase() === 'true',
    mockMode: (process.env.CANARA_MOCK_MODE || '').toLowerCase() === 'true',
    clientId: process.env.CANARA_CLIENT_ID || '',
    clientSecret: process.env.CANARA_CLIENT_SECRET || '',
    baseUrl:
      process.env.CANARA_BASE_URL || 'https://api.canarauat.bank.in',
    scope: process.env.CANARA_SCOPE || '',
    oauthRedirectUri: process.env.CANARA_OAUTH_REDIRECT_URI || '',
    mid: process.env.CANARA_MID || '',
    accountNumber: process.env.CANARA_ACCOUNT_NUMBER || '2400201001060',
    symmetricKey: process.env.CANARA_SYMMETRIC_KEY || '',
    privateKeyPem: process.env.CANARA_PRIVATE_KEY_PEM || '',
    publicCertPem: process.env.CANARA_PUBLIC_CERT_PEM || '',
  },
  publicAppUrl:
    process.env.PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.CORS_ORIGIN ||
    'http://localhost:3000',
  publicApiUrl:
    process.env.PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    `http://localhost:${parseInt(process.env.PORT || '4000', 10)}`,
});
