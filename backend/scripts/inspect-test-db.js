'use strict';

const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('node:path');
const { buildMysqlSslOptions } = require('../src/config/mysql-ssl');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function check() {
  const conn = await mysql.createConnection({
    host: process.env.EXAM_PORTAL_DB_HOST,
    port: process.env.EXAM_PORTAL_DB_PORT,
    user: process.env.EXAM_PORTAL_DB_USER,
    password: process.env.EXAM_PORTAL_DB_PASSWORD,
    database: 'examination_portal_testing',
    ssl: buildMysqlSslOptions(true),
  });

  const [tables] = await conn.query('SHOW TABLES');
  const counts = {};
  for (const row of tables) {
    const tableName = Object.values(row)[0];
    const [c] = await conn.query(`SELECT COUNT(*) as count FROM \`${tableName}\``);
    counts[tableName] = c[0].count;
  }
  console.log('Row counts in examination_portal_testing:', JSON.stringify(counts, null, 2));
  await conn.end();
}

check().catch((err) => console.error(err));

