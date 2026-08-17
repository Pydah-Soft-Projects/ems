'use strict';

const { buildMysqlSslOptions } = require('../config/mysql-ssl');
const { config } = require('../config');

function buildExamPortalMysqlOptions() {
  const db = config.examPortalDb;
  return {
    type: 'mysql',
    host: db.host,
    port: db.port,
    username: db.user,
    password: db.password,
    database: db.name,
    timezone: '+05:30',
    dateStrings: true,
    synchronize: db.synchronize,
    charset: 'utf8mb4',
    ssl: buildMysqlSslOptions(db.ssl),
  };
}

function buildStudentMysqlOptions() {
  const db = config.studentDb;
  return {
    type: 'mysql',
    host: db.host,
    port: db.port,
    username: db.user,
    password: db.password,
    database: db.name,
    timezone: '+05:30',
    dateStrings: true,
    synchronize: false,
    charset: 'utf8mb4',
    ssl: buildMysqlSslOptions(db.ssl),
  };
}

function buildSqliteOptions(database) {
  return {
    type: 'sqlite',
    database,
    synchronize: true,
  };
}

module.exports = {
  buildExamPortalMysqlOptions,
  buildStudentMysqlOptions,
  buildSqliteOptions,
};
