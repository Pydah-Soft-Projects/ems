'use strict';

const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('node:path');
const { buildMysqlSslOptions } = require('../src/config/mysql-ssl');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function main() {
  const host = process.env.EXAM_PORTAL_DB_HOST;
  const port = parseInt(process.env.EXAM_PORTAL_DB_PORT || '3306', 10);
  const user = process.env.EXAM_PORTAL_DB_USER || 'admin';
  const password = process.env.EXAM_PORTAL_DB_PASSWORD || '';
  const testDbName = 'examination_portal_testing';
  const ssl = (process.env.EXAM_PORTAL_DB_SSL || 'true') === 'true';

  console.log(`Connecting to RDS MySQL at ${host}:${port} as ${user}...`);
  const connection = await mysql.createConnection({
    host,
    port,
    user,
    password,
    ssl: buildMysqlSslOptions(ssl),
  });

  console.log(`Creating database '${testDbName}' if it does not exist...`);
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${testDbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );

  const [rows] = await connection.query(
    `SHOW DATABASES LIKE '${testDbName}'`
  );
  console.log(`Database '${testDbName}' is ready on RDS!`);
  console.log('Result:', rows);

  await connection.end();
}

main().catch((err) => {
  console.error('Failed to create examination_portal_testing:', err.message);
  process.exit(1);
});

