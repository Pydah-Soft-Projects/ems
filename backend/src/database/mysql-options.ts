import { buildMysqlSslOptions } from '../config/mysql-ssl';
import { config } from '../config';

export function buildExamPortalMysqlOptions() {
  const db = config.examPortalDb;
  return {
    type: 'mysql' as const,
    host: db.host,
    port: db.port,
    username: db.user,
    password: db.password,
    database: db.name,
    synchronize: db.synchronize,
    charset: 'utf8mb4' as const,
    ssl: buildMysqlSslOptions(db.ssl),
  };
}

export function buildStudentMysqlOptions() {
  const db = config.studentDb;
  return {
    type: 'mysql' as const,
    host: db.host,
    port: db.port,
    username: db.user,
    password: db.password,
    database: db.name,
    synchronize: false,
    charset: 'utf8mb4' as const,
    ssl: buildMysqlSslOptions(db.ssl),
  };
}

export function buildSqliteOptions(database: string) {
  return {
    type: 'sqlite' as const,
    database,
    synchronize: true,
  };
}
